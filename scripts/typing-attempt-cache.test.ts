import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PrismaPg } from '@prisma/adapter-pg';
import Fastify from 'fastify';
import { createClient } from 'redis';
import { PrismaClient } from '../generated/prisma/index.js';
import { buildApp } from '../src/app.js';
import { createAuth } from '../src/auth/auth.js';
import { registerTypingAttemptsRoutes } from '../src/routes/typing-attempts.js';
import { registerTypingLeaderboardRoutes } from '../src/routes/typing-leaderboard.js';
import { registerTypingPracticeRoutes } from '../src/routes/typing-practice.js';

test(
  'production attempt routes keep Redis rank and private progress fresh',
  {
    skip: !process.env.TEST_TYPING_CACHE,
  },
  async (t) => {
    const { DATABASE_URL: dbUrl, TYPING_REDIS_URL: redisUrl } = process.env;
    assert.equal(process.env.NODE_ENV, 'production');
    assert(dbUrl && redisUrl);
    for (const url of [redisUrl, dbUrl])
      assert.equal(new URL(url).hostname, '127.0.0.1');
    assert.equal(new URL(dbUrl).pathname, '/hodivo_typing_test');

    const db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: dbUrl }),
      log: [{ level: 'query', emit: 'event' }],
    });
    t.after(() => db.$disconnect());
    const redis = await createClient({ url: redisUrl }).connect();
    t.after(() => redis.destroy());

    const run = randomUUID().replaceAll('-', '');
    const passageId = `pass${run}`;
    const exam = await db.typingExam.create({
      data: { slug: run, name: 'Test' },
    });
    const version = await db.typingExamVersion.create({
      data: {
        examId: exam.id,
        versionKey: 'fixture',
        label: 'Fixture',
        language: 'en',
        status: 'PUBLISHED',
      },
    });
    await db.typingPassage.create({
      data: {
        id: passageId,
        examVersionId: version.id,
        contentKey: 'fixture',
        revision: 1,
        title: 'Fixture',
        text: 'Fixture text.',
        contentHash: 'fixture',
        sourceKind: 'PRACTICE',
        status: 'PUBLISHED',
      },
    });
    const extraUserIds = Array.from(
      { length: 19 },
      (_, index) => `extra${index}${run}`,
    );
    const alice = `alice${run}`;
    const bob = `bob${run}`;
    t.after(async () => {
      await db.typingAttempt.deleteMany({ where: { passageId } });
      await db.typingAttemptCacheRevision.deleteMany({ where: { passageId } });
      await db.authUser.deleteMany({
        where: { id: { in: [alice, bob, ...extraUserIds] } },
      });
      await db.typingPassage.delete({ where: { id: passageId } });
      await db.typingExamVersion.delete({ where: { id: version.id } });
      await db.typingExam.delete({ where: { id: exam.id } });
      await db.$disconnect();
    });

    const secret = randomUUID();
    const auth = createAuth(
      {
        origin: 'https://example.com',
        secret,
        googleClientId: 'fixture',
        googleClientSecret: 'fixture',
      },
      db,
    );
    const { name: cookieName } = (await auth.$context).authCookies.sessionToken;
    const cookie = async (id: string, name: string) => {
      const token = randomUUID();
      await db.authUser.create({
        data: {
          id,
          name,
          email: `${id}@example.com`,
          emailVerified: true,
          sessions: {
            create: { token, expiresAt: new Date(Date.now() + 300_000) },
          },
        },
      });
      const signature = createHmac('sha256', secret)
        .update(token)
        .digest('base64');
      return `${cookieName}=${encodeURIComponent(`${token}.${signature}`)}`;
    };
    const aliceCookie = await cookie(alice, 'Alice');
    const bobCookie = await cookie(bob, 'Bob');

    const app = Fastify();
    registerTypingPracticeRoutes(app);
    let pauseAliceRefresh: (() => Promise<void>) | undefined;
    registerTypingAttemptsRoutes(app, auth, {
      typingAttempt: db.typingAttempt,
      typingPassage: db.typingPassage,
      typingExamVersion: db.typingExamVersion,
      $queryRaw: db.$queryRaw.bind(db),
      $transaction: db.$transaction.bind(db),
      authUser: {
        async findUnique(args) {
          if (args.where.id === alice && pauseAliceRefresh) {
            const pause = pauseAliceRefresh;
            pauseAliceRefresh = undefined;
            await pause();
          }
          return db.authUser.findUnique(args);
        },
      },
    });
    registerTypingLeaderboardRoutes(app, auth, db);
    t.after(() => app.close());
    const root = `/api/typing/passages/${passageId}`;
    const productionApp = buildApp(auth);
    assert(
      productionApp.hasRoute({ method: 'POST', url: '/api/typing/attempts' }),
    );
    assert(
      productionApp.hasRoute({
        method: 'GET',
        url: '/api/typing/passages/:passageId/summary',
      }),
    );
    assert(
      productionApp.hasRoute({
        method: 'GET',
        url: '/api/typing/passages/:passageId/leaderboard',
      }),
    );
    await productionApp.close();

    let counts = { ranking: 0, summary: 0, auth: 0, revision: 0 };
    db.$on('query', ({ query }) => {
      if (!query.trimStart().startsWith('SELECT')) return;
      if (query.includes('."TypingAttempt"')) {
        if (query.includes('ORDER BY "public"."TypingAttempt"."netWpm"'))
          counts.ranking++;
        else counts.summary++;
      }
      if (query.includes('."AuthSession"')) counts.auth++;
      if (query.includes('"TypingAttemptCacheRevision"')) counts.revision++;
    });
    const measure = async <T>(
      read: () => Promise<T>,
      expected: typeof counts,
    ) => {
      counts = { ranking: 0, summary: 0, auth: 0, revision: 0 };
      const result = await read();
      assert.deepEqual(counts, expected);
      return result;
    };

    const post = async (
      cookie: string,
      netWpm: number,
      errorPercent = 4,
      mode = 'PRACTICE',
    ) => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/typing/attempts',
        headers: { cookie },
        payload: {
          passageId,
          mode,
          examVersionId: mode === 'EXAM' ? version.id : null,
          netWpm,
          grossWpm: netWpm,
          accuracy: 100 - errorPercent,
          errorPercent,
          keystrokes: 200,
          backspaceCount: 0,
          durationMs: 60_000,
        },
      });
      assert.equal(response.statusCode, 201, response.body);
      return response.json();
    };
    const read = async (url: string, cookie: string, status = 200) => {
      const response = await app.inject({
        url: root + url,
        headers: { cookie },
      });
      assert.equal(response.statusCode, status, response.body);
      assert.equal(response.headers['cache-control'], 'no-store');
      return response.json();
    };
    const board = (cookie = aliceCookie, mode = 'PRACTICE') =>
      read(`/leaderboard?mode=${mode}`, cookie);
    const summary = (cookie = aliceCookie) => read('/summary', cookie);
    const hit = { ranking: 0, summary: 0, auth: 1, revision: 1 };
    const boardMiss = { ...hit, ranking: 1, revision: 2 };
    const summaryMiss = { ...hit, summary: 1 };

    await post(bobCookie, 45);
    // Separate millisecond from Alice's identical score to exercise the date tie-break.
    await post(aliceCookie, 45);
    await post(aliceCookie, 34, 4, 'EXAM');
    await summary();
    const bobProgress = await summary(bobCookie);
    const examBoard = await board(aliceCookie, 'EXAM');
    const startingBoard = await measure(() => board(), boardMiss);
    assert.deepEqual(
      startingBoard.entries.map(
        ({ displayName }: { displayName: string }) => displayName,
      ),
      ['Bob', 'Alice'],
    );
    const bobView = await measure(() => board(bobCookie), hit);
    assert.equal(bobView.me.rank, 1);
    assert.equal(startingBoard.me.rank, 2);
    assert.deepEqual(
      bobView.entries.map(
        ({ isCurrentUser }: { isCurrentUser: boolean }) => isCurrentUser,
      ),
      [true, false],
    );
    assert(!JSON.stringify(bobView).includes(alice));

    const lower = await post(aliceCookie, 30);
    const updated = await measure(() => summary(), summaryMiss);
    assert.equal(updated.practice.attemptCount, 2);
    assert.deepEqual(updated.practice.lastAttempt, lower.attempt);
    assert.equal(updated.practice.personalBest.netWpm, 45);
    assert.equal(updated.exam.attemptCount, 1);
    assert.deepEqual(await measure(() => summary(), hit), updated);
    assert.deepEqual(await measure(() => summary(bobCookie), hit), bobProgress);
    assert.deepEqual(await measure(() => board(), hit), startingBoard);
    await measure(() => read('/summary', '', 401), {
      ranking: 0,
      summary: 0,
      auth: 0,
      revision: 0,
    });

    const practiceKeys = () =>
      redis.keys(`hodivo:typing:attempt:v2:*"${passageId}","PRACTICE",*`);
    const [predecessor] = await practiceKeys();
    assert(predecessor);
    const originalExpiry = await redis.pExpireTime(predecessor);

    // Error percentage wins when WPM is tied, even with a later time.
    const better = await post(aliceCookie, 45, 2);
    const improved = await measure(() => board(), hit);
    const promoted = (await practiceKeys()).find((key) => key !== predecessor);
    assert(promoted);
    assert.equal(await redis.pExpireTime(promoted), originalExpiry);
    assert.equal(improved.me.rank, 1);
    assert.equal(improved.me.entry.errorPercent, 2);
    const displacedBob = await measure(() => board(bobCookie), hit);
    assert.equal(displacedBob.me.rank, 2);
    assert.deepEqual(displacedBob.me.entry, { ...bobView.me.entry, rank: 2 });
    assert.deepEqual(await measure(() => summary(bobCookie), hit), bobProgress);
    assert.deepEqual(
      (await measure(() => summary(), summaryMiss)).practice.personalBest,
      better.attempt,
    );
    assert.deepEqual(
      await measure(() => board(aliceCookie, 'EXAM'), hit),
      examBoard,
    );

    let signalRefreshStarted!: () => void;
    let releaseRefresh!: () => void;
    const refreshStarted = new Promise<void>((resolve) => {
      signalRefreshStarted = resolve;
    });
    const refreshReleased = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    pauseAliceRefresh = async () => {
      signalRefreshStarted();
      await refreshReleased;
    };
    const older = post(aliceCookie, 48);
    await Promise.race([
      refreshStarted,
      older.then(() =>
        assert.fail('Older request did not reach post-commit refresh'),
      ),
    ]);
    try {
      const newer = await post(aliceCookie, 60);
      // The newer request completed first, before its predecessor populated Redis.
      const newest = await measure(() => board(), boardMiss);
      assert.equal(newest.me.entry.netWpm, 60);
      assert.deepEqual(
        (await measure(() => summary(), summaryMiss)).practice.personalBest,
        newer.attempt,
      );
    } finally {
      releaseRefresh();
      await older;
    }
    assert.equal((await measure(() => board(), hit)).me.entry.netWpm, 60);
    assert.equal(
      (await measure(() => summary(), hit)).practice.attemptCount,
      5,
    );
    await post(bobCookie, 55);
    assert.equal((await measure(() => board(bobCookie), hit)).me.rank, 2);

    await redis.sendCommand(['CLIENT', 'PAUSE', '2000', 'ALL']);
    const duringOutage = await post(bobCookie, 65);
    const [fallbackBoard, fallbackProgress] = await measure(
      () => Promise.all([board(), summary(bobCookie)]),
      { ranking: 1, summary: 1, auth: 2, revision: 2 },
    );
    assert.equal(fallbackBoard.me.rank, 2);
    assert.equal(fallbackBoard.entries[0].netWpm, 65);
    assert.equal(fallbackProgress.practice.attemptCount, 3);
    assert.deepEqual(
      fallbackProgress.practice.personalBest,
      duringOutage.attempt,
    );
    // PING waits for the pause to finish, so these reads exercise recovery.
    await redis.ping();
    assert.deepEqual(await measure(() => board(), boardMiss), fallbackBoard);
    assert.deepEqual(await measure(() => board(), hit), fallbackBoard);
    const recoveredProgress = await measure(
      () => summary(bobCookie),
      summaryMiss,
    );
    assert.deepEqual(
      recoveredProgress.practice.personalBest,
      duringOutage.attempt,
    );
    assert.deepEqual(
      await measure(() => summary(bobCookie), hit),
      recoveredProgress,
    );

    // Restore a warm complete board with 21 ranked participants.
    await db.authUser.createMany({
      data: extraUserIds.map((id, index) => ({
        id,
        email: `${id}@example.com`,
        name: `Extra ${index}`,
      })),
    });
    await db.typingAttempt.createMany({
      data: extraUserIds
        .map((authUserId, index) => ({
          id: `tie${String(index).padStart(2, '0')}${run}`,
          authUserId,
          passageId,
          passageContentHash: 'fixture',
          mode: 'PRACTICE' as const,
          netWpm: 70,
          grossWpm: 70,
          accuracy: 96,
          errorPercent: 4,
          keystrokes: 200,
          durationMs: 60_000,
          createdAt: new Date('2026-01-01T00:00:00Z'),
        }))
        .reverse(),
    });
    const largeBoard = await measure(() => board(), boardMiss);
    assert.equal(largeBoard.totalParticipants, 21);
    assert.equal(largeBoard.entries.length, 20);
    assert.equal(largeBoard.me.rank, 21);
    assert.equal(largeBoard.me.entry.rank, 21);
    assert(
      largeBoard.entries.every(
        (entry: { isCurrentUser: boolean }) => !entry.isCurrentUser,
      ),
    );
    assert.deepEqual(
      largeBoard.entries
        .slice(0, 19)
        .map((entry: { displayName: string }) => entry.displayName),
      extraUserIds.map((_, index) => `Extra ${index}`),
    );
    assert.deepEqual(Object.keys(largeBoard.entries[0]).sort(), [
      'accuracy',
      'createdAt',
      'displayName',
      'errorPercent',
      'isCurrentUser',
      'netWpm',
      'passedRule',
      'rank',
    ]);
    await post(bobCookie, 75);
    const largeUpdatedBoard = await measure(() => board(), hit);
    assert.deepEqual(largeUpdatedBoard.me, largeBoard.me);
    assert.deepEqual(
      largeUpdatedBoard.entries.slice(1),
      largeBoard.entries
        .slice(0, 19)
        .map((entry: { rank: number }) => ({ ...entry, rank: entry.rank + 1 })),
    );

    await db.typingPassage.update({
      where: { id: passageId },
      data: { status: 'DRAFT' },
    });
    await read('/leaderboard?mode=PRACTICE', aliceCookie, 404);
    await read('/summary', aliceCookie, 404);
  },
);
