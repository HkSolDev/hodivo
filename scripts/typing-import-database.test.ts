import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import type { TestContext } from 'node:test';
import { test } from 'node:test';
import pg from 'pg';
import Fastify from 'fastify';
import { createExamCatalogue } from '../src/lib/typing-exam-catalogue.js';
import { getRandomPracticePassage } from '../src/lib/typing-catalogue.js';
import { registerTypingPracticeRoutes } from '../src/routes/typing-practice.js';
import { registerTypingExamRoutes } from '../src/routes/typing-exams.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/index.js';
import {
  TypingImportConflictError,
  importTypingContent,
} from '../src/lib/typing-import.js';

const connection = process.env.TEST_DATABASE_URL;

function fixtureInput() {
  return {
    exam: {
      slug: 'ssc-cgl',
      name: 'SSC Combined Graduate Level',
      organization: 'Staff Selection Commission',
    },
    version: {
      versionKey: 'tier-1-2024',
      label: 'Tier 1',
      language: 'en',
      examYear: 2024,
      durationSeconds: 3600,
      backspacePolicy: null,
      editingPolicy: null,
      scoringMethod: null,
      targetWpm: null,
      maxErrorPercent: null,
      targetKeystrokes: null,
      instructions: null,
      ruleSourceUrl: null,
      ruleSourceNote: null,
    },
    passages: [
      {
        contentKey: 'memory-based-1',
        revision: 1,
        title: 'Memory based passage one',
        text: 'The quick brown fox.\r\nJumps  over\tthe lazy dog.  ',
        examYear: null,
        shift: 'Shift one',
        sourceKind: 'OFFICIAL_PREVIOUS_YEAR',
        sourceUrl: 'https://example.test/question-paper.pdf',
        sourceNote: 'Downloaded from the official archive',
      },
      {
        contentKey: 'practice-drill',
        revision: 1,
        title: 'Practice drill',
        text: 'A practice passage.\nWith two lines.',
        examYear: null,
        shift: null,
        sourceKind: 'PRACTICE',
        sourceUrl: null,
        sourceNote: null,
      },
    ],
  };
}

const canonicalFirst = 'The quick brown fox.\nJumps  over\tthe lazy dog.  ';

