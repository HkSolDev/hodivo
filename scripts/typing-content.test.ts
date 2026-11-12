import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import {
  MAX_PASSAGE_TEXT_CODE_POINTS,
  TypingContentError,
  canonicalizePassageText,
  countCodePoints,
  countWords,
  hashCanonicalPassageText,
  readTypingContentFile,
} from '../src/lib/typing-content.js';

await describe('canonicalizePassageText', async () => {
  await test('converts CRLF and lone CR to LF', () => {
    assert.equal(canonicalizePassageText('a\r\nb'), 'a\nb');
    assert.equal(canonicalizePassageText('a\rb'), 'a\nb');
    assert.equal(canonicalizePassageText('a\r\nb\rc'), 'a\nb\nc');
  });

  await test('preserves case, punctuation, spaces, tabs, blank lines and trailing spaces', () => {
    const raw = 'Hello,  World!  \n\tsecond line\n\n  trailing ';
    assert.equal(canonicalizePassageText(raw), raw);
  });

  await test('never trims, collapses or normalizes text', () => {
    const raw = '  padded\téﬁ case  ';
    assert.equal(canonicalizePassageText(raw), raw);
  });

  await test('rejects NUL, other C0 controls and DEL', () => {
    for (const bad of [
      '\u0000',
      '\u0001',
      '\u001b',
      '\u007f',
      'ok\u0002later',
    ]) {
      assert.throws(() => canonicalizePassageText(bad), TypingContentError);
    }
  });

  await test('rejects unpaired surrogates but accepts valid pairs', () => {
    assert.throws(() => canonicalizePassageText('\ud800'), TypingContentError);
    assert.throws(() => canonicalizePassageText('\udc00'), TypingContentError);
    assert.throws(
      () => canonicalizePassageText('a\ud800b'),
      TypingContentError,
    );
    assert.equal(canonicalizePassageText('😀 ok'), '😀 ok');
  });

  await test('rejects empty and whitespace-only text', () => {
    for (const bad of ['', ' ', '\n', '\t\r\n', ' \t ']) {
      assert.throws(() => canonicalizePassageText(bad), TypingContentError);
    }
  });

  await test('rejects non-string input', () => {
    assert.throws(() => canonicalizePassageText(42), TypingContentError);
  });

  await test('limits text to 50000 code points, counted per code point', () => {
    assert.equal(
      canonicalizePassageText('a'.repeat(MAX_PASSAGE_TEXT_CODE_POINTS)),
      'a'.repeat(MAX_PASSAGE_TEXT_CODE_POINTS),
    );
    assert.throws(
      () =>
        canonicalizePassageText('a'.repeat(MAX_PASSAGE_TEXT_CODE_POINTS + 1)),
      TypingContentError,
    );
    // An astral character is one code point though two UTF-16 units.
    const astral = '😀'.repeat(MAX_PASSAGE_TEXT_CODE_POINTS);
    assert.equal(canonicalizePassageText(astral), astral);
    assert.throws(
      () =>
        canonicalizePassageText('😀'.repeat(MAX_PASSAGE_TEXT_CODE_POINTS + 1)),
      TypingContentError,
    );
  });
});

await describe('hashCanonicalPassageText', async () => {
  await test('hashes the canonical UTF-8 bytes with SHA-256 as lowercase hex', () => {
    const text = canonicalizePassageText('Line one.\r\nLine  two.');
    const expected = createHash('sha256').update(text, 'utf8').digest('hex');
    const hash = hashCanonicalPassageText(text);
    assert.equal(hash, expected);
    assert.match(hash, /^[0-9a-f]{64}$/);
  });

  await test('hashes the LF-normalized text, not the raw input', () => {
    const crlf = hashCanonicalPassageText(canonicalizePassageText('a\r\nb'));
    assert.equal(crlf, hashCanonicalPassageText('a\nb'));
  });
});

await describe('countCodePoints', async () => {
  await test('counts every code point, including LF and TAB', () => {
    assert.equal(countCodePoints('a😀b\n\t'), 5);
    assert.equal(countCodePoints('a\nb'), 3);
  });
});

await describe('countWords', async () => {
  await test('counts nonempty runs split by Unicode whitespace', () => {
    assert.equal(countWords('hello  world\n\tsecond\r\nline'), 4);
    assert.equal(countWords('a\u00a0b'), 2);
    assert.equal(countWords('one'), 1);
    assert.equal(countWords('   '), 0);
  });
});

await describe('readTypingContentFile', async () => {
  await test('enforces file limits, fatal UTF-8 decoding and one leading BOM', async (t) => {
    const workspace = await mkdtemp(join(tmpdir(), 'typing-content-file-'));
    t.after(async () => {
      await rm(workspace, { recursive: true, force: true });
    });
    const writeFixture = async (name: string, bytes: Uint8Array) => {
      const path = join(workspace, name);
      await writeFile(path, bytes);
      return path;
    };

    const plain = await writeFixture(
      'content.json',
      Buffer.from(JSON.stringify({ ok: true }), 'utf8'),
    );
    assert.deepEqual(await readTypingContentFile(plain), { ok: true });

    const withBom = await writeFixture(
      'bom.json',
      Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf]),
        Buffer.from(JSON.stringify({ ok: true }), 'utf8'),
      ]),
    );
    assert.deepEqual(await readTypingContentFile(withBom), { ok: true });

    const doubleBom = await writeFixture(
      'double-bom.json',
      Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf, 0xef, 0xbb, 0xbf]),
        Buffer.from(JSON.stringify({ ok: true }), 'utf8'),
      ]),
    );
    await assert.rejects(
      () => readTypingContentFile(doubleBom),
      TypingContentError,
    );

    const invalidUtf8 = await writeFixture(
      'invalid-utf8.json',
      Buffer.from([0xff, 0xfe, 0x7b]),
    );
    await assert.rejects(
      () => readTypingContentFile(invalidUtf8),
      TypingContentError,
    );

    const oversized = await writeFixture(
      'oversized.json',
      Buffer.from(JSON.stringify({ text: 'x'.repeat(1_048_577) }), 'utf8'),
    );
    await assert.rejects(
      () => readTypingContentFile(oversized),
      TypingContentError,
    );

    const notJson = await writeFixture(
      'plain.txt',
      Buffer.from('not json', 'utf8'),
    );
    await assert.rejects(
      () => readTypingContentFile(notJson),
      TypingContentError,
    );
  });
});
