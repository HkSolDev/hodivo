import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/index.js';
import { createExamCatalogue } from '../src/lib/typing-exam-catalogue.js';
import { registerTypingExamRoutes } from '../src/routes/typing-exams.js';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { createClient } from 'redis';
import { chromium, type Page } from 'playwright';
import Fastify from 'fastify';
import { registerTypingPracticeRoutes } from '../src/routes/typing-practice.js';
import { prisma } from '../src/db.js';

const redisUrl = process.env.TYPING_REDIS_URL;
const dbUrl = process.env.DATABASE_URL;

test(
  'production practice catalogue and text remain fresh across transactions',
  {
    skip: !process.env.TEST_TYPING_CACHE,
  },
  async (t) => {
    assert.equal(process.env.NODE_ENV, 'production');
    assert(redisUrl && dbUrl);
    for (const url of [redisUrl, dbUrl])
      assert.equal(new URL(url).hostname, '127.0.0.1');
    assert.equal(new URL(dbUrl).pathname, '/hodivo_typing_test');
    const redis = await createClient({ url: redisUrl }).connect();
    t.after(() => redis.destroy());

    const exam = await prisma.typingExam.create({
      data: { slug: 'synthetic-cache-proof', name: 'Synthetic exam' },
    });
    t.after(async () => {
      const versions = { examId: exam.id };
      await prisma.typingPassage.deleteMany({
        where: { examVersion: versions },
      });
      await prisma.typingExamVersion.deleteMany({ where: versions });
      await prisma.typingExam.delete({ where: { id: exam.id } });
      await prisma.$disconnect();
    });
    const reviewedAt = new Date('2026-11-13T00:00:00Z');
    const hash = (text: string) =>
      createHash('sha256').update(text).digest('hex');
    const version = await prisma.typingExamVersion.create({
      data: {
        examId: exam.id,
        versionKey: 'fixture',
        label: 'Synthetic version',
        language: 'en',
        status: 'PUBLISHED',
        durationSeconds: 600,
        targetWpm: 35,
        backspacePolicy: 'UNRESTRICTED',
        editingPolicy: 'native-correction-v1',
        ruleSourceUrl: 'https://example.com/synthetic',
        ruleSourceNote: 'Synthetic fixture',
        reviewedAt,
        publishedAt: reviewedAt,
      },
    });
    const target = 'synthetic12';
    const passages = Array.from({ length: 12 }, (_, index) => {
      const id = `synthetic${String(index + 1).padStart(2, '0')}`;
      return {
        id,
        examVersionId: version.id,
        contentKey: id,
        revision: 1,
        sourceKind: 'PRACTICE' as const,
        status: 'PUBLISHED' as const,
        title: `Passage ${index + 1}`,
        text: `Synthetic text ${index + 1}.`,
        contentHash: hash(`Synthetic text ${index + 1}.`),
        reviewedAt: index === 10 ? null : reviewedAt,
        publishedAt: reviewedAt,
      };
    });
    await prisma.typingPassage.createMany({ data: passages });

    const raw = prisma.$queryRaw.bind(prisma);
    let passageQueries = 0;
    let intercept: (() => Promise<void>) | undefined;
    const queryRaw = (async (
      query: TemplateStringsArray,
      ...args: unknown[]
    ) => {
      const result = await raw(query, ...args);
      if (query.join('').includes('SELECT p.')) {
        passageQueries++;
        if (intercept && query.join('').includes('p."text"')) await intercept();
      }
      return result;
    }) as typeof prisma.$queryRaw;

    const app = Fastify({ exposeHeadRoutes: false });
    registerTypingPracticeRoutes(app, undefined, { $queryRaw: queryRaw });
    const examDb = new PrismaClient({
      adapter: new PrismaPg({ connectionString: dbUrl }),
      log: [{ emit: 'event', level: 'query' }],
    });
    const examQueries: string[] = [];
    examDb.$on('query', (event) => examQueries.push(event.query));
    registerTypingExamRoutes(app, createExamCatalogue(examDb));
    t.after(() => app.close());
    t.after(() => examDb.$disconnect());
    const frontend = process.env.TEST_TYPING_FRONTEND;
    if (frontend) assert.equal(new URL(frontend).hostname, '127.0.0.1');
    const origin = await app.listen({
      host: '127.0.0.1',
      port: frontend ? 8081 : 0,
    });
    const catalogue = '/api/typing/practice-passages';
    const detail = `${catalogue}/${target}`;
    const examVersion = `/api/typing/exam-versions/${version.id}`;
    const examDetail = (id: string) => `${examVersion}/passage?passageId=${id}`;
    const get = (path: string) => fetch(origin + path);

    async function keys(pattern: string) {
      const [row] = await prisma.$queryRaw<{ revision: string }[]>`
        SELECT "revision" FROM "TypingCacheRevision"
      `;
      return redis.keys(`hodivo:typing:v1:${row.revision}:${pattern}`);
    }
    for (
      let tries = 0;
      tries < 30 && !(await keys('catalogue:*')).length;
      tries++
    ) {
      assert.equal((await get(catalogue)).status, 200);
      await delay(25);
    }
    assert.equal((await keys('catalogue:*')).length, 1);
    const first = await (await get(catalogue)).json();
    assert.equal(first.passages.length, 10);
    const lastPage = `${catalogue}?cursor=${first.nextCursor}`;
    const second = await (await get(lastPage)).json();
    assert.deepEqual(second.passages, [
      { id: 'synthetic11', title: 'Passage 11' },
      { id: target, title: 'Passage 12' },
    ]);
    assert.equal(second.nextCursor, null);
    assert.deepEqual(await keys('text:*'), []);
    const warmPageQueries = passageQueries;
    assert.deepEqual(await (await get(lastPage)).json(), second);
    assert.equal(passageQueries, warmPageQueries);

    assert.equal(
      (await (await get(detail)).json()).passage.text,
      'Synthetic text 12.',
    );
    assert.equal((await keys(`text:${target}`)).length, 1);
    const warmQueries = passageQueries;
    assert.equal(
      (await (await get(detail)).json()).passage.text,
      'Synthetic text 12.',
    );
    assert.equal(passageQueries, warmQueries);

    examQueries.length = 0;
    const examRead = await get(examDetail(target));
    assert.equal(examRead.status, 200);
    assert.equal(
      (await examRead.json()).snapshot.passage.text,
      'Synthetic text 12.',
    );
    assert.equal(
      examQueries.filter((query) =>
        query.includes('FROM "public"."TypingExamVersion"'),
      ).length,
      1,
    );
    assert.equal(
      examQueries.filter((query) =>
        query.includes('SELECT p."id", p."title", p."contentHash"'),
      ).length,
      1,
    );
    assert.equal(
      examQueries.filter((query) =>
        query.includes('FROM "TypingCacheRevision"'),
      ).length,
      1,
    );
    const isTextRead = (query: string) =>
      query.includes('SELECT p."id", p."title", p."text"');
    assert.equal(examQueries.filter(isTextRead).length, 0);

    assert.equal((await get(`${catalogue}/synthetic11`)).status, 200);
    assert.equal((await keys('text:synthetic11')).length, 1);
    const rejected = await get(examDetail('synthetic11'));
    assert.equal(rejected.status, 409);
    assert.deepEqual((await rejected.json()).error.reasons, [
      'NO_ELIGIBLE_PASSAGE',
    ]);

    let page: Page | undefined;
    if (frontend) {
      const browser = await chromium.launch({ channel: 'chrome' });
      t.after(() => browser.close());
      page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.goto(`${frontend}/typing`);
      await page.getByRole('button', { name: 'Browse passages' }).click();
      await page.getByRole('button', { name: 'More passages' }).click();
      await page.getByRole('link', { name: 'Passage 12', exact: true }).click();
      await page.waitForFunction(
        () =>
          document.querySelector('[aria-label="Passage to type"]')
            ?.textContent === 'Synthetic text 12.',
      );
      assert.equal(new URL(page.url()).searchParams.get('passage'), target);
    }

    // The repository's importer creates drafts. Existing published content is
    // maintained through SQL, outside the API process.
    await prisma.$executeRaw`
    UPDATE "TypingPassage" SET "text" = 'Edited test text.', "title" = 'Edited passage',
        "contentHash" = ${hash('Edited test text.')}, "revision" = 2
    WHERE "id" = ${target}
  `;
    assert.equal(
      (await (await get(detail)).json()).passage.text,
      'Edited test text.',
    );
    assert.equal(
      (await (await get(lastPage)).json()).passages[1].title,
      'Edited passage',
    );

    if (page) {
      await page.reload();
      await page.waitForFunction(
        () =>
          document.querySelector('[aria-label="Passage to type"]')
            ?.textContent === 'Edited test text.',
      );
    }

    const editedExam = await get(examDetail(target));
    assert.equal(editedExam.status, 200);
    const editedSnapshot = (await editedExam.json()).snapshot;
    assert.equal(editedSnapshot.passage.text, 'Edited test text.');
    assert.equal(editedSnapshot.passage.revision, 2);

    const beforeRollback = passageQueries;
    await assert.rejects(
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`UPDATE "TypingPassage" SET "status" = 'DRAFT' WHERE "id" = ${target}`;
        throw new Error('Rollback fixture');
      }),
      /Rollback fixture/,
    );
    assert.equal(
      (await (await get(detail)).json()).passage.text,
      'Edited test text.',
    );
    assert.equal((await get(lastPage)).status, 200);
    assert.equal(passageQueries, beforeRollback);

    const staleKeys = await keys(`text:${target}`);
    assert.equal(staleKeys.length, 1);
    await redis.del(staleKeys);
    const gate = () => {
      let resolve!: () => void;
      const promise = new Promise<void>((done) => {
        resolve = done;
      });
      return { resolve, promise };
    };
    const started = gate();
    const resume = gate();
    intercept = async () => {
      started.resolve();
      await resume.promise;
    };
    const inFlight = get(detail);
    try {
      await Promise.race([
        started.promise,
        delay(2000).then(() => {
          throw new Error('Expected a passage read in flight');
        }),
      ]);
      await prisma.$executeRaw`UPDATE "TypingPassage" SET "status" = 'DRAFT' WHERE "id" = ${target}`;
    } finally {
      intercept = undefined;
      resume.resolve();
    }
    assert.equal((await inFlight).status, 200);
    assert.equal(await redis.exists(staleKeys), 1);
    assert.deepEqual(await keys(`text:${target}`), []);
    assert.equal((await get(detail)).status, 404);
    assert.equal((await get(examDetail(target))).status, 409);
    assert.deepEqual((await (await get(lastPage)).json()).passages, [
      { id: 'synthetic11', title: 'Passage 11' },
    ]);

    if (page) {
      await page.reload();
      await page.getByText('No passages available.', { exact: true }).waitFor();
      assert.equal(
        await page
          .getByRole('textbox', { name: 'Type the passage here' })
          .isDisabled(),
        true,
      );
    }

    // An unresponsive Redis connection must fall back to PostgreSQL.
    await redis.sendCommand(['CLIENT', 'PAUSE', '700', 'ALL']);
    const beforeOutage = passageQueries;
    const outagePage = await get(lastPage);
    assert.equal(outagePage.status, 200);
    assert.equal((await outagePage.json()).passages.length, 1);
    assert.ok(passageQueries > beforeOutage);
    const fallback = await get(`${catalogue}/synthetic11`);
    assert.equal((await fallback.json()).passage.text, 'Synthetic text 11.');

    await prisma.$executeRaw`UPDATE "TypingPassage" SET "status" = 'PUBLISHED' WHERE "id" = ${target}`;
    assert.equal((await get(detail)).status, 200);
    await redis.sendCommand(['CLIENT', 'PAUSE', '700', 'ALL']);
    examQueries.length = 0;
    const examFallback = await get(examDetail(target));
    assert.equal(examFallback.status, 200);
    assert.equal(
      (await examFallback.json()).snapshot.passage.text,
      'Edited test text.',
    );
    assert.equal(examQueries.filter(isTextRead).length, 1);
    assert.equal((await get(detail)).status, 200);
    assert.equal((await (await get(lastPage)).json()).passages.length, 2);
    await prisma.$executeRaw`UPDATE "TypingExamVersion" SET "status" = 'DRAFT' WHERE "id" = ${version.id}`;
    assert.equal((await get(detail)).status, 404);
    assert.equal((await get(examDetail(target))).status, 404);
    assert.deepEqual(await (await get(catalogue)).json(), {
      passages: [],
      nextCursor: null,
    });
  },
);
