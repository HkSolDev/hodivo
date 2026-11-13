import type { TypingBackspacePolicy as BackspacePolicy } from '../../generated/prisma/index.js';
import {
  TypingContentError,
  canonicalizePassageText,
  countCodePoints,
  countWords,
  hashCanonicalPassageText,
} from './typing-content.js';
export class TypingValidationError extends Error {}
const MAX_PASSAGES = 20;
const IDENTITY_PATTERN = /^[a-z0-9-]+$/;
const SOURCE_KINDS = [
  'OFFICIAL_PREVIOUS_YEAR',
  'RECONSTRUCTED',
  'PRACTICE',
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];
export interface TypingExamInput {
  slug: string;
  name: string;
  organization: string | null;
}

export interface TypingVersionInput {
  versionKey: string;
  label: string;
  language: 'en';
  examYear: number | null;
  durationSeconds: number | null;
  backspacePolicy: BackspacePolicy | null;
  editingPolicy: 'native-correction-v1' | null;
  scoringMethod: null;
  targetWpm: number | null;
  maxErrorPercent: number | null;
  targetKeystrokes: number | null;
  instructions: string | null;
  ruleSourceUrl: string | null;
  ruleSourceNote: string | null;
}

export interface TypingPassageInput {
  contentKey: string;
  revision: number;
  title: string;
  text: string;
  examYear: number | null;
  shift: string | null;
  sourceKind: SourceKind;
  sourceUrl: string | null;
  sourceNote: string | null;
  contentHash: string;
  characterCount: number;
  wordCount: number;
}

export interface TypingImportInput {
  exam: TypingExamInput;
  version: TypingVersionInput;
  passages: TypingPassageInput[];
}

function validateMetadataCharacters(
  value: string,
  label: string,
  multiline: boolean,
) {
  for (const character of value) {
    const code = character.codePointAt(0)!;
    if (multiline && (code === 10 || code === 9)) continue;
    if (
      code < 32 ||
      code === 127 ||
      (!multiline && code >= 128 && code <= 159) ||
      (code >= 0xd800 && code <= 0xdfff)
    )
      fail(`${label} contains unsupported characters`);
  }
}
function parseBackspacePolicy(value: unknown): BackspacePolicy | null {
  if (
    value === null ||
    value === 'UNRESTRICTED' ||
    value === 'DISABLED' ||
    value === 'CURRENT_WORD_ONLY'
  )
    return value;
  fail('Unsupported backspacePolicy');
}
function fail(message: string): never {
  throw new TypingValidationError(message);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!isPlainObject(value)) fail(`${label} must be an object`);
  return value;
}

function requireKeys(
  object: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  for (const key of Object.keys(object))
    if (!keys.includes(key)) fail(`Unknown field in ${label}`);
  for (const key of keys)
    if (!Object.hasOwn(object, key)) fail(`Missing field "${key}" in ${label}`);
}

function requiredIdentityKey(
  value: unknown,
  label: string,
  max: number,
): string {
  if (typeof value !== 'string') fail(`${label} must be a string`);
  if (!IDENTITY_PATTERN.test(value) || value.length > max)
    fail(
      `${label} must be lowercase letters, digits and hyphens, at most ${max} characters`,
    );
  return value;
}

function requiredText(
  value: unknown,
  label: string,
  max: number,
  multiline = false,
): string {
  if (typeof value !== 'string') fail(`${label} must be a string or null`);
  if (countCodePoints(value) < 1 || countCodePoints(value) > max)
    fail(`${label} must be 1-${max} characters`);
  validateMetadataCharacters(value, label, multiline);
  if (value !== value.trim())
    fail(`${label} must not have surrounding whitespace`);
  return value;
}

function optionalText(
  value: unknown,
  label: string,
  max: number,
  multiline = false,
): string | null {
  if (value === null) return null;
  return requiredText(value, label, max, multiline);
}

function optionalInteger(
  value: unknown,
  label: string,
  min: number,
  max: number,
): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value))
    fail(`${label} must be an integer or null`);
  if (value < min || value > max)
    fail(`${label} must be between ${min} and ${max}`);
  return value;
}

function optionalPercent(value: unknown, label: string): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value))
    fail(`${label} must be a finite number or null`);
  if (value < 0 || value > 100) fail(`${label} must be between 0 and 100`);
  return value;
}

function optionalSourceUrl(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') fail('sourceUrl must be a string or null');
  if (value !== value.trim())
    fail('sourceUrl must not have surrounding whitespace');
  validateMetadataCharacters(value, 'sourceUrl', false);
  if (countCodePoints(value) > 2048)
    fail('sourceUrl must be at most 2048 characters');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    fail('sourceUrl must be an absolute HTTP(S) URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    fail('sourceUrl must be an absolute HTTP(S) URL');
  if (url.username || url.password)
    fail('sourceUrl must not contain embedded credentials');
  return value;
}

function policyNull(value: unknown, label: string): null {
  if (value !== null)
    fail(`${label} accepts only null in this first import contract`);
  return null;
}

function parseEditingPolicy(value: unknown): 'native-correction-v1' | null {
  if (value === null || value === 'native-correction-v1') return value;
  return fail('Unsupported version editingPolicy');
}

function requireEnglish(value: unknown): 'en' {
  if (value !== 'en') fail('Only the language "en" is accepted');
  return 'en';
}

function requireSourceKind(value: unknown): SourceKind {
  for (const kind of SOURCE_KINDS) if (value === kind) return kind;
  fail(`sourceKind must be one of ${SOURCE_KINDS.join(', ')}`);
}

function requiredRevision(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value))
    fail(`${label} must be an integer`);
  if (value < 1 || value > 2_147_483_647)
    fail(`${label} must be a positive integer up to 2147483647`);
  return value;
}

