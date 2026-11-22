import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';
import path from 'node:path';
import { test } from 'node:test';
import { setTimeout } from 'node:timers/promises';
import { indiaDateKey } from '../frontend/india-date.js';
import { generateAutonomousPayloadFromPython } from './autonomous-notice-fixture.js';

const STANDALONE_DIR = path.resolve(import.meta.dirname, '../.next/standalone');
const INGEST_TOKEN = 'test-ingest-token-1234567890abcdef1234567890';

interface FixtureJob {
  id: string;
  postName: string;
  source: { name: string };
  vacancies: number;
  payLevel: string;
  applicationLastDate: string | null;
  educationRequired: string | null;
  publishedAt?: string;
}

test(
  'committed job corrections refresh the production frontend at the right scope',
  { skip: process.env.APTUS_TEST_JOB_EDIT_CACHE !== '1' },
  async (t) => {
    const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
    assert.equal(databaseUrl.hostname, '127.0.0.1');
    assert.equal(databaseUrl.pathname, '/aptus_preparation_test');
    assert.equal(process.env.DATABASE_URL, process.env.TEST_DATABASE_URL);
    const redisUrl = new URL(process.env.JOBS_REDIS_URL ?? '');
    assert.equal(redisUrl.hostname, '127.0.0.1');
    const { createClient } = await import('redis');
    const redis = createClient({ url: redisUrl.href });
    redis.on('error', () => {});
    await redis.connect();
    t.after(() => redis.destroy());
    const { PrismaPg } = await import('@prisma/adapter-pg');
    const { PrismaClient } = await import('../generated/prisma/index.js');
    const { prisma } = await import('../src/db.js');
    const { buildApp } = await import('../src/app.js');
    assert.equal(
      await prisma.post.count(),
      0,
      'Use a disposable empty database',
    );
    t.after(() => prisma.$disconnect());

    const detailQueries: string[] = [];
    const versionQueries: string[] = [];
    const listingQueries: string[] = [];
    const listingVersions: string[] = [];
    const client = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl.href }),
      log: [{ level: 'query', emit: 'event' }],
    });
    t.after(() => client.$disconnect());
    client.$on('query', ({ query }) => {
      if (query.includes('p.xmin::text')) versionQueries.push(query);
      if (query.includes('"JobsListingRevision"')) listingVersions.push(query);
      if (
        query.includes('"Post"."reviewedDetails"') &&
        query.includes('"Post"."categoryRelaxationRules"')
      ) {
        detailQueries.push(query);
      }
      if (
        query.includes('"Post"."applicationLastDate"') &&
        !query.includes('"Post"."categoryRelaxationRules"')
      ) {
        listingQueries.push(query);
      }
    });
    let holdRead: (() => Promise<void>) | undefined;
    let holdListing: (() => Promise<void>) | undefined;
    const database = client.$extends({
      query: {
        post: {
          async findMany({ args, query }) {
            const result = await query(args);
            if (holdListing) await holdListing();
            return result;
          },
          async findUnique({ args, query }) {
            const result = await query(args);
            if (holdRead) await holdRead();
            return result;
          },
        },
      },
    });

    const env: NodeJS.ProcessEnv = {
      INGEST_TOKEN,
      JOBS_REDIS_URL: redisUrl.href,
    };
    const api = buildApp(undefined, env, database as unknown as typeof prisma);
    const reads: string[] = [];
    api.addHook('onRequest', async (request) => {
      if (request.method === 'GET' && request.url.startsWith('/api/jobs'))
        reads.push(request.url.split('?')[0]!);
    });
    const apiOrigin = await api.listen({ host: '127.0.0.1', port: 0 });
    t.after(() => api.close());
    const frontend = await startStandaloneServer({
      BACKEND_INTERNAL_URL: apiOrigin,
      APTUS_JOBS_CACHE_SECONDS: '7200',
    });
    t.after(() => frontend.stop());
    const refreshCalls: string[] = [];
    let failRefresh = false;
    const relay = http.createServer(async (request, response) => {
      const url = request.url ?? '/';
      refreshCalls.push(url);
      if (failRefresh) {
        response.writeHead(503).end();
        return;
      }
      try {
        const result = await fetch(frontend.origin + url, {
          method: 'POST',
          headers: { Authorization: request.headers.authorization ?? '' },
        });
        response.writeHead(result.status).end(await result.text());
      } catch {
        response.writeHead(502).end();
      }
    });
    relay.listen(0, '127.0.0.1');
    await once(relay, 'listening');
    env.FRONTEND_REVALIDATE_URL = `http://127.0.0.1:${(relay.address() as { port: number }).port}/api/revalidate-jobs`;
    t.after(() => new Promise<void>((resolve) => relay.close(() => resolve())));

    const edit = (payload: Record<string, unknown>) =>
      fetch(apiOrigin + '/api/internal/ingest', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${INGEST_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    const read = async (path: string) => {
      const result = await fetch(frontend.origin + path);
      assert.equal(result.status, 200);
      return result.text();
    };
    const jobB = await prisma.post.create({
      data: {
        postName: 'Fixture sibling job',
        sourceId: (
          await prisma.source.create({
            data: {
              name: 'Fixture sibling source',
              url: 'https://example.org/sibling',
            },
          })
        ).id,
      },
    });
    const newest = '/?sort=newest';
    const requestListing = async (query = 'pageSize=10') => {
      const response = await fetch(apiOrigin + `/api/jobs?${query}`);
      assert.equal(response.status, 200);
      return (await response.json()).data as FixtureJob[];
    };
    const listingKeys = () => redis.keys('hodivo:jobs:listing:v1:*');
    const counts = () => ({
      upstream: reads.filter((path) => path === '/api/jobs').length,
      listing: listingQueries.length,
      versions: listingVersions.length,
    });
    function resetListingCounts() {
      reads.length = 0;
      listingQueries.length = 0;
      listingVersions.length = 0;
    }
    assert.match(await read('/'), /Fixture sibling job/);
    assert.match(await read(newest), /Fixture sibling job/);
    await read(`/jobs/${jobB.id}`);
    assert.deepEqual(counts(), { upstream: 1, listing: 2, versions: 2 });
    const [previousListingKey] = await listingKeys();
    assert.ok(previousListingKey);
    resetListingCounts();
    const initial = await edit(generateAutonomousPayloadFromPython({}));
    assert.equal(initial.status, 200);
    const created = await initial.json();
    assert.equal(created.cache_refresh, 'ok');
    const [jobA] = created.post_ids as string[];
    assert.ok(jobA);
    assert.match(await read('/'), /Headmaster/);
    assert.match(await read(newest), /Headmaster/);
    assert.deepEqual(counts(), { upstream: 3, listing: 6, versions: 2 });
    resetListingCounts();
    assert.equal((await requestListing())[0]?.id, jobA);
    assert.deepEqual(counts(), { upstream: 1, listing: 0, versions: 1 });
    assert.equal((await listingKeys()).length, 2);
    const midnight = Date.parse(`${indiaDateKey()}T18:30:00Z`);
    assert.equal(
      await redis.sendCommand(['PEXPIRETIME', previousListingKey]),
      midnight,
    );
    resetListingCounts();
    await requestListing('pageSize=10&q=Headmaster');
    assert.deepEqual(counts(), { upstream: 1, listing: 2, versions: 0 });
    const warmListingKeys = (await listingKeys()).sort();
    const detailKeys = (id: string) =>
      redis.keys(`hodivo:jobs:detail:v1:${id}:*`);
    const requestDetail = (id: string) => fetch(apiOrigin + `/api/jobs/${id}`);
    const list = '/?sort=soonest&q=Headmaster';
    assert.match(await read(list), /Headmaster/);
    await read(`/jobs/${jobA}`);
    await read(`/jobs/${jobB.id}`);
    assert.equal((await detailKeys(jobA)).length, 1);
    assert.equal((await detailKeys(jobB.id)).length, 1);
    reads.length = 0;
    refreshCalls.length = 0;
    detailQueries.length = 0;
    versionQueries.length = 0;

    resetListingCounts();
    const detail = await edit(
      generateAutonomousPayloadFromPython({
        selectionStep: 'Fixture written assessment',
      }),
    );
    assert.equal(detail.status, 200);
    assert.equal((await detail.json()).cache_refresh, 'ok');
    assert.match(await read(`/jobs/${jobA}`), /Fixture written assessment/);
    await read(`/jobs/${jobB.id}`);
    await read(list);
    await read('/');
    await read(newest);
    assert.deepEqual(counts(), { upstream: 0, listing: 0, versions: 0 });
    assert.deepEqual((await listingKeys()).sort(), warmListingKeys);
    assert.deepEqual(reads, [`/api/jobs/${jobA}`]);
    assert.deepEqual(refreshCalls, [`/api/revalidate-jobs?jobId=${jobA}`]);
    assert.equal(detailQueries.length, 1);
    assert.equal(versionQueries.length, 2);
    detailQueries.length = 0;
    versionQueries.length = 0;
    assert.match(
      await (await requestDetail(jobA)).text(),
      /Fixture written assessment/,
    );
    assert.equal(detailQueries.length, 0);
    assert.equal(versionQueries.length, 1);
    const currentKeys = await detailKeys(jobA);
    const ttls = await Promise.all(currentKeys.map((key) => redis.ttl(key)));
    assert.equal(currentKeys.length, 2);
    assert.ok(ttls.every((ttl) => ttl > 86_380 && ttl <= 86_400));

    const listEdit = generateAutonomousPayloadFromPython({
      selectionStep: 'Fixture written assessment',
      vacancies: 150,
      payLevel: 'Level-10',
    });
    await prisma.$executeRaw`CREATE FUNCTION reject_fixture_correction()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'fixture correction rejected'; END;
      $$`;
    await prisma.$executeRaw`CREATE TRIGGER reject_fixture_correction
      BEFORE UPDATE ON "Post" FOR EACH ROW WHEN (NEW.vacancies = 150)
      EXECUTE FUNCTION reject_fixture_correction()`;
    refreshCalls.length = 0;
    const revisionBeforeFailure =
      await prisma.$queryRaw`SELECT "revision" FROM "JobsListingRevision"`;
    const failedWrite = await edit(listEdit);
    assert.deepEqual(
      await prisma.$queryRaw`SELECT "revision" FROM "JobsListingRevision"`,
      revisionBeforeFailure,
    );
    assert.equal(failedWrite.status, 503);
    assert.deepEqual(refreshCalls, []);
    assert.equal(
      (await prisma.post.findUniqueOrThrow({ where: { id: jobA } })).vacancies,
      120,
    );
    detailQueries.length = 0;
    assert.match(
      await (await requestDetail(jobA)).text(),
      /Fixture written assessment/,
    );
    assert.equal(detailQueries.length, 0);
    assert.deepEqual((await detailKeys(jobA)).sort(), currentKeys.sort());
    await prisma.$executeRaw`DROP TRIGGER reject_fixture_correction ON "Post"`;
    await prisma.$executeRaw`DROP FUNCTION reject_fixture_correction()`;

    await redis.del(await listingKeys());
    const listFetched = Promise.withResolvers<void>();
    const releaseListing = Promise.withResolvers<void>();
    holdListing = async () => {
      holdListing = undefined;
      listFetched.resolve();
      await releaseListing.promise;
    };
    const staleListing = requestListing();
    let listing: Response;
    try {
      await Promise.race([
        listFetched.promise,
        setTimeout(5_000, undefined, { ref: false }).then(() => {
          throw new Error('Timed out waiting for the overlapping listing read');
        }),
      ]);
      resetListingCounts();
      listing = await edit(listEdit);
      assert.match(await read('/'), /Level-10/);
      assert.deepEqual(counts(), { upstream: 3, listing: 6, versions: 2 });
    } finally {
      releaseListing.resolve();
    }
    assert.equal((await staleListing)[0]?.vacancies, 120);
    assert.equal((await listingKeys()).length, 1);
    resetListingCounts();
    assert.equal((await requestListing())[0]?.vacancies, 150);
    assert.deepEqual(counts(), { upstream: 1, listing: 0, versions: 1 });
    assert.equal(listing.status, 200);
    assert.equal((await listing.json()).cache_refresh, 'ok');
    assert.deepEqual(refreshCalls, [
      `/api/revalidate-jobs?jobId=${jobA}`,
      '/api/revalidate-jobs',
    ]);
    reads.length = 0;
    assert.match(await read(list), /Level-10/);
    assert.match(await read(`/jobs/${jobA}`), /Level-10/);
    await read(`/jobs/${jobB.id}`);
    assert.deepEqual(reads, ['/api/jobs', `/api/jobs/${jobA}`]);

    refreshCalls.length = 0;
    failRefresh = true;
    const failedRefresh = await edit(
      generateAutonomousPayloadFromPython({
        selectionStep: 'Fixture interview',
        vacancies: 150,
        payLevel: 'Level-10',
      }),
    );
    assert.equal(failedRefresh.status, 200);
    assert.equal((await failedRefresh.json()).cache_refresh, 'failed');
    assert.equal(refreshCalls.length, 2);
    const committed = await prisma.post.findUniqueOrThrow({
      where: { id: jobA },
    });
    assert.match(
      JSON.stringify(committed.reviewedDetails),
      /Fixture interview/,
    );
    failRefresh = false;

    const correctedPayload = (selectionStep: string) =>
      generateAutonomousPayloadFromPython({
        selectionStep,
        vacancies: 150,
        payLevel: 'Level-10',
      });
    assert.match(await (await requestDetail(jobA)).text(), /Fixture interview/);
    const oldKeys = await detailKeys(jobA);
    await redis.del(oldKeys);
    const fetched = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    holdRead = async () => {
      holdRead = undefined;
      fetched.resolve();
      await release.promise;
    };
    const staleRead = requestDetail(jobA);
    try {
      await Promise.race([
        fetched.promise,
        setTimeout(5_000, undefined, { ref: false }).then(() => {
          throw new Error('Timed out waiting for the overlapping detail read');
        }),
      ]);
      assert.equal(
        (await edit(correctedPayload('Fixture new practical'))).status,
        200,
      );
    } finally {
      release.resolve();
    }
    assert.match(await (await staleRead).text(), /Fixture interview/);
    assert.deepEqual(await detailKeys(jobA), []);
    assert.match(await read(`/jobs/${jobA}`), /Fixture new practical/);

    const outageEdit = generateAutonomousPayloadFromPython({
      selectionStep: 'Fixture final practical',
      vacancies: 150,
      payLevel: 'Level-11',
    });
    resetListingCounts();
    await redis.sendCommand(['CLIENT', 'PAUSE', '2000', 'ALL']);
    detailQueries.length = 0;
    try {
      assert.equal((await edit(outageEdit)).status, 200);
      assert.match(await read(`/jobs/${jobA}`), /Fixture final practical/);
      assert.equal(detailQueries.length, 1);
      resetListingCounts();
      assert.equal((await requestListing())[0]?.payLevel, 'Level-11');
      assert.deepEqual(counts(), { upstream: 1, listing: 2, versions: 1 });
    } finally {
      await redis.sendCommand(['CLIENT', 'UNPAUSE']);
    }
    assert.match(
      await (await requestDetail(jobA)).text(),
      /Fixture final practical/,
    );
    resetListingCounts();
    assert.equal((await requestListing())[0]?.payLevel, 'Level-11');
    assert.deepEqual(counts(), { upstream: 1, listing: 2, versions: 2 });
    resetListingCounts();
    assert.equal((await requestListing())[0]?.payLevel, 'Level-11');
    assert.deepEqual(counts(), { upstream: 1, listing: 0, versions: 1 });
    detailQueries.length = 0;
    assert.match(
      await (await requestDetail(jobA)).text(),
      /Fixture final practical/,
    );
    assert.equal(detailQueries.length, 0);

    const source = await prisma.source.findUniqueOrThrow({
      where: { id: committed.sourceId },
    });
    refreshCalls.length = 0;
    resetListingCounts();
    const withdrawal = await edit({
      source_url: source.url,
      source_name: source.name,
      posts: [{ post_name: 'Replacement fixture' }],
    });
    assert.equal(withdrawal.status, 200);
    assert.doesNotMatch(await read(newest), /Headmaster/);
    assert.match(await read('/'), /Replacement fixture/);
    assert.deepEqual(counts(), { upstream: 3, listing: 6, versions: 2 });
    assert.deepEqual(refreshCalls, [
      `/api/revalidate-jobs?jobId=${jobA}`,
      '/api/revalidate-jobs',
    ]);
    assert.equal((await requestDetail(jobA)).status, 404);
    reads.length = 0;
    detailQueries.length = 0;
    const withdrawnPage = await fetch(frontend.origin + `/jobs/${jobA}`);
    assert.equal(withdrawnPage.status, 404);
    assert.doesNotMatch(await withdrawnPage.text(), /Fixture final practical/);
    await read(`/jobs/${jobB.id}`);
    assert.deepEqual(reads, [`/api/jobs/${jobA}`]);
    assert.equal(detailQueries.length, 0);

    await prisma.post.update({
      where: { id: jobB.id },
      data: { applicationLastDate: new Date(`${indiaDateKey()}T00:00:00Z`) },
    });
    assert.ok((await requestListing()).some(({ id }) => id === jobB.id));
    t.mock.timers.enable({ apis: ['Date'], now: midnight });
    try {
      resetListingCounts();
      assert.ok(!(await requestListing()).some(({ id }) => id === jobB.id));
      assert.deepEqual(counts(), { upstream: 1, listing: 2, versions: 2 });
    } finally {
      t.mock.timers.reset();
    }
  },
);

