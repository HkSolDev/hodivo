import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import pg from 'pg';
import Fastify from 'fastify';
import { registerTypingPracticeRoutes } from '../src/routes/typing-practice.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/index.js';
import { getRandomPracticePassage } from '../src/lib/typing-catalogue.js';
import { createHash } from 'node:crypto';
import {
  createExamCatalogue,
  ExamCatalogueError,
} from '../src/lib/typing-exam-catalogue.js';
import { registerTypingExamRoutes } from '../src/routes/typing-exams.js';
import {
  importTypingContent,
  parseTypingImport,
} from '../src/lib/typing-import.js';
import {
  loadExamSnapshot,
  loadExams,
  loadExamVersions,
  loadExamVersion,
} from '../lib/typing/exam-api.js';

const connection = process.env.TEST_DATABASE_URL;

test(
  'practice reads published exam passages while ignoring exam policies',
  { skip: !connection },
  async (t) => {
    assert(connection);
    const client = new pg.Client({ connectionString: connection });
    await client.connect();
    const schema = `typing_catalogue_${randomUUID().replaceAll('-', '')}`;
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    const database = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString: connection, options: `-c search_path=${schema}` },
        { schema },
      ),
    });
    t.after(async () => {
      await database.$disconnect();
      await client.query(`DROP SCHEMA "${schema}" CASCADE`);
      await client.end();
    });
    await client.query(
      await readFile(
        new URL(
          '../prisma/migrations/20261112120000_add_typing_catalogue/migration.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    assert.equal(await getRandomPracticePassage(database), null);
    const exam = await database.typingExam.create({
      data: { slug: 'synthetic', name: 'Synthetic test only' },
    });
    const version = await database.typingExamVersion.create({
      data: {
        examId: exam.id,
        versionKey: 'published',
        label: 'Test only',
        language: 'en',
        status: 'PUBLISHED',
        backspacePolicy: 'DISABLED',
        durationSeconds: 3600,
      },
    });
    const text = 'Cat\n\t  dog.  ';
    const passage = await database.typingPassage.create({
      data: {
        examVersionId: version.id,
        contentKey: 'official',
        revision: 1,
        title: 'Synthetic passage',
        text,
        contentHash: 'test-only',
        sourceKind: 'OFFICIAL_PREVIOUS_YEAR',
        status: 'PUBLISHED',
      },
    });
    const expected = { id: passage.id, title: passage.title, text };
    const app = Fastify({ exposeHeadRoutes: false });
    registerTypingPracticeRoutes(app, () => getRandomPracticePassage(database));
    t.after(() => app.close());
    const response = await app.inject('/api/typing/practice-passage');
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { passage: expected });
    assert.deepEqual(await getRandomPracticePassage(database), expected);
    await t.test(
      'prepared SSC import previews without writes and applies only as a hidden draft',
      async () => {
        const input: unknown = JSON.parse(
          await readFile(
            new URL(
              '../content/typing/ssc-chsl-2025-english.draft.json',
              import.meta.url,
            ),
            'utf8',
          ),
        );
        const parsed = parseTypingImport(input);
        await importTypingContent(input, database);
        assert.equal(
          await database.typingExam.findUnique({
            where: { slug: parsed.exam.slug },
          }),
          null,
        );
        await importTypingContent(input, database, { apply: true });
        const stored = await database.typingExam.findUniqueOrThrow({
          where: { slug: parsed.exam.slug },
          include: { versions: { include: { passages: true } } },
        });
        const storedVersion = stored.versions[0];
        assert.equal(storedVersion.status, 'DRAFT');
        assert.equal(storedVersion.editingPolicy, 'native-correction-v1');
        assert.equal(storedVersion.scoringMethod, null);
        assert.equal(storedVersion.passages[0].status, 'DRAFT');
        assert.equal(storedVersion.passages[0].text, parsed.passages[0].text);
        assert.equal(
          storedVersion.passages[0].contentHash,
          parsed.passages[0].contentHash,
        );
        assert(
          !(await createExamCatalogue(database).listExams(50)).items.some(
            (item) => item.id === stored.id,
          ),
        );
      },
    );
    await t.test(
      'exam reads a reviewed coherent snapshot and rejects hidden or unready content',
      async () => {
        const catalogue = createExamCatalogue(database);
        const examApp = Fastify({ exposeHeadRoutes: false });
        registerTypingExamRoutes(examApp, catalogue);
        t.after(() => examApp.close());
        const reviewedAt = new Date('2026-11-13T00:00:00.000Z');
        const approved = await database.typingExamVersion.create({
          data: {
            examId: exam.id,
            versionKey: 'approved',
            label: 'Synthetic simulation only',
            language: 'en',
            status: 'PUBLISHED',
            durationSeconds: 600,
            targetWpm: 35,
            backspacePolicy: 'UNRESTRICTED',
            editingPolicy: 'native-correction-v1',
            ruleSourceUrl: 'https://example.com/synthetic',
            ruleSourceNote: 'Synthetic evidence only',
            reviewedAt,
            publishedAt: reviewedAt,
          },
        });
        const exact = 'First line.\n\tSecond  line.  ';
        const hash = createHash('sha256').update(exact).digest('hex');
        const approvedPassage = await database.typingPassage.create({
          data: {
            examVersionId: approved.id,
            contentKey: 'approved',
            revision: 1,
            title: 'Synthetic text only',
            text: exact,
            contentHash: hash,
            sourceKind: 'PRACTICE',
            status: 'PUBLISHED',
            reviewedAt,
            publishedAt: reviewedAt,
          },
        });
        assert.equal(
          (await catalogue.getVersion(approved.id)).readiness.canStart,
          true,
        );
        for (let i = 0; i < 3; i++) {
          const snapshot = await catalogue.getSnapshot(approved.id);
          assert.equal(snapshot.passage.id, approvedPassage.id);
          assert.equal(snapshot.passage.text, exact);
          assert.equal(snapshot.passage.contentHash, hash);
          assert.equal(snapshot.version.id, approved.id);
          assert.equal(snapshot.version.rules.durationSeconds, 600);
          assert.equal(snapshot.version.readiness.scoringAvailable, false);
        }
        const response = await examApp.inject(
          `/api/typing/exam-versions/${approved.id}/passage`,
        );
        assert.equal(response.statusCode, 200);
        assert.equal(response.json().snapshot.passage.text, exact);
        assert.equal(response.headers['cache-control'], 'no-store');
        const fetchMock = t.mock.method(
          globalThis,
          'fetch',
          async (input: string | URL | Request) => {
            const result = await examApp.inject(String(input));
            return new Response(result.body, { status: result.statusCode });
          },
        );
        assert.equal(
          (await loadExamSnapshot(approved.id, new AbortController().signal))
            .passage.text,
          exact,
        );
        assert.equal(
          (await loadExamVersion(approved.id, new AbortController().signal))
            .rules.durationSeconds,
          600,
        );
        assert(
          (await loadExams(new AbortController().signal)).items.some(
            (item) => item.id === exam.id,
          ),
        );
        assert(
          (
            await loadExamVersions(exam.id, new AbortController().signal)
          ).items.some((item) => item.id === approved.id),
        );
        fetchMock.mock.restore();
        const detailResponse = await examApp.inject(
          `/api/typing/exam-versions/${approved.id}`,
        );
        assert.equal(detailResponse.statusCode, 200);
        assert(!('passage' in detailResponse.json().version));
        const first = await catalogue.listVersions(exam.id, 1);
        assert.equal(first.items.length, 1);
        assert(first.nextCursor);
        const second = await catalogue.listVersions(
          exam.id,
          1,
          first.nextCursor,
        );
        assert.equal(second.items.length, 1);
        assert.notEqual(second.items[0]?.id, first.items[0]?.id);
        await assert.rejects(
          catalogue.listVersions(exam.id, 1, 'missing'),
          (error: unknown) =>
            error instanceof ExamCatalogueError &&
            error.code === 'INVALID_REQUEST',
        );
        await database.typingPassage.update({
          where: { id: approvedPassage.id },
          data: { contentHash: '0'.repeat(64) },
        });
        assert.deepEqual(
          (await catalogue.getVersion(approved.id)).readiness.reasons,
          ['NO_ELIGIBLE_PASSAGE'],
        );
        assert.equal(
          (
            await examApp.inject(
              `/api/typing/exam-versions/${approved.id}/passage`,
            )
          ).statusCode,
          409,
        );
        await database.typingPassage.update({
          where: { id: approvedPassage.id },
          data: { contentHash: hash, sourceKind: 'OFFICIAL_PREVIOUS_YEAR' },
        });
        assert.equal(
          (await catalogue.getVersion(approved.id)).readiness.canStart,
          false,
        );
        await database.typingPassage.update({
          where: { id: approvedPassage.id },
          data: { sourceKind: 'PRACTICE' },
        });
        await database.typingExamVersion.update({
          where: { id: approved.id },
          data: { backspacePolicy: 'DISABLED' },
        });
        assert.deepEqual(
          (await catalogue.getVersion(approved.id)).readiness.reasons,
          [],
        );
        await database.typingExamVersion.update({
          where: { id: approved.id },
          data: { editingPolicy: 'unsupported-v2' },
        });
        assert.deepEqual(
          (await catalogue.getVersion(approved.id)).readiness.reasons,
          ['RULES_UNSUPPORTED'],
        );
        await database.typingExamVersion.update({
          where: { id: approved.id },
          data: { maxErrorPercent: 101 },
        });
        const malformed = await examApp.inject(
          `/api/typing/exam-versions/${approved.id}`,
        );
        assert.equal(malformed.statusCode, 503);
        assert.deepEqual(malformed.json(), {
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Exam content is temporarily unavailable.',
          },
        });
        await database.typingExamVersion.update({
          where: { id: approved.id },
          data: { maxErrorPercent: null },
        });
        await database.typingExamVersion.update({
          where: { id: approved.id },
          data: { status: 'DRAFT' },
        });
        assert.equal(
          (await examApp.inject(`/api/typing/exam-versions/${approved.id}`))
            .statusCode,
          404,
        );
        assert.equal(
          (
            await examApp.inject(
              `/api/typing/exam-versions/${approved.id}/passage`,
            )
          ).statusCode,
          404,
        );
        assert(
          !(await catalogue.listVersions(exam.id, 50)).items.some(
            (v) => v.id === approved.id,
          ),
        );
      },
    );
    await database.typingPassage.createMany({
      data: [
        { contentKey: 'draft', status: 'DRAFT', text: 'Hidden draft.' },
        { contentKey: 'retired', status: 'RETIRED', text: 'Hidden retired.' },
        { contentKey: 'unsupported', status: 'PUBLISHED', text: 'Unicode 😀' },
        { contentKey: 'blank', status: 'PUBLISHED', text: '\n\t  ' },
        {
          contentKey: 'too-long',
          status: 'PUBLISHED',
          text: 'a'.repeat(50001),
        },
      ].map((data) => ({
        ...data,
        status: data.status as 'DRAFT' | 'RETIRED' | 'PUBLISHED',
        examVersionId: version.id,
        revision: 1,
        title: 'Synthetic excluded',
        contentHash: 'test-only',
        sourceKind: 'RECONSTRUCTED' as const,
      })),
    });
    for (let i = 0; i < 5; i++)
      assert.deepEqual(await getRandomPracticePassage(database), expected);
    await database.typingExamVersion.update({
      where: { id: version.id },
      data: { status: 'DRAFT' },
    });
    assert.equal(await getRandomPracticePassage(database), null);
    await database.typingExamVersion.update({
      where: { id: version.id },
      data: { status: 'RETIRED' },
    });
    assert.equal(await getRandomPracticePassage(database), null);
    await database.typingExamVersion.update({
      where: { id: version.id },
      data: { status: 'PUBLISHED', language: 'hi' },
    });
    assert.equal(await getRandomPracticePassage(database), null);
    await database.typingExamVersion.update({
      where: { id: version.id },
      data: { language: 'en', backspacePolicy: null },
    });
    assert.deepEqual(await getRandomPracticePassage(database), expected);
  },
);