function parsePassageText(value: unknown, label: string): string {
  try {
    return canonicalizePassageText(value);
  } catch (error) {
    if (error instanceof TypingContentError) fail(`${label}: ${error.message}`);
    throw error;
  }
}

const EXAM_KEYS = ['slug', 'name', 'organization'] as const;
const VERSION_KEYS = [
  'versionKey',
  'label',
  'language',
  'examYear',
  'durationSeconds',
  'backspacePolicy',
  'editingPolicy',
  'scoringMethod',
  'targetWpm',
  'maxErrorPercent',
  'targetKeystrokes',
  'instructions',
  'ruleSourceUrl',
  'ruleSourceNote',
] as const;
const PASSAGE_KEYS = [
  'contentKey',
  'revision',
  'title',
  'text',
  'examYear',
  'shift',
  'sourceKind',
  'sourceUrl',
  'sourceNote',
] as const;

function parseExam(value: unknown): TypingExamInput {
  const exam = requireObject(value, 'exam');
  requireKeys(exam, EXAM_KEYS, 'exam');
  return {
    slug: requiredIdentityKey(exam.slug, 'exam slug', 64),
    name: requiredText(exam.name, 'exam name', 200),
    organization: optionalText(exam.organization, 'exam organization', 200),
  };
}

function parseVersion(value: unknown): TypingVersionInput {
  const version = requireObject(value, 'version');
  requireKeys(version, VERSION_KEYS, 'version');
  return {
    versionKey: requiredIdentityKey(
      version.versionKey,
      'version versionKey',
      64,
    ),
    label: requiredText(version.label, 'version label', 200),
    language: requireEnglish(version.language),
    examYear: optionalInteger(version.examYear, 'version examYear', 1900, 2100),
    durationSeconds: optionalInteger(
      version.durationSeconds,
      'version durationSeconds',
      1,
      3600,
    ),
    backspacePolicy: parseBackspacePolicy(version.backspacePolicy),
    editingPolicy: parseEditingPolicy(version.editingPolicy),
    scoringMethod: policyNull(version.scoringMethod, 'version scoringMethod'),
    targetWpm: optionalInteger(version.targetWpm, 'version targetWpm', 1, 1000),
    maxErrorPercent: optionalPercent(
      version.maxErrorPercent,
      'version maxErrorPercent',
    ),
    targetKeystrokes: optionalInteger(
      version.targetKeystrokes,
      'version targetKeystrokes',
      1,
      100000,
    ),
    instructions: optionalText(
      version.instructions,
      'version instructions',
      10000,
      true,
    ),
    ruleSourceUrl: optionalSourceUrl(version.ruleSourceUrl),
    ruleSourceNote: optionalText(
      version.ruleSourceNote,
      'version ruleSourceNote',
      10000,
      true,
    ),
  };
}

function parsePassage(value: unknown, index: number): TypingPassageInput {
  const label = `passage ${index + 1}`;
  const passage = requireObject(value, label);
  requireKeys(passage, PASSAGE_KEYS, label);
  const text = parsePassageText(passage.text, label);
  return {
    contentKey: requiredIdentityKey(
      passage.contentKey,
      `${label} contentKey`,
      128,
    ),
    revision: requiredRevision(passage.revision, `${label} revision`),
    title: requiredText(passage.title, `${label} title`, 200),
    text,
    examYear: optionalInteger(
      passage.examYear,
      `${label} examYear`,
      1900,
      2100,
    ),
    shift: optionalText(passage.shift, `${label} shift`, 100),
    sourceKind: requireSourceKind(passage.sourceKind),
    sourceUrl: optionalSourceUrl(passage.sourceUrl),
    sourceNote: optionalText(
      passage.sourceNote,
      `${label} sourceNote`,
      10000,
      true,
    ),
    contentHash: hashCanonicalPassageText(text),
    characterCount: countCodePoints(text),
    wordCount: countWords(text),
  };
}

export function parseTypingImport(input: unknown): TypingImportInput {
  const root = requireObject(input, 'content file');
  requireKeys(root, ['exam', 'version', 'passages'], 'content file');
  if (!Array.isArray(root.passages)) fail('passages must be an array');
  if (root.passages.length < 1)
    fail('passages must contain at least one passage');
  if (root.passages.length > MAX_PASSAGES)
    fail(`passages must contain at most ${MAX_PASSAGES} passages`);
  const passages = root.passages.map((passage, index) =>
    parsePassage(passage, index),
  );
  const identities = new Set(
    passages.map((passage) => `${passage.contentKey}#${passage.revision}`),
  );
  if (identities.size !== passages.length)
    fail('passages must not repeat a contentKey and revision in one file');
  return {
    exam: parseExam(root.exam),
    version: parseVersion(root.version),
    passages,
  };
}