function makeJob(id: string, postName: string): FixtureJob {
  return {
    id,
    postName,
    source: { name: 'Staff Selection Commission' },
    vacancies: 5,
    payLevel: 'Level 5',
    applicationLastDate: '2026-12-31',
    educationRequired: 'Diploma',
  };
}

class BackendController {
  public server: http.Server;
  public port = 0;
  public jobsCalls = 0;
  public recordedQueries: string[] = [];
  public mode: 'ok' | 'fail' = 'ok';
  public currentVersion = 'v1';
  public detailVersion = 'v1';
  public detailCalls: string[] = [];

  constructor() {
    this.server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname === '/api/jobs') {
        this.jobsCalls++;
        this.recordedQueries.push(url.search);

        if (this.mode === 'fail') {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Service Unavailable' }));
          return;
        }

        const sort = url.searchParams.get('sort') ?? 'newest';
        const page = Number(url.searchParams.get('page') ?? '1');
        const q = url.searchParams.get('q') ?? '';

        const jobs = [
          makeJob(
            `job-${this.currentVersion}-${sort}-p${page}${q ? `-${q}` : ''}`,
            `Technical Assistant ${this.currentVersion} ${sort} Page ${page}${q ? ` (${q})` : ''}`,
          ),
        ];

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            data: jobs,
            pagination: { page, pageSize: 6, totalItems: 12, totalPages: 2 },
          }),
        );
        return;
      }

      const detail = /^\/api\/jobs\/(job-a|job-b)$/.exec(url.pathname);
      if (detail) {
        const id = detail[1]!;
        this.detailCalls.push(id);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify(makeJob(id, `Detail ${id} ${this.detailVersion}`)),
        );
        return;
      }
      res.writeHead(404).end();
    });
  }

  async listen(): Promise<number> {
    this.server.listen(0, '127.0.0.1');
    await once(this.server, 'listening');
    const addr = this.server.address();
    assert(addr && typeof addr !== 'string');
    this.port = addr.port;
    return this.port;
  }

  async close(): Promise<void> {
    return new Promise((resolve) => this.server.close(() => resolve()));
  }
}