test(
  'Hindi draft preset round-trips through the local practice and exam APIs',
  { skip: !connection },
  async (t) => {
    const { database } = await typingDatabase(t, connection!);
    const input = JSON.parse(
      await readFile(
        new URL(
          '../content/typing/ssc-hindi-local.draft.json',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    const preview = await importTypingContent(input, database);
    assert.deepEqual(
      preview.passages.map(({ outcome }) => outcome),
      ['create', 'create', 'create'],
    );
    assert.equal(await database.typingExamVersion.count(), 0);
    await importTypingContent(input, database, { apply: true });
    const stored = await database.typingExamVersion.findFirstOrThrow();
    assert.equal(stored.status, 'DRAFT');
    for (const [key, value] of Object.entries(input.version)) {
      assert.equal(stored[key as keyof typeof stored], value);
    }
    const hidden = createExamCatalogue(database);
    assert.deepEqual((await hidden.listExams(20)).items, []);
    const oldEnv = process.env;
    process.env = {
      ...oldEnv,
      NODE_ENV: 'development',
      APTUS_LOCAL_HINDI_EXAM: '1',
    };
    const catalogue = createExamCatalogue(database);
    process.env = oldEnv;
    const app = Fastify();
    t.after(() => app.close());
    registerTypingExamRoutes(app, catalogue);
    registerTypingPracticeRoutes(
      app,
      () => getRandomPracticePassage(database),
      database,
    );
    const practiceBase = '/api/typing/practice-passages';
    assert.deepEqual((await app.inject(practiceBase)).json().passages, []);
    process.env = {
      ...oldEnv,
      NODE_ENV: 'development',
      APTUS_LOCAL_HINDI_EXAM: '1',
    };
    t.after(() => {
      process.env = oldEnv;
    });
    const practice = await app.inject(practiceBase);
    assert.equal(practice.statusCode, 200, practice.body);
    assert.deepEqual(
      practice.json().passages.map((item: { title: string }) => item.title),
      input.passages.map((item: { title: string }) => item.title),
    );
    assert.equal(
      (await app.inject('/api/typing/practice-passage')).json().passage,
      null,
    );
    const exams = await app.inject('/api/typing/exams');
    assert.equal(exams.statusCode, 200);
    assert.equal(exams.json().exams[0].slug, input.exam.slug);
    const base = `/api/typing/exam-versions/${stored.id}`;
    const response = await app.inject(`${base}/passages`);
    assert.equal(response.statusCode, 200);
    const { passages } = response.json();
    assert.equal(passages.length, 3);
    for (const passage of passages) {
      const start = await app.inject(`${base}/passage?passageId=${passage.id}`);
      assert.equal(start.statusCode, 200, start.body);
      const { snapshot } = start.json();
      const practicePassage = await app.inject(`${practiceBase}/${passage.id}`);
      assert.equal(practicePassage.statusCode, 200, practicePassage.body);
      assert.deepEqual(practicePassage.json().passage, {
        id: passage.id,
        title: passage.title,
        language: 'hi',
        text: snapshot.passage.text,
      });
      assert.equal(snapshot.version.language, 'hi');
      assert.equal(snapshot.version.rules.durationSeconds, 600);
      assert.equal(snapshot.version.readiness.scoringAvailable, false);
      assert.equal(
        snapshot.passage.text,
        input.passages.find(
          (item: { title: string }) => item.title === passage.title,
        ).text,
      );
    }
    process.env = oldEnv;
    assert.equal(
      (await app.inject(`${practiceBase}/${passages[0].id}`)).statusCode,
      404,
    );
    process.env = {
      ...oldEnv,
      NODE_ENV: 'production',
      APTUS_LOCAL_HINDI_EXAM: '1',
    };
    const publishedAt = new Date();
    const publication = {
      status: 'PUBLISHED',
      reviewedAt: publishedAt,
      publishedAt,
    } as const;
    await database.typingExamVersion.update({
      where: { id: stored.id },
      data: publication,
    });
    await database.typingPassage.updateMany({
      where: { examVersionId: stored.id },
      data: publication,
    });
    const published = await app.inject(practiceBase);
    assert.equal(published.statusCode, 200, published.body);
    assert.equal(published.json().passages.length, 3);
    const publicPassage = await app.inject(`${practiceBase}/${passages[0].id}`);
    assert.equal(publicPassage.statusCode, 200, publicPassage.body);
    assert.equal(publicPassage.json().passage.language, 'hi');
    assert.equal(
      (await app.inject('/api/typing/practice-passage')).json().passage,
      null,
    );
    assert.deepEqual(
      (await createExamCatalogue(database).listExams(20)).items,
      [],
    );
  },
);

// Local random-schema fixture shaped like scripts/helpers/auth-database.ts,
// but returning the schema name and a second client for concurrency tests.
async function typingDatabase(t: TestContext, connectionString: string) {
  const client = new pg.Client({
    connectionString,
    connectionTimeoutMillis: 5000,
  });
  await client.connect();
  const schema = `typing_import_test_${randomUUID().replaceAll('-', '')}`;
  await client.query(`CREATE SCHEMA "${schema}"`);
  await client.query(`SET search_path TO "${schema}"`);
  const scopedConnection = new URL(connectionString);
  scopedConnection.searchParams.set('options', `-c search_path=${schema}`);
  const makeClient = () =>
    new PrismaClient({
      adapter: new PrismaPg(
        { connectionString: scopedConnection.toString() },
        { schema },
      ),
    });
  const database = makeClient();
  const concurrent = makeClient();
  t.after(async () => {
    await database.$disconnect();
    await concurrent.$disconnect();
    await client.query(`DROP SCHEMA "${schema}" CASCADE`);
    await client.end();
  });
  const directory = new URL('../prisma/migrations/', import.meta.url);
  for (const migration of (await readdir(directory)).sort()) {
    if (migration === 'migration_lock.toml') continue;
    await client.query(
      await readFile(new URL(`${migration}/migration.sql`, directory), 'utf8'),
    );
  }
  return { database, concurrent, client };
}

test('the typing catalogue migration is additive only', async () => {
  const sql = await readFile(
    new URL(
      '../prisma/migrations/20261112120000_add_typing_catalogue/migration.sql',
      import.meta.url,
    ),
    'utf8',
  );
  assert.doesNotMatch(sql, /DROP /i);
  for (const legacy of [
    'AuthUser',
    'AuthPasskey',
    'AuthSession',
    'AuthAccount',
    'AuthVerification',
    'User',
    'Education',
    'Source',
    'Post',
    'SavedJob',
    'ExtractionCandidate',
  ]) {
    assert.doesNotMatch(sql, new RegExp(`\\(?"?${legacy}"?\\.`));
    assert.doesNotMatch(sql, new RegExp(`ALTER TABLE "${legacy}"`));
  }
  assert.match(sql, /CREATE TABLE "TypingExam"/);
  assert.match(sql, /CREATE TABLE "TypingExamVersion"/);
  assert.match(sql, /CREATE TABLE "TypingPassage"/);
  assert.match(sql, /REFERENCES "TypingExam"\("id"\) ON DELETE RESTRICT/);
  assert.match(
    sql,
    /REFERENCES "TypingExamVersion"\("id"\) ON DELETE RESTRICT/,
  );
});

test(
  'isolated database: dry-run, apply, read-back, no-op repeat, conflicts, rollback, concurrency and restrictive FKs',
  { skip: !connection },
  async (t) => {
    const { database, concurrent, client } = await typingDatabase(
      t,
      connection!,
    );
    const input = fixtureInput();

    await t.test('dry-run is the default and writes nothing', async () => {
      const result = await importTypingContent(input, database);
      assert.equal(result.applied, false);
      assert.equal(result.exam.outcome, 'create');
      assert.equal(result.version.outcome, 'create');
      assert.deepEqual(
        result.passages.map((passage) => passage.outcome),
        ['create', 'create'],
      );
      assert.equal(await database.typingExam.count(), 0);
      assert.equal(await database.typingExamVersion.count(), 0);
      assert.equal(await database.typingPassage.count(), 0);
    });

    await t.test(
      'apply inserts the draft atomically and read-back matches',
      async () => {
        const result = await importTypingContent(input, database, {
          apply: true,
        });
        assert.equal(result.applied, true);
        assert.equal(result.exam.outcome, 'create');
        assert.equal(result.version.outcome, 'create');
        assert.deepEqual(
          result.passages.map((passage) => passage.outcome),
          ['create', 'create'],
        );
        const exam = await database.typingExam.findUniqueOrThrow({
          where: { slug: 'ssc-cgl' },
        });
        assert.equal(exam.name, 'SSC Combined Graduate Level');
        assert.equal(exam.organization, 'Staff Selection Commission');
        assert.ok(exam.createdAt instanceof Date);
        const version = await database.typingExamVersion.findUniqueOrThrow({
          where: {
            examId_versionKey: { examId: exam.id, versionKey: 'tier-1-2024' },
          },
        });
        assert.equal(version.status, 'DRAFT');
        assert.equal(version.language, 'en');
        assert.equal(version.backspacePolicy, null);
        assert.equal(version.durationSeconds, 3600);
        const passages = await database.typingPassage.findMany({
          where: { examVersionId: version.id },
          orderBy: { contentKey: 'asc' },
        });
        assert.equal(passages.length, 2);
        assert.equal(passages[0]?.contentKey, 'memory-based-1');
        assert.equal(passages[0]?.text, canonicalFirst);
        assert.equal(passages[0]?.status, 'DRAFT');
        assert.equal(passages[0]?.sourceKind, 'OFFICIAL_PREVIOUS_YEAR');
        assert.equal(passages[1]?.shift, null);
      },
    );

    await t.test(
      'repeating the same import produces no-ops without mutation',
      async () => {
        const before = await database.typingPassage.findFirstOrThrow({
          where: { contentKey: 'memory-based-1' },
        });
        const result = await importTypingContent(input, database, {
          apply: true,
        });
        assert.equal(result.applied, true);
        assert.equal(result.exam.outcome, 'noop');
        assert.equal(result.version.outcome, 'noop');
        assert.deepEqual(
          result.passages.map((passage) => passage.outcome),
          ['noop', 'noop'],
        );
        assert.equal(await database.typingExam.count(), 1);
        assert.equal(await database.typingPassage.count(), 2);
        const after = await database.typingPassage.findFirstOrThrow({
          where: { contentKey: 'memory-based-1' },
        });
        assert.deepEqual(after.updatedAt, before.updatedAt);
      },
    );

    await t.test(
      'identical re-import never downgrades published status or review stamps',
      async () => {
        await database.typingExamVersion.update({
          where: {
            id: (await database.typingExamVersion.findFirstOrThrow()).id,
          },
          data: {
            status: 'PUBLISHED',
            publishedAt: new Date('2026-01-01T00:00:00Z'),
          },
        });
        await database.typingPassage.updateMany({
          data: {
            status: 'PUBLISHED',
            reviewedAt: new Date('2026-01-01T00:00:00Z'),
          },
        });
        const result = await importTypingContent(input, database, {
          apply: true,
        });
        assert.deepEqual(
          result.passages.map((passage) => passage.outcome),
          ['noop', 'noop'],
        );
        const version = await database.typingExamVersion.findFirstOrThrow();
        assert.equal(version.status, 'PUBLISHED');
        assert.deepEqual(version.publishedAt, new Date('2026-01-01T00:00:00Z'));
        const passage = await database.typingPassage.findFirstOrThrow({
          where: { contentKey: 'practice-drill' },
        });
        assert.equal(passage.status, 'PUBLISHED');
        assert.deepEqual(passage.reviewedAt, new Date('2026-01-01T00:00:00Z'));
      },
    );

    await t.test(
      'changed metadata with the same text is a hard conflict',
      async () => {
        const before = await database.typingPassage.findFirstOrThrow({
          where: { contentKey: 'memory-based-1' },
        });
        const conflicting = fixtureInput();
        conflicting.passages[0]!.title = 'A different title';
        const preview = await importTypingContent(conflicting, database);
        assert.equal(preview.passages[0]?.outcome, 'conflict');
        await assert.rejects(
          () => importTypingContent(conflicting, database, { apply: true }),
          TypingImportConflictError,
        );
        const after = await database.typingPassage.findFirstOrThrow({
          where: { contentKey: 'memory-based-1' },
        });
        assert.equal(after.title, 'Memory based passage one');
        assert.deepEqual(after.updatedAt, before.updatedAt);
      },
    );

    await t.test(
      'changed text under the same passage identity conflicts',
      async () => {
        const conflicting = fixtureInput();
        conflicting.passages[0]!.text = 'Different words entirely.';
        await assert.rejects(
          () => importTypingContent(conflicting, database, { apply: true }),
          TypingImportConflictError,
        );
        const passage = await database.typingPassage.findFirstOrThrow({
          where: { contentKey: 'memory-based-1' },
        });
        assert.equal(passage.text, canonicalFirst);
      },
    );

    await t.test(
      'a batch conflict rolls back all inserts in the file',
      async () => {
        const examsBefore = await database.typingExam.count();
        const passagesBefore = await database.typingPassage.count();
        const batch = fixtureInput();
        batch.passages[1]!.text = 'Conflicting replacement text.';
        batch.passages.push({
          ...batch.passages[0]!,
          contentKey: 'brand-new-passage',
          title: 'Brand new passage',
        });
        await assert.rejects(
          () => importTypingContent(batch, database, { apply: true }),
          TypingImportConflictError,
        );
        assert.equal(await database.typingExam.count(), examsBefore);
        assert.equal(await database.typingPassage.count(), passagesBefore);
        assert.equal(
          await database.typingPassage.count({
            where: { contentKey: 'brand-new-passage' },
          }),
          0,
        );
      },
    );

    await t.test(
      'concurrent identical imports never duplicate or overwrite',
      async () => {
        const race = fixtureInput();
        race.exam.slug = 'concurrent-race-exam';
        race.exam.name = 'Concurrent race exam';
        const outcomes = await Promise.allSettled([
          importTypingContent(race, database, { apply: true }),
          importTypingContent(race, concurrent, { apply: true }),
        ]);
        const fulfilled = outcomes.filter(
          (entry) => entry.status === 'fulfilled',
        );
        assert.ok(fulfilled.length >= 1);
        const created = fulfilled.filter(
          (entry) =>
            entry.status === 'fulfilled' &&
            entry.value.passages.every(
              (passage) => passage.outcome === 'create',
            ),
        );
        assert.ok(created.length <= 1);
        for (const entry of fulfilled) {
          if (entry.status === 'fulfilled' && !created.includes(entry)) {
            assert.ok(
              entry.value.passages.every(
                (passage) => passage.outcome === 'noop',
              ),
            );
          }
        }
        assert.equal(
          await database.typingExam.count({ where: { slug: race.exam.slug } }),
          1,
        );
        const raceVersion = await database.typingExamVersion.findFirstOrThrow({
          where: { exam: { slug: race.exam.slug } },
        });
        assert.equal(
          await database.typingPassage.count({
            where: { examVersionId: raceVersion.id },
          }),
          2,
        );
        for (const entry of outcomes) {
          if (entry.status === 'rejected')
            assert.ok(entry.reason instanceof TypingImportConflictError);
        }
      },
    );

    await t.test(
      'restrictive parent foreign keys block orphaning deletes',
      async () => {
        const exam = await database.typingExam.findFirstOrThrow({
          where: { slug: 'ssc-cgl' },
        });
        await assert.rejects(() =>
          database.typingExam.delete({ where: { id: exam.id } }),
        );
        const version = await database.typingExamVersion.findFirstOrThrow();
        await assert.rejects(() =>
          database.typingExamVersion.delete({ where: { id: version.id } }),
        );
        await database.typingPassage.deleteMany();
        await database.typingExamVersion.delete({ where: { id: version.id } });
        await database.typingExam.delete({ where: { id: exam.id } });
        assert.equal(await database.typingExam.count(), 1);
      },
    );

    await t.test(
      'the additive migration leaves existing tables intact',
      async () => {
        const legacy = await client.query(
          `SELECT table_name FROM information_schema.tables
         WHERE table_schema = current_schema()
           AND table_name IN ('AuthUser', 'Post', 'Source', 'SavedJob')
         ORDER BY table_name`,
        );
        assert.deepEqual(
          legacy.rows.map((row) => row.table_name),
          ['AuthUser', 'Post', 'SavedJob', 'Source'],
        );
      },
    );
  },
);
