export interface PracticePassage {
  id: string;
  title: string;
  text: string;
  language?: 'hi';
}

import { HINDI_EXAM_LETTER, HINDI_EXAM_TEXT } from './exam-contract';

const endpoint = '/api/typing/practice-passage';

export async function loadPracticePassage(
  signal: AbortSignal,
  passageId?: string,
): Promise<PracticePassage | null> {
  const path = passageId
    ? `${endpoint}s/${encodeURIComponent(passageId)}`
    : endpoint;
  const response = await fetch(path, { cache: 'no-store', signal });
  if (passageId && response.status === 404) return null;
  if (!response.ok) throw new Error('Practice passage request failed.');

  const payload: unknown = await response.json();
  if (!isRecord(payload) || !hasOnlyKeys(payload, ['passage'])) {
    throw new Error('Practice passage response was invalid.');
  }
  if (payload.passage === null) return null;
  if (
    !isRecord(payload.passage) ||
    !hasOnlyKeys(
      payload.passage,
      payload.passage.language === 'hi'
        ? ['id', 'title', 'text', 'language']
        : ['id', 'title', 'text'],
    )
  ) {
    throw new Error('Practice passage response was invalid.');
  }
  const { id, title, text, language } = payload.passage;
  if (
    typeof id !== 'string' ||
    id.length === 0 ||
    id.length > 128 ||
    typeof title !== 'string' ||
    title.length === 0 ||
    Array.from(title).length > 200 ||
    typeof text !== 'string' ||
    !isSupportedPassageText(text, language === 'hi')
  ) {
    throw new Error('Practice passage response was invalid.');
  }
  return language === 'hi'
    ? { id, title, text, language }
    : { id, title, text };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => key in value);
}

function isSupportedPassageText(value: string, hindi: boolean): boolean {
  return (
    value.length >= 1 &&
    value.length <= 50_000 &&
    (hindi
      ? HINDI_EXAM_TEXT.test(value) && HINDI_EXAM_LETTER.test(value)
      : /^[\t\n -~]+$/.test(value) && /[!-~]/.test(value))
  );
}

export async function loadPracticeCatalogue(
  signal: AbortSignal,
  cursor?: string,
) {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  const response = await fetch(`${endpoint}s${query}`, {
    cache: 'no-store',
    signal,
  });
  if (!response.ok) throw new Error('Practice catalogue request failed.');
  const payload: unknown = await response.json();
  if (
    !isRecord(payload) ||
    !Array.isArray(payload.passages) ||
    !payload.passages.every(
      (item: unknown) =>
        isRecord(item) &&
        typeof item.id === 'string' &&
        typeof item.title === 'string',
    ) ||
    (payload.nextCursor !== null && typeof payload.nextCursor !== 'string')
  ) {
    throw new Error('Practice catalogue response was invalid.');
  }
  return {
    passages: payload.passages as Pick<PracticePassage, 'id' | 'title'>[],
    nextCursor: payload.nextCursor,
  };
}
