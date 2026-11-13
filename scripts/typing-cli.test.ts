import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import pg from 'pg';

const connection = process.env.TEST_DATABASE_URL;
function runCli(args: string[], databaseUrl: string) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>(
    (resolve, reject) => {
      const child = spawn(
        process.execPath,
        ['--import', 'tsx', 'scripts/import-typing-content.ts', ...args],
        {
          env: {
            PATH: process.env.PATH,
            DATABASE_URL: databaseUrl,
            DOTENV_CONFIG_PATH: '/dev/null',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });
      child.on('error', reject);
      child.on('close', (code) => resolve({ code, stdout, stderr }));
    },
  );
}

test(
  'real CLI validates, previews, applies, repeats and refuses conflicting drafts',
  { skip: !connection, timeout: 30000 },
  async (t) => {
    assert.ok(connection);
    const admin = new pg.Client({ connectionString: connection });
    await admin.connect();
    const name = `typing_cli_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`CREATE DATABASE "${name}"`);
    const url = new URL(connection);
    url.pathname = `/${name}`;
    const client = new pg.Client({ connectionString: url.href });
    t.after(async () => {
      await client.end();
      await admin.query(`DROP DATABASE "${name}"`);
      await admin.end();
    });
    await client.connect();
    const migrations = new URL('../prisma/migrations/', import.meta.url);
    for (const entry of (await readdir(migrations)).sort()) {
      if (entry === 'migration_lock.toml') continue;
      await client.query(
        await readFile(new URL(`${entry}/migration.sql`, migrations), 'utf8'),
      );
    }
    const directory = await mkdtemp(join(tmpdir(), 'typing-cli-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const file = join(directory, 'draft.json');
    const input = {
      exam: { slug: 'example', name: 'Illustrative exam', organization: null },
      version: {
        versionKey: 'draft-1',
        label: 'Illustrative',
        language: 'en',
        examYear: null,
        durationSeconds: 60,
        backspacePolicy: 'DISABLED',
        editingPolicy: null,
        scoringMethod: null,
        targetWpm: null,
        maxErrorPercent: 0,
        targetKeystrokes: null,
        instructions: null,
        ruleSourceUrl: null,
        ruleSourceNote: null,
      },
      passages: [
        {
          contentKey: 'example',
          revision: 1,
          title: 'Example',
          text: '<b>Plain text</b>\r\n\t😀 e\u0301  ',
          examYear: null,
          shift: null,
          sourceKind: 'PRACTICE',
          sourceUrl: null,
          sourceNote: null,
        },
      ],
    };
    await writeFile(file, JSON.stringify(input));
    const preview = await runCli([file], url.href);
    assert.equal(preview.code, 0, preview.stderr);
    assert.equal(JSON.parse(preview.stdout).applied, false);
    assert.equal(
      (await client.query('SELECT count(*) FROM "TypingPassage"')).rows[0]
        .count,
      '0',
    );
    const applied = await runCli([file, '--apply'], url.href);
    assert.equal(applied.code, 0, applied.stderr);
    assert.equal(JSON.parse(applied.stdout).applied, true);
    const stored = (await client.query('SELECT * FROM "TypingPassage"')).rows;
    assert.equal(stored.length, 1);
    assert.equal(stored[0].text, '<b>Plain text</b>\n\t😀 e\u0301  ');
    assert.equal(stored[0].status, 'DRAFT');
    const repeated = await runCli([file, '--apply'], url.href);
    assert.equal(repeated.code, 0, repeated.stderr);
    assert.equal(JSON.parse(repeated.stdout).passages[0].outcome, 'noop');
    input.passages[0].title = 'Changed metadata';
    await writeFile(file, JSON.stringify(input));
    const conflict = await runCli([file, '--apply'], url.href);
    assert.equal(conflict.code, 1);
    assert.doesNotMatch(conflict.stderr, /postgresql:|PrismaClient|\n\s+at /);
    assert.equal(
      (await client.query('SELECT title FROM "TypingPassage"')).rows[0].title,
      'Example',
    );
    for (const args of [
      [],
      [file, '--unknown'],
      [file, '--apply', '--apply'],
    ]) {
      assert.equal((await runCli(args, url.href)).code, 1);
    }
  },
);