async function startStandaloneServer(
  envOverrides: Record<string, string> = {},
) {
  // Find a free port
  const tmpSrv = http.createServer();
  tmpSrv.listen(0, '127.0.0.1');
  await once(tmpSrv, 'listening');
  const port = (tmpSrv.address() as { port: number }).port;
  await new Promise<void>((r) => tmpSrv.close(() => r()));

  const serverProc: ChildProcess = spawn(process.execPath, ['server.js'], {
    cwd: STANDALONE_DIR,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
      INGEST_TOKEN,
      ...envOverrides,
    },
    stdio: 'pipe',
  });

  let output = '';
  serverProc.stdout?.on('data', (d) => {
    output += String(d);
  });
  serverProc.stderr?.on('data', (d) => {
    output += String(d);
  });

  // Wait for server ready
  const origin = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`${origin}/how-it-works`);
      if (res.ok) {
        ready = true;
        break;
      }
    } catch {
      // wait
    }
    await setTimeout(100);
  }

  if (!ready) {
    serverProc.kill();
    throw new Error(
      `Standalone server failed to start on ${origin}. Output:\n${output}`,
    );
  }

  return {
    origin,
    port,
    proc: serverProc,
    async stop() {
      serverProc.kill();
      await new Promise<void>((r) => {
        if (serverProc.exitCode !== null) return r();
        serverProc.once('exit', () => r());
      });
    },
  };
}

