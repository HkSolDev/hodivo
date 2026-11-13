import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, test } from 'node:test';
import { countCodePoints } from '../src/lib/typing-content.js';
import {
  TypingValidationError,
  parseTypingImport,
} from '../src/lib/typing-import.js';
import { PrismaClient } from '../generated/prisma/index.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { parseImportCliArgs } from './import-typing-content.js';

// Loose record types keep the fixture editable for missing/unknown key tests;
// the parser itself treats every input as untrusted at runtime.
interface Fixture {
  exam: Record<string, unknown>;
  version: Record<string, unknown>;
  passages: Array<Record<string, unknown>>;
}

function validInput(): Fixture {
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
        shift: null,
        sourceKind: 'PRACTICE',
        sourceUrl: null,
        sourceNote: null,
      },
    ],
  };
}

const canonicalFox = 'The quick brown fox.\nJumps  over\tthe lazy dog.  ';

await describe('parseTypingImport', async () => {
  await test('accepts a valid input and canonicalizes text with derived metadata', () => {
    const parsed = parseTypingImport(validInput());
    assert.equal(parsed.exam.slug, 'ssc-cgl');
    assert.equal(parsed.passages[0]?.text, canonicalFox);
    assert.equal(
      parsed.passages[0]?.contentHash,
      createHash('sha256').update(canonicalFox, 'utf8').digest('hex'),
    );
    assert.equal(
      parsed.passages[0]?.characterCount,
      countCodePoints(canonicalFox),
    );
    assert.equal(parsed.passages[0]?.wordCount, 9);
  });

  await test('rejects missing required keys, including nullable ones', () => {
    const missingOrganization = validInput();
    delete missingOrganization.exam.organization;
    assert.throws(
      () => parseTypingImport(missingOrganization),
      TypingValidationError,
    );

    const missingExamYear = validInput();
    delete missingExamYear.version.examYear;
    assert.throws(
      () => parseTypingImport(missingExamYear),
      TypingValidationError,
    );

    const missingPassageShift = validInput();
    delete missingPassageShift.passages[0].shift;
    assert.throws(
      () => parseTypingImport(missingPassageShift),
      TypingValidationError,
    );

    const { passages: removed, ...missingPassages } = validInput();
    assert.throws(
      () => parseTypingImport(missingPassages),
      TypingValidationError,
    );
  });

  await test('rejects unknown keys at every level', () => {
    assert.throws(
      () => parseTypingImport({ ...validInput(), extra: true }),
      TypingValidationError,
    );
    const examExtra = validInput();
    examExtra.exam.examYear = 2024;
    assert.throws(() => parseTypingImport(examExtra), TypingValidationError);
    const passageExtra = validInput();
    passageExtra.passages[0].status = 'DRAFT';
    assert.throws(() => parseTypingImport(passageExtra), TypingValidationError);
  });

  await test('rejects caller-supplied id, hash, counts, timestamps or status', () => {
    for (const key of [
      'id',
      'contentHash',
      'characterCount',
      'wordCount',
      'createdAt',
      'status',
    ]) {
      const passage = validInput();
      passage.passages[0][key] = key === 'status' ? 'DRAFT' : 'x';
      assert.throws(() => parseTypingImport(passage), TypingValidationError);
    }
  });

  await test('accepts explicit null for every nullable field', () => {
    const input = validInput();
    input.exam.organization = null;
    Object.assign(input.version, {
      examYear: null,
      durationSeconds: null,
      targetWpm: null,
      maxErrorPercent: null,
      targetKeystrokes: null,
      instructions: null,
      ruleSourceUrl: null,
      ruleSourceNote: null,
    });
    Object.assign(input.passages[0], {
      examYear: null,
      shift: null,
      sourceUrl: null,
      sourceNote: null,
    });
    const parsed = parseTypingImport(input);
    assert.equal(parsed.exam.organization, null);
    assert.equal(parsed.passages[0]?.shift, null);
  });

  await test('rejects unknown editing and scoring methods and accepts legacy null', () => {
    for (const key of ['editingPolicy', 'scoringMethod']) {
      const input = validInput();
      input.version[key] = 'UNRESTRICTED';
      assert.throws(() => parseTypingImport(input), TypingValidationError);
      input.version[key] = 'anything';
      assert.throws(() => parseTypingImport(input), TypingValidationError);
      input.version[key] = null;
      assert.doesNotThrow(() => parseTypingImport(input));
    }
  });

  await test('accepts the approved correction editor without inventing scoring', () => {
    const input = validInput();
    input.version.editingPolicy = 'native-correction-v1';
    const parsed = parseTypingImport(input);
    assert.equal(parsed.version.editingPolicy, 'native-correction-v1');
    assert.equal(parsed.version.scoringMethod, null);
    input.version.scoringMethod = 'native-correction-v1';
    assert.throws(() => parseTypingImport(input), TypingValidationError);
  });

  await test('enforces slug, versionKey and contentKey alphabet and length bounds', () => {
    for (const bad of [
      '',
      'SSC',
      'has_underscore',
      'has space',
      'a'.repeat(65),
    ]) {
      const input = validInput();
      input.exam.slug = bad;
      assert.throws(() => parseTypingImport(input), TypingValidationError);
    }
    const input = validInput();
    input.exam.slug = 'a'.repeat(64);
    assert.doesNotThrow(() => parseTypingImport(input));

    const longVersionKey = validInput();
    longVersionKey.version.versionKey = 'k'.repeat(65);
    assert.throws(
      () => parseTypingImport(longVersionKey),
      TypingValidationError,
    );
  });

  await test('contentKey allows up to 128 characters', () => {
    const input = validInput();
    input.passages[0].contentKey = 'k'.repeat(128);
    assert.doesNotThrow(() => parseTypingImport(input));
    input.passages[0].contentKey = 'k'.repeat(129);
    assert.throws(() => parseTypingImport(input), TypingValidationError);
  });

  await test('enforces name, label, title, organization and shift bounds', () => {
    const input = validInput();
    input.exam.name = 'n'.repeat(200);
    assert.doesNotThrow(() => parseTypingImport(input));
    input.exam.name = 'n'.repeat(201);
    assert.throws(() => parseTypingImport(input), TypingValidationError);

    const padded = validInput();
    padded.exam.name = ' padded ';
    assert.throws(() => parseTypingImport(padded), TypingValidationError);

    const longOrg = validInput();
    longOrg.exam.organization = 'o'.repeat(201);
    assert.throws(() => parseTypingImport(longOrg), TypingValidationError);

    const longShift = validInput();
    longShift.passages[0].shift = 's'.repeat(101);
    assert.throws(() => parseTypingImport(longShift), TypingValidationError);

    const longTitle = validInput();
    longTitle.passages[0].title = 't'.repeat(201);
    assert.throws(() => parseTypingImport(longTitle), TypingValidationError);

    const emptyLabel = validInput();
    emptyLabel.version.label = '';
    assert.throws(() => parseTypingImport(emptyLabel), TypingValidationError);
  });

  await test('enforces instruction and note bounds', () => {
    const input = validInput();
    input.version.instructions = 'i'.repeat(10000);
    assert.doesNotThrow(() => parseTypingImport(input));
    input.version.instructions = 'i'.repeat(10001);
    assert.throws(() => parseTypingImport(input), TypingValidationError);

    const note = validInput();
    note.passages[0].sourceNote = 'n'.repeat(10001);
    assert.throws(() => parseTypingImport(note), TypingValidationError);
  });

  await test('enforces numeric bounds with explicit zero boundaries', () => {
    const input = validInput();
    input.version.examYear = 1899;
    assert.throws(() => parseTypingImport(input), TypingValidationError);
    input.version.examYear = 2101;
    assert.throws(() => parseTypingImport(input), TypingValidationError);
    input.version.examYear = 2024.5;
    assert.throws(() => parseTypingImport(input), TypingValidationError);
    input.version.examYear = '2024';
    assert.throws(() => parseTypingImport(input), TypingValidationError);
    input.version.examYear = 1900;
    assert.doesNotThrow(() => parseTypingImport(input));
    input.version.examYear = 2100;
    assert.doesNotThrow(() => parseTypingImport(input));

    const duration = validInput();
    duration.version.durationSeconds = 0;
    assert.throws(() => parseTypingImport(duration), TypingValidationError);
    duration.version.durationSeconds = 3601;
    assert.throws(() => parseTypingImport(duration), TypingValidationError);
    duration.version.durationSeconds = 3600;
    assert.doesNotThrow(() => parseTypingImport(duration));

    const wpm = validInput();
    wpm.version.targetWpm = 0;
    assert.throws(() => parseTypingImport(wpm), TypingValidationError);
    wpm.version.targetWpm = 1001;
    assert.throws(() => parseTypingImport(wpm), TypingValidationError);

    const errors = validInput();
    errors.version.maxErrorPercent = -0.5;
    assert.throws(() => parseTypingImport(errors), TypingValidationError);
    errors.version.maxErrorPercent = 100.5;
    assert.throws(() => parseTypingImport(errors), TypingValidationError);
    errors.version.maxErrorPercent = 0;
    assert.doesNotThrow(() => parseTypingImport(errors));
    errors.version.maxErrorPercent = 100;
    assert.doesNotThrow(() => parseTypingImport(errors));
    errors.version.maxErrorPercent = Number.POSITIVE_INFINITY;
    assert.throws(() => parseTypingImport(errors), TypingValidationError);

    const keystrokes = validInput();
    keystrokes.version.targetKeystrokes = 0;
    assert.throws(() => parseTypingImport(keystrokes), TypingValidationError);
    keystrokes.version.targetKeystrokes = 100001;
    assert.throws(() => parseTypingImport(keystrokes), TypingValidationError);
    keystrokes.version.targetKeystrokes = 100000;
    assert.doesNotThrow(() => parseTypingImport(keystrokes));
  });

  await test('accepts only the English language serialized as en', () => {
    const input = validInput();
    input.version.language = 'EN';
    assert.throws(() => parseTypingImport(input), TypingValidationError);
    input.version.language = 'hi';
    assert.throws(() => parseTypingImport(input), TypingValidationError);
    input.version.language = 'en';
    assert.doesNotThrow(() => parseTypingImport(input));
  });

  await test('accepts only the three declared source kinds', () => {
    for (const kind of [
      'OFFICIAL_PREVIOUS_YEAR',
      'RECONSTRUCTED',
      'PRACTICE',
    ]) {
      const input = validInput();
      input.passages[0].sourceKind = kind;
      assert.doesNotThrow(() => parseTypingImport(input));
    }
    const input = validInput();
    input.passages[0].sourceKind = 'OFFICIAL';
    assert.throws(() => parseTypingImport(input), TypingValidationError);
  });

  await test('validates source URLs as credential-free HTTP(S) up to 2048 characters', () => {
    const input = validInput();
    input.passages[0].sourceUrl = 'https://example.test/question-paper.pdf';
    assert.doesNotThrow(() => parseTypingImport(input));
    input.passages[0].sourceUrl = 'http://example.test';
    assert.doesNotThrow(() => parseTypingImport(input));
    for (const bad of [
      'ftp://example.test/file',
      'https://user:pass@example.test/file',
      'not a url',
      '//example.test/file',
      ' https://example.test ',
    ]) {
      const failing = validInput();
      failing.passages[0].sourceUrl = bad;
      assert.throws(() => parseTypingImport(failing), TypingValidationError);
    }
    const tooLong = validInput();
    tooLong.passages[0].sourceUrl = `https://example.test/${'a'.repeat(2028)}`;
    assert.throws(() => parseTypingImport(tooLong), TypingValidationError);
    const atLimit = validInput();
    atLimit.passages[0].sourceUrl = `https://example.test/${'a'.repeat(2048 - 'https://example.test/'.length)}`;
    assert.doesNotThrow(() => parseTypingImport(atLimit));
  });

  await test('revision is an explicit positive integer', () => {
    const input = validInput();
    input.passages[0].revision = 0;
    assert.throws(() => parseTypingImport(input), TypingValidationError);
    input.passages[0].revision = 1.5;
    assert.throws(() => parseTypingImport(input), TypingValidationError);
    input.passages[0].revision = '1';
    assert.throws(() => parseTypingImport(input), TypingValidationError);
    input.passages[0].revision = 2;
    assert.doesNotThrow(() => parseTypingImport(input));
  });

  await test('requires one to twenty passages and unique identities in the file', () => {
    assert.throws(() => {
      const input = validInput();
      input.passages = [];
      parseTypingImport(input);
    }, TypingValidationError);

    const duplicated = validInput();
    duplicated.passages.push({ ...duplicated.passages[0] });
    assert.throws(() => parseTypingImport(duplicated), TypingValidationError);

    const input = validInput();
    for (let i = 0; i < 19; i++)
      input.passages.push({
        ...input.passages[0],
        contentKey: `extra-passage-${i}`,
      });
    assert.equal(input.passages.length, 20);
    assert.doesNotThrow(() => parseTypingImport(input));
    input.passages.push({
      ...input.passages[0],
      contentKey: 'extra-passage-20',
    });
    assert.throws(() => parseTypingImport(input), TypingValidationError);
  });

  await test('rejects invalid passage text with the canonicalization rules', () => {
    const input = validInput();
    input.passages[0].text = 'contains \u0000 NUL';
    assert.throws(() => parseTypingImport(input), TypingValidationError);
    input.passages[0].text = '   ';
    assert.throws(() => parseTypingImport(input), TypingValidationError);
  });
});

