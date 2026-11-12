import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseTypingImport } from '../src/lib/typing-import.js';
import { readTypingContentFile } from '../src/lib/typing-content.js';

function draft() {
  return {
    exam: { slug: 'example', name: 'Illustrative exam', organization: null },
    version: {
      versionKey: 'draft-1',
      label: 'Illustrative draft',
      language: 'en',
      examYear: null,
      durationSeconds: null,
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
        contentKey: 'example',
        revision: 1,
        title: 'Example',
        text: 'A\r\n\t😀 e\u0301  ',
        examYear: null,
        shift: null,
        sourceKind: 'PRACTICE',
        sourceUrl: null,
        sourceNote: null,
      },
    ],
  };
}

test('approved backspace enum is accepted without inventing scorer/editor', () => {
  for (const policy of ['UNRESTRICTED', 'DISABLED', 'CURRENT_WORD_ONLY']) {
    const input = draft();
    assert.doesNotThrow(() =>
      parseTypingImport({
        ...input,
        version: { ...input.version, backspacePolicy: policy },
      }),
    );
  }
});

test('exact text retains Unicode, tabs and trailing spaces with LF canonicalization', () => {
  const result = parseTypingImport(draft());
  assert.equal(result.passages[0].text, 'A\n\t😀 e\u0301  ');
  assert.equal(result.passages[0].characterCount, 9);
  assert.equal(result.passages[0].wordCount, 3);
});

test('import file allows exactly one leading BOM and rejects invalid UTF-8', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'typing-acceptance-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'input.json');
  const json = Buffer.from(JSON.stringify(draft()));
  const bom = Buffer.from([0xef, 0xbb, 0xbf]);
  await writeFile(file, Buffer.concat([bom, json]));
  assert.deepEqual(await readTypingContentFile(file), draft());
  await writeFile(file, Buffer.concat([bom, bom, json]));
  await assert.rejects(readTypingContentFile(file));
  await writeFile(file, Buffer.from([0xc0, 0xaf]));
  await assert.rejects(readTypingContentFile(file));
});

test('required nulls and null-only method fields cannot be bypassed', () => {
  const input = draft();
  assert.throws(() =>
    parseTypingImport({
      ...input,
      version: {
        ...input.version,
        scoringMethod: 'MADE_UP',
      },
    }),
  );
  const { organization: _organization, ...exam } = input.exam;
  void _organization;
  assert.throws(() => parseTypingImport({ ...input, exam }));
  assert.throws(() =>
    parseTypingImport({
      ...input,
      passages: input.passages.map((passage) => ({
        ...passage,
        contentHash: 'fake',
      })),
    }),
  );
});

test('metadata rejects storage-breaking controls and malformed Unicode', () => {
  for (const name of [
    'a\u0000b',
    'a\ud800b',
    'a\u007fb',
    'a\nb',
    ...Array.from(
      { length: 32 },
      (_, i) => `a${String.fromCodePoint(128 + i)}b`,
    ),
  ]) {
    const input = draft();
    assert.throws(() =>
      parseTypingImport({ ...input, exam: { ...input.exam, name } }),
    );
  }
  for (const note of ['a\u0000b', 'a\ud800b', 'a\u007fb']) {
    const input = draft();
    assert.throws(() =>
      parseTypingImport({
        ...input,
        version: { ...input.version, instructions: note },
      }),
    );
  }
  const input = draft();
  const instructions = 'First line\n\tSecond line';
  const parsed = parseTypingImport({
    ...input,
    version: { ...input.version, instructions },
  });
  assert.equal(parsed.version.instructions, instructions);
});
