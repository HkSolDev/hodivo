import type {
  ExamPage,
  ExamPassageSummary,
  ExamReason,
  ExamRules,
  ExamStartSnapshot,
  ExamSummary,
  ExamVersionDetail,
  ExamVersionSummary,
} from './exam-contract.js';
import { createExamSession } from './exam-session.js';

export type ExamErrorCode =
  'INVALID_REQUEST' | 'NOT_FOUND' | 'EXAM_NOT_READY' | 'SERVICE_UNAVAILABLE';

const ERROR_MESSAGES: Record<ExamErrorCode, string> = {
  INVALID_REQUEST: 'Invalid exam request.',
  NOT_FOUND: 'Exam content not found.',
  EXAM_NOT_READY: 'This exam is not ready to start.',
  SERVICE_UNAVAILABLE: 'Exam content is temporarily unavailable.',
};

const REASON_ORDER: readonly ExamReason[] = [
  'RULES_INCOMPLETE',
  'RULES_UNSUPPORTED',
  'SCORING_UNAVAILABLE',
  'NO_ELIGIBLE_PASSAGE',
];
const REASON_SET = new Set<string>(REASON_ORDER);
const BACKSPACE_POLICIES = [
  'UNRESTRICTED',
  'DISABLED',
  'CURRENT_WORD_ONLY',
] as const;
const SOURCE_KINDS = [
  'OFFICIAL_PREVIOUS_YEAR',
  'RECONSTRUCTED',
  'PRACTICE',
] as const;

export class ExamApiError extends Error {
  readonly code: ExamErrorCode;
  readonly status: number;
  readonly reasons: readonly ExamReason[];

  constructor(
    code: ExamErrorCode,
    status: number,
    reasons: readonly ExamReason[] = [],
  ) {
    super(ERROR_MESSAGES[code]);
    this.name = 'ExamApiError';
    this.code = code;
    this.status = status;
    this.reasons = reasons;
  }
}

export async function loadExams(
  signal: AbortSignal,
  cursor?: string,
): Promise<ExamPage<ExamSummary>> {
  const payload = await requestJson(
    withCursor('/api/typing/exams', cursor),
    signal,
  );
  return parsePage(payload, 'exams', parseExamSummary);
}

export async function loadExamVersions(
  examId: string,
  signal: AbortSignal,
  cursor?: string,
): Promise<ExamPage<ExamVersionSummary>> {
  const path = `/api/typing/exams/${encodeURIComponent(examId)}/versions`;
  const payload = await requestJson(withCursor(path, cursor), signal);
  const page = parsePage(payload, 'versions', parseExamVersionSummary);
  if (page.items.some((version) => version.examId !== examId))
    throw invalidPayload();
  return page;
}

export async function loadExamVersion(
  versionId: string,
  signal: AbortSignal,
): Promise<ExamVersionDetail> {
  const payload = await requestJson(
    `/api/typing/exam-versions/${encodeURIComponent(versionId)}`,
    signal,
  );
  const version = parseVersionDetail(
    requireKeys(payload, ['version'])['version'],
  );
  if (version.id !== versionId) throw invalidPayload();
  return version;
}

export async function loadExamPassages(
  versionId: string,
  signal: AbortSignal,
): Promise<ExamPassageSummary[]> {
  const payload = await requestJson(
    `/api/typing/exam-versions/${encodeURIComponent(versionId)}/passages`,
    signal,
  );
  const raw = requireKeys(payload, ['passages'])['passages'];
  if (!Array.isArray(raw)) throw invalidPayload();
  return raw.map(parsePassageSummary);
}

export async function loadExamSnapshot(
  versionId: string,
  signal: AbortSignal,
  passageId?: string,
): Promise<ExamStartSnapshot> {
  const query = passageId
    ? `?passageId=${encodeURIComponent(passageId)}`
    : '';
  const payload = await requestJson(
    `/api/typing/exam-versions/${encodeURIComponent(versionId)}/passage${query}`,
    signal,
  );
  const snapshot = parseStartSnapshot(
    requireKeys(payload, ['snapshot'])['snapshot'],
  );
  if (snapshot.version.id !== versionId) throw invalidPayload();
  createExamSession(snapshot);
  return snapshot;
}

async function requestJson(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
    headers: { accept: 'application/json' },
    signal,
  });
  if (!response.ok) throw await buildApiError(response);
  try {
    const payload: unknown = await response.json();
    return payload;
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw invalidPayload();
  }
}

async function buildApiError(response: Response): Promise<Error> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return new Error('Exam request failed.');
  }
  const envelope = parseErrorEnvelope(payload, response.status);
  return envelope
    ? new ExamApiError(envelope.code, response.status, envelope.reasons)
    : new Error('Exam request failed.');
}

function withCursor(path: string, cursor: string | undefined): string {
  return cursor === undefined
    ? path
    : `${path}?cursor=${encodeURIComponent(cursor)}`;
}