await describe('importTypingContent validates before touching the database', async () => {
  await test('rejects untrusted input even when the import function is called directly', async () => {
    const { importTypingContent } = await import('../src/lib/typing-import.js');
    const input = validInput();
    input.exam.slug = 'UPPERCASE';
    const database = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: 'postgresql://invalid@127.0.0.1:1/unused',
      }),
    });
    await assert.rejects(
      () => importTypingContent(input, database, { apply: true }),
      TypingValidationError,
    );
    await database.$disconnect();
  });
});

await describe('parseImportCliArgs', async () => {
  await test('accepts a filename and an optional --apply flag', () => {
    assert.deepEqual(parseImportCliArgs(['file.json']), {
      filename: 'file.json',
      apply: false,
    });
    assert.deepEqual(parseImportCliArgs(['file.json', '--apply']), {
      filename: 'file.json',
      apply: true,
    });
  });

  await test('rejects a missing filename and every extra flag', () => {
    assert.throws(() => parseImportCliArgs([]), TypingValidationError);
    assert.throws(
      () => parseImportCliArgs(['file.json', '--dry-run']),
      TypingValidationError,
    );
    assert.throws(
      () => parseImportCliArgs(['file.json', '--apply', 'extra.json']),
      TypingValidationError,
    );
    assert.throws(
      () => parseImportCliArgs(['file.json', '--apply', '--apply']),
      TypingValidationError,
    );
  });
});