test('production standalone execution path cache regression', async (t) => {
  const backend = new BackendController();
  await backend.listen();
  t.after(() => backend.close());

  // 1. Start standalone server with default 2-hour cache (no APTUS_JOBS_CACHE_SECONDS override)
  const standalone = await startStandaloneServer({
    BACKEND_INTERNAL_URL: `http://127.0.0.1:${backend.port}`,
  });
  t.after(() => standalone.stop());

  await t.test(
    'two identical sequential Home requests cause exactly one backend call',
    async () => {
      backend.jobsCalls = 0;
      backend.recordedQueries = [];
      backend.currentVersion = 'v1';

      // Request 1: GET /?sort=soonest
      const res1 = await fetch(`${standalone.origin}/?sort=soonest`);
      assert.equal(res1.status, 200);
      const text1 = await res1.text();
      assert.ok(text1.includes('Technical Assistant v1 soonest Page 1'));
      assert.equal(backend.jobsCalls, 1, 'First request must query backend');

      // Request 2: GET /?sort=soonest
      const res2 = await fetch(`${standalone.origin}/?sort=soonest`);
      assert.equal(res2.status, 200);
      const text2 = await res2.text();
      assert.ok(text2.includes('Technical Assistant v1 soonest Page 1'));
      assert.equal(
        backend.jobsCalls,
        1,
        'Second identical request must be served from cache',
      );
    },
  );

  await t.test(
    'a different sort/filter/page receives the correct distinct result',
    async () => {
      backend.jobsCalls = 0;

      // Different sort: furthest
      const resFurthest = await fetch(`${standalone.origin}/?sort=furthest`);
      assert.equal(resFurthest.status, 200);
      const textFurthest = await resFurthest.text();
      assert.ok(
        textFurthest.includes('Technical Assistant v1 furthest Page 1'),
      );
      assert.equal(backend.jobsCalls, 1, 'Different sort must query backend');

      // Different page: page 2
      const resPage2 = await fetch(`${standalone.origin}/?sort=soonest&page=2`);
      assert.equal(resPage2.status, 200);
      const textPage2 = await resPage2.text();
      assert.ok(textPage2.includes('Technical Assistant v1 soonest Page 2'));
      assert.equal(backend.jobsCalls, 2, 'Different page must query backend');

      // Different query: q=Assistant
      const resFilter = await fetch(
        `${standalone.origin}/?sort=soonest&q=Assistant`,
      );
      assert.equal(resFilter.status, 200);
      const textFilter = await resFilter.text();
      assert.ok(
        textFilter.includes(
          'Technical Assistant v1 soonest Page 1 (Assistant)',
        ),
      );
      assert.equal(
        backend.jobsCalls,
        3,
        'Different query filter must query backend',
      );
    },
  );

  await t.test(
    'publication invalidation makes changed data visible before expiry',
    async () => {
      backend.jobsCalls = 0;
      backend.currentVersion = 'v2';

      // Before invalidation, /?sort=soonest still returns cached v1
      const cachedRes = await fetch(`${standalone.origin}/?sort=soonest`);
      const cachedText = await cachedRes.text();
      assert.ok(cachedText.includes('Technical Assistant v1 soonest Page 1'));
      assert.equal(
        backend.jobsCalls,
        0,
        'Must still serve cached v1 before invalidation',
      );

      // Publish notification: POST /api/revalidate-jobs
      const revalRes = await fetch(`${standalone.origin}/api/revalidate-jobs`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${INGEST_TOKEN}`,
        },
      });
      assert.equal(revalRes.status, 200);
      const revalJson = (await revalRes.json()) as {
        revalidated: string;
        warmed: Record<string, boolean>;
      };
      assert.equal(revalJson.revalidated, 'jobs');
      assert.equal(revalJson.warmed.soonest, true);

      // Now GET /?sort=soonest immediately reflects the new v2 data
      const freshRes = await fetch(`${standalone.origin}/?sort=soonest`);
      assert.equal(freshRes.status, 200);
      const freshText = await freshRes.text();
      assert.ok(freshText.includes('Technical Assistant v2 soonest Page 1'));
    },
  );

  await t.test(
    'a valid jobId refreshes only the requested detail',
    async () => {
      const readDetail = async (id: string, version: string) => {
        const response = await fetch(`${standalone.origin}/jobs/${id}`);
        assert.equal(response.status, 200);
        assert.match(
          await response.text(),
          new RegExp(`Detail ${id} ${version}`),
        );
      };
      await readDetail('job-a', 'v1');
      await readDetail('job-b', 'v1');
      backend.detailVersion = 'v2';
      backend.currentVersion = 'v3';
      backend.detailCalls = [];
      backend.jobsCalls = 0;
      const revalidate = (query: string, token?: string) =>
        fetch(`${standalone.origin}/api/revalidate-jobs?${query}`, {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

      assert.equal((await revalidate('jobId=job-a')).status, 401);
      assert.equal(
        (await revalidate('jobId=job-a', INGEST_TOKEN + '-wrong')).status,
        401,
      );
      for (const query of [
        'jobId=',
        'jobId=job-a&jobId=job-b',
        'jobId=..%2Fjob-a',
        'jobId=%20job-a',
        'jobID=job-a',
      ]) {
        assert.equal((await revalidate(query, INGEST_TOKEN)).status, 400);
      }
      await readDetail('job-a', 'v1');
      assert.deepEqual(backend.detailCalls, []);

      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await revalidate('jobId=job-a', INGEST_TOKEN);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { revalidated: '/jobs/job-a' });
      }
      await readDetail('job-a', 'v2');
      await readDetail('job-b', 'v1');
      assert.deepEqual(backend.detailCalls, ['job-a']);
      const list = await fetch(`${standalone.origin}/?sort=soonest`);
      assert.equal(list.status, 200);
      assert.match(await list.text(), /Technical Assistant v2 soonest Page 1/);
      assert.equal(backend.jobsCalls, 0);
      const bulk = await revalidate('', INGEST_TOKEN);
      assert.equal(bulk.status, 200);
      const refreshed = await fetch(`${standalone.origin}/?sort=soonest`);
      assert.equal(refreshed.status, 200);
      assert.match(
        await refreshed.text(),
        /Technical Assistant v3 soonest Page 1/,
      );
      assert.deepEqual(backend.detailCalls, ['job-a']);
    },
  );

  // 2. Short-interval server to test expiry, stale-on-failure, and recovery
  const shortTtlServer = await startStandaloneServer({
    BACKEND_INTERNAL_URL: `http://127.0.0.1:${backend.port}`,
    APTUS_JOBS_CACHE_SECONDS: '1',
  });
  t.after(() => shortTtlServer.stop());

  await t.test(
    'expiry triggers a fresh backend read with short configurable interval',
    async () => {
      backend.jobsCalls = 0;
      backend.currentVersion = 'v3';

      // Populate cache
      const res1 = await fetch(`${shortTtlServer.origin}/?sort=soonest`);
      assert.equal(res1.status, 200);
      assert.ok(
        (await res1.text()).includes('Technical Assistant v3 soonest Page 1'),
      );
      assert.equal(backend.jobsCalls, 1);

      // Within 1s, cached
      const resFast = await fetch(`${shortTtlServer.origin}/?sort=soonest`);
      assert.equal(resFast.status, 200);
      assert.equal(
        backend.jobsCalls,
        1,
        'Within 1s interval must not call backend',
      );

      // Wait for 1s TTL to expire
      await setTimeout(1100);

      // Expiry triggers a fresh backend read
      backend.currentVersion = 'v4';
      const resExpired = await fetch(`${shortTtlServer.origin}/?sort=soonest`);
      assert.equal(resExpired.status, 200);
      const textExpired = await resExpired.text();
      assert.ok(textExpired.includes('Technical Assistant v4 soonest Page 1'));
      assert.equal(
        backend.jobsCalls,
        2,
        'Expired read must trigger fresh backend read',
      );
    },
  );

  await t.test(
    'after expiry, backend failure returns saved jobs with freshness warning, and recovery removes warning',
    async () => {
      // Step A: Wait for 1s TTL to expire
      await setTimeout(1100);

      // Simulate backend failure (503)
      backend.mode = 'fail';

      // Read after expiry during outage -> returns saved jobs with freshnessUnconfirmed notice
      const staleRes = await fetch(`${shortTtlServer.origin}/?sort=soonest`);
      assert.equal(staleRes.status, 200);
      const staleText = await staleRes.text();
      assert.ok(
        staleText.includes('Technical Assistant v4 soonest Page 1'),
        'Saved jobs must still be returned',
      );
      assert.ok(
        staleText.includes('Showing the last confirmed results'),
        'Freshness warning notice must be displayed',
      );

      // Step B: Backend failure without saved data produces error notice
      const uncachedRes = await fetch(
        `${shortTtlServer.origin}/?sort=soonest&q=never-cached-query`,
      );
      assert.equal(uncachedRes.status, 200);
      const uncachedText = await uncachedRes.text();
      assert.ok(
        uncachedText.includes('Jobs are temporarily unavailable'),
        'Failure without cached data must render unavailable notice',
      );

      // Step C: Upstream recovers
      backend.mode = 'ok';
      backend.currentVersion = 'v5';

      // Next read refreshes data and removes warning
      const recoveredRes = await fetch(
        `${shortTtlServer.origin}/?sort=soonest`,
      );
      assert.equal(recoveredRes.status, 200);
      const recoveredText = await recoveredRes.text();
      assert.ok(
        recoveredText.includes('Technical Assistant v5 soonest Page 1'),
        'Fresh recovered data must be displayed',
      );
      assert.ok(
        !recoveredText.includes('Showing the last confirmed results'),
        'Freshness warning notice must be removed',
      );
    },
  );
});

test(
  'Popular ranks all matching jobs and serves revisable Redis results',
  {
    skip: process.env.APTUS_TEST_POPULAR_JOBS !== '1',
  },
  async (t) => {
    const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
    assert.equal(databaseUrl.hostname, '127.0.0.1');
    assert.equal(databaseUrl.pathname, '/aptus_preparation_test');
    assert.equal(process.env.DATABASE_URL, process.env.TEST_DATABASE_URL);
    const redisUrl = new URL(process.env.JOBS_REDIS_URL ?? '');
    assert.equal(redisUrl.hostname, '127.0.0.1');
    const { createClient } = await import('redis');
    const { prisma } = await import('../src/db.js');
    const { PrismaPg } = await import('@prisma/adapter-pg');
    const { PrismaClient } = await import('../generated/prisma/index.js');
    const database = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl.href }),
      log: [{ level: 'query', emit: 'event' }],
    });
    t.after(() => database.$disconnect());
    const queries: string[] = [];
    database.$on('query', ({ query }) => queries.push(query));
    const { buildApp } = await import('../src/app.js');
    const { refreshJobVisitors, JOB_VISITORS_KEY } =
      await import('../src/lib/job-visitors.js');
    const redis = await createClient({ url: redisUrl.href }).connect();
    t.after(() => redis.destroy());
    t.after(() => prisma.$disconnect());
    assert.equal(await prisma.post.count(), 0);
    assert.equal(await redis.exists(JOB_VISITORS_KEY), 0);

    const source = await prisma.source.create({
      data: {
        url: 'https://example.org/popular-fixture',
        name: 'Fixture Jobs',
      },
    });
    const instant = new Date();
    const today = indiaDateKey(instant);
    await prisma.post.createMany({
      data: Array.from({ length: 12 }, (_, index) => ({
        id: `popular-${String(index).padStart(2, '0')}`,
        sourceId: source.id,
        postName:
          index < 3 ? `Technical Fixture ${index}` : `General Fixture ${index}`,
        publishedAt: new Date(instant.getTime() - (20 - index) * 60_000),
        minEducationLevel: index === 2 ? 'TENTH' : 'BACHELORS',
        applicationLastDate:
          index === 11 ? new Date(`${today}T00:00:00Z`) : null,
      })),
    });
    await prisma.post.update({
      where: { id: 'popular-02' },
      data: { publishedAt: new Date(instant.getTime() - 19 * 60_000) },
    });

    const config = {
      teamId: 'fixture-team',
      projectId: 'fixture-project',
      token: 'fixture',
    };
    const rows = Array.from({ length: 11 }, (_, index) => ({
      requestPath: `/jobs/popular-${String(index).padStart(2, '0')}`,
      visitors: [6, 3, 3][index] ?? 0,
      pageviews: [6, 7, 3][index] ?? 1,
    }));
    const fixture =
      (data = rows): typeof fetch =>
      async (input) => {
        const url = new URL(String(input));
        assert.equal(url.pathname, '/v1/query/web-analytics/visits/aggregate');
        assert.equal(url.searchParams.get('by'), 'requestPath');
        assert.equal(
          url.searchParams.get('filter'),
          "startswith(requestPath,'/jobs/')",
        );
        assert.equal(
          Date.parse(url.searchParams.get('until')!) -
            Date.parse(url.searchParams.get('since')!),
          7 * 86_400_000,
        );
        return Response.json({ data });
      };
    assert.equal(await refreshJobVisitors(redis, config, fixture()), 11);
    const first = await redis.hGetAll(JOB_VISITORS_KEY);
    assert.equal(await refreshJobVisitors(redis, config, fixture()), 0);
    assert.equal(
      await redis.hGet(JOB_VISITORS_KEY, '_revision'),
      first._revision,
    );
    assert.ok((await redis.pTTL(JOB_VISITORS_KEY)) > 3_590_000);

    const api = buildApp(
      undefined,
      {
        ...process.env,
        JOBS_REDIS_URL: redisUrl.href,
      },
      database,
    );
    t.after(() => api.close());
    const apiOrigin = await api.listen({ host: '127.0.0.1', port: 0 });
    const frontend = await startStandaloneServer({
      BACKEND_INTERNAL_URL: apiOrigin,
    });
    t.after(() => frontend.stop());
    const read = async (query: string) => {
      const started = performance.now();
      const response = await api.inject({
        method: 'GET',
        url: `/api/jobs?${query}`,
      });
      assert.equal(response.statusCode, 200);
      const { data } = response.json<{ data: FixtureJob[] }>();
      return {
        ids: data.map(({ id }) => id),
        elapsed: performance.now() - started,
      };
    };
    const newest = await read('pageSize=10');
    assert.equal(newest.ids[0], 'popular-11');
    assert.ok(!newest.ids.includes('popular-00'));
    const cold = await read('sort=popular&pageSize=10');
    assert.deepEqual(cold.ids.slice(0, 3), [
      'popular-00',
      'popular-01',
      'popular-02',
    ]);
    assert.deepEqual((await read('sort=popular&pageSize=10&page=2')).ids, [
      'popular-04',
      'popular-03',
    ]);
    assert.deepEqual(
      (
        await read(
          'sort=popular&q=Technical&qualification=BACHELORS&pageSize=1&page=2',
        )
      ).ids,
      ['popular-01'],
    );
    const [popularKey] = await redis.keys('hodivo:jobs:popular:v1:*');
    assert.ok(popularKey);
    const ttl = await redis.pTTL(popularKey);
    await setTimeout(25);
    queries.length = 0;
    const warm = await read('sort=popular&pageSize=10');
    assert.deepEqual(warm.ids, cold.ids);
    assert.equal(queries.length, 1);
    assert.match(queries[0], /JobsListingRevision/);
    assert.ok(
      (await redis.pTTL(popularKey)) < ttl,
      'warm read must not rewrite cache',
    );
    t.diagnostic(
      `Fastify cold ${cold.elapsed.toFixed(1)}ms, warm ${warm.elapsed.toFixed(1)}ms`,
    );

    const html = await (await fetch(frontend.origin + '/?sort=popular')).text();
    assert.match(html, /<option value="popular" selected="">Popular<\/option>/);
    assert.ok(
      html.indexOf('Technical Fixture 0') < html.indexOf('Technical Fixture 1'),
    );
    await fetch(apiOrigin + '/api/jobs/popular-00');
    const detailKeys = await redis.keys('hodivo:jobs:detail:v1:*');
    const newestKeys = await redis.keys('hodivo:jobs:listing:v1:*');
    assert.ok(detailKeys.length && newestKeys.length);
    const unrelatedEntries = await redis.mGet([...detailKeys, ...newestKeys]);

    const changed = structuredClone(rows);
    changed[1].visitors = 7;
    assert.equal(await refreshJobVisitors(redis, config, fixture(changed)), 1);
    assert.notEqual(
      await redis.hGet(JOB_VISITORS_KEY, '_revision'),
      first._revision,
    );
    assert.deepEqual(
      await redis.mGet([...detailKeys, ...newestKeys]),
      unrelatedEntries,
    );
    const updated = await (
      await fetch(frontend.origin + '/?sort=popular')
    ).text();
    assert.ok(
      updated.indexOf('Technical Fixture 1') <
        updated.indexOf('Technical Fixture 0'),
    );
    await prisma.post.update({
      where: { id: 'popular-01' },
      data: { postName: 'Updated Technical Fixture 1' },
    });
    assert.match(
      await (await fetch(frontend.origin + '/?sort=popular')).text(),
      /Updated Technical Fixture 1/,
    );

    const stored = await redis.hGetAll(JOB_VISITORS_KEY);
    for (const request of [
      async () => new Response(null, { status: 429 }),
      async () => {
        throw new DOMException('fixture timeout', 'TimeoutError');
      },
      fixture([{ ...rows[0], requestPath: 'Others' }]),
      fixture([{ ...rows[0], visitors: -1 }]),
    ]) {
      await assert.rejects(refreshJobVisitors(redis, config, request));
      assert.deepEqual(await redis.hGetAll(JOB_VISITORS_KEY), stored);
    }

    const { promise, resolve } = Promise.withResolvers<Response>();
    const older = refreshJobVisitors(redis, config, () => promise);
    await setTimeout(10);
    changed[1].visitors = 2;
    changed.splice(2, 1);
    assert.equal(await refreshJobVisitors(redis, config, fixture(changed)), 2);
    resolve(Response.json({ data: rows }));
    assert.equal(await older, null);
    assert.equal(await redis.hGet(JOB_VISITORS_KEY, 'popular-01'), '2');
    assert.equal(await redis.hGet(JOB_VISITORS_KEY, 'popular-02'), null);

    changed.push({
      requestPath: '/jobs/popular-11',
      visitors: 100,
      pageviews: 100,
    });
    assert.equal(await refreshJobVisitors(redis, config, fixture(changed)), 1);
    assert.equal((await read('sort=popular&pageSize=10')).ids[0], 'popular-11');
    const midnight = Date.parse(`${today}T18:30:00Z`);
    // Keep the snapshot usable so the date check exercises Popular, not fallback.
    await redis.hSet(JOB_VISITORS_KEY, '_refreshedAt', String(midnight - 1000));
    t.mock.timers.enable({ apis: ['Date'], now: midnight });
    try {
      const rollover = await read('sort=popular&pageSize=10');
      assert.equal(rollover.ids[0], 'popular-00');
      assert.ok(!rollover.ids.includes('popular-11'));
    } finally {
      t.mock.timers.reset();
    }
    await redis.hSet(
      JOB_VISITORS_KEY,
      '_refreshedAt',
      String(Date.now() - 3_600_000),
    );
    assert.deepEqual((await read('sort=popular&pageSize=10')).ids, newest.ids);
    await redis.del(JOB_VISITORS_KEY);
    assert.deepEqual((await read('sort=popular&pageSize=10')).ids, newest.ids);
  },
);