function parsePage<T>(
  payload: unknown,
  key: 'exams' | 'versions',
  parseItem: (item: unknown) => T,
): ExamPage<T> {
  const v = requireKeys(payload, [key, 'nextCursor']);
  const items = v[key];
  if (!Array.isArray(items) || items.length > 50) throw invalidPayload();
  return { items: items.map(parseItem), nextCursor: nid(v['nextCursor']) };
}

function parseExamSummary(value: unknown): ExamSummary {
  const v = requireKeys(value, ['id', 'slug', 'name', 'organization']);
  return {
    id: id(v['id']),
    slug: str(v['slug'], 64),
    name: str(v['name'], 200),
    organization: nstr(v['organization'], 200),
  };
}

function parseExamVersionSummary(value: unknown): ExamVersionSummary {
  return versionSummaryFields(
    requireKeys(value, [
      'id',
      'examId',
      'versionKey',
      'label',
      'language',
      'examYear',
    ]),
  );
}

function versionSummaryFields(v: Record<string, unknown>): ExamVersionSummary {
  return {
    id: id(v['id']),
    examId: id(v['examId']),
    versionKey: str(v['versionKey'], 64),
    label: str(v['label'], 200),
    language: enumOf(v['language'], ['en'] as const),
    examYear: nint(v['examYear'], 1900, 2100),
  };
}

function parseVersionDetail(value: unknown): ExamVersionDetail {
  const v = requireKeys(value, [
    'id',
    'examId',
    'versionKey',
    'label',
    'language',
    'examYear',
    'rules',
    'readiness',
    'rulesUpdatedAt',
  ]);
  const summary = versionSummaryFields(v);
  const rules = parseRules(v['rules']);
  const readiness = parseReadiness(v['readiness']);
  const rulesUpdatedAt = timestamp(v['rulesUpdatedAt']);
  if (
    (rules.scoringMethod !== null) !==
    readiness.reasons.includes('SCORING_UNAVAILABLE')
  )
    throw invalidPayload();
  return { ...summary, rules, readiness, rulesUpdatedAt };
}

function parseRules(value: unknown): ExamRules {
  const v = requireKeys(value, [
    'durationSeconds',
    'targetWpm',
    'targetKeystrokes',
    'maxErrorPercent',
    'backspacePolicy',
    'editingPolicy',
    'scoringMethod',
    'instructions',
    'ruleSourceUrl',
    'ruleSourceNote',
  ]);
  return {
    durationSeconds: nint(v['durationSeconds'], 1, 3600),
    targetWpm: nint(v['targetWpm'], 1, 1000),
    targetKeystrokes: nint(v['targetKeystrokes'], 1, 100000),
    maxErrorPercent: nnum(v['maxErrorPercent'], 0, 100),
    backspacePolicy: nenum(v['backspacePolicy'], BACKSPACE_POLICIES),
    editingPolicy: nstr(v['editingPolicy'], 10000),
    scoringMethod: nstr(v['scoringMethod'], 10000),
    instructions: nstr(v['instructions'], 10000),
    ruleSourceUrl: nstr(v['ruleSourceUrl'], 2048),
    ruleSourceNote: nstr(v['ruleSourceNote'], 10000),
  };
}

function parseReadiness(value: unknown): ExamVersionDetail['readiness'] {
  const v = requireKeys(value, ['canStart', 'reasons', 'scoringAvailable']);
  const { canStart, reasons, scoringAvailable } = v;
  if (typeof canStart !== 'boolean' || scoringAvailable !== false)
    throw invalidPayload();
  const parsed = readReasons(reasons);
  if (
    parsed === null ||
    !orderedReasons(parsed) ||
    canStart !== (parsed.length === 0)
  )
    throw invalidPayload();
  if (parsed.includes('SCORING_UNAVAILABLE') && scoringAvailable)
    throw invalidPayload();
  return { canStart, reasons: parsed, scoringAvailable };
}

function parseStartSnapshot(value: unknown): ExamStartSnapshot {
  const v = requireKeys(value, ['contractRevision', 'version', 'passage']);
  if (v['contractRevision'] !== 'exam-v1') throw invalidPayload();
  const version = parseVersionDetail(v['version']);
  const passage = parsePassage(v['passage']);
  if (!version.readiness.canStart || version.readiness.reasons.length > 0)
    throw invalidPayload();
  return { contractRevision: 'exam-v1', version, passage };
}

function parsePassageSummary(value: unknown): ExamPassageSummary {
  const v = requireKeys(value, [
    'id',
    'title',
    'sourceKind',
    'examYear',
    'shift',
  ]);
  return {
    id: id(v['id']),
    title: str(v['title'], 200),
    sourceKind: enumOf(v['sourceKind'], SOURCE_KINDS),
    examYear: nint(v['examYear'], 1900, 2100),
    shift: nstr(v['shift'], 100),
  };
}

