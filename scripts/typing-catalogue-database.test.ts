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