function parsePassage(value: unknown): ExamStartSnapshot['passage'] {
  const v = requireKeys(value, [
    'id',
    'title',
    'text',
    'contentHash',
    'revision',
    'sourceKind',
    'sourceUrl',
    'sourceNote',
  ]);
  return {
    id: id(v['id']),
    title: str(v['title'], 200),
    text: passageText(v['text']),
    contentHash: contentHash(v['contentHash']),
    revision: int(v['revision'], 1, Number.MAX_SAFE_INTEGER),
    sourceKind: enumOf(v['sourceKind'], SOURCE_KINDS),
    sourceUrl: nstr(v['sourceUrl'], 2048),
    sourceNote: nstr(v['sourceNote'], 10000),
  };
}

function requireKeys(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (!isRecord(value) || !hasExactKeys(value, keys)) throw invalidPayload();
  return value;
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => key in value);
}

function readReasons(value: unknown): ExamReason[] | null {
  if (!Array.isArray(value)) return null;
  const out: ExamReason[] = [];
  for (const reason of value) {
    if (!isReason(reason)) return null;
    out.push(reason);
  }
  return out;
}

function orderedReasons(reasons: readonly ExamReason[]): boolean {
  let previous = -1;
  for (const reason of reasons) {
    const index = REASON_ORDER.indexOf(reason);
    if (index <= previous) return false;
    previous = index;
  }
  return true;
}

function parseErrorEnvelope(
  payload: unknown,
  status: number,
): { code: ExamErrorCode; reasons: ExamReason[] } | null {
  if (!isRecord(payload) || !hasExactKeys(payload, ['error'])) return null;
  const error = payload['error'];
  if (!isRecord(error)) return null;
  const keys = Object.keys(error);
  if (
    keys.length < 2 ||
    keys.length > 3 ||
    !('code' in error) ||
    !('message' in error)
  )
    return null;
  if (keys.length === 3 && !('reasons' in error)) return null;
  const message = error['message'];
  const code = error['code'];
  if (
    typeof message !== 'string' ||
    message.length === 0 ||
    message.length > 500 ||
    !isErrorCode(code)
  )
    return null;
  const statuses = {
    INVALID_REQUEST: 400,
    NOT_FOUND: 404,
    EXAM_NOT_READY: 409,
    SERVICE_UNAVAILABLE: 503,
  };
  if (statuses[code] !== status || message !== ERROR_MESSAGES[code])
    return null;
  if (keys.length === 2) return status === 409 ? null : { code, reasons: [] };
  if (status !== 409) return null;
  const reasons = readReasons(error['reasons']);
  if (reasons === null || reasons.length === 0 || !orderedReasons(reasons))
    return null;
  return { code, reasons };
}

const str = (value: unknown, max: number): string => {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    Array.from(value).length > max
  )
    throw invalidPayload();
  return value;
};
const nstr = (value: unknown, max: number): string | null =>
  value === null ? null : str(value, max);
const int = (value: unknown, min: number, max: number): number => {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  )
    throw invalidPayload();
  return value;
};
const nint = (value: unknown, min: number, max: number): number | null =>
  value === null ? null : int(value, min, max);
const num = (value: unknown, min: number, max: number): number => {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw invalidPayload();
  return value;
};
const nnum = (value: unknown, min: number, max: number): number | null =>
  value === null ? null : num(value, min, max);
const id = (value: unknown): string => {
  if (typeof value !== 'string' || !/^[a-z0-9]{1,64}$/.test(value))
    throw invalidPayload();
  return value;
};
const nid = (value: unknown): string | null =>
  value === null ? null : id(value);
const enumOf = <T extends string>(value: unknown, allowed: readonly T[]): T => {
  if (typeof value !== 'string') throw invalidPayload();
  const text: string = value;
  for (const option of allowed) {
    if (option === text) return option;
  }
  throw invalidPayload();
};
const nenum = <T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | null => (value === null ? null : enumOf(value, allowed));
const timestamp = (value: unknown): string => {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value) ||
    Number.isNaN(Date.parse(value))
  )
    throw invalidPayload();
  return value;
};
const passageText = (value: unknown): string => {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 50_000 ||
    !/^[\x20-\x7e\t\n]+$/.test(value) ||
    !/[!-~]/.test(value)
  )
    throw invalidPayload();
  return value;
};
const contentHash = (value: unknown): string => {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    throw invalidPayload();
  return value;
};
const isReason = (value: unknown): value is ExamReason =>
  typeof value === 'string' && REASON_SET.has(value);
const isErrorCode = (value: unknown): value is ExamErrorCode =>
  typeof value === 'string' && Object.hasOwn(ERROR_MESSAGES, value);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const invalidPayload = (): Error => new Error('Exam response was invalid.');
const isAbortError = (error: unknown): boolean =>
  error instanceof Error && error.name === 'AbortError';
