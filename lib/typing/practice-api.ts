export interface PracticePassage {
  id: string;
  title: string;
  text: string;
}

const endpoint = '/api/typing/practice-passage';

export async function loadPracticePassage(
  signal: AbortSignal,
  passageId?: string,
): Promise<PracticePassage | null> {
  const url = passageId
    ? `${endpoint}/${encodeURIComponent(passageId)}`
    : endpoint;
  const response = await fetch(url, { cache: 'no-store', signal });
  if (response.status === 404 && passageId) return null;
  if (!response.ok) throw new Error('Practice passage request failed.');

  const payload: unknown = await response.json();
  if (!isRecord(payload) || !hasOnlyKeys(payload, ['passage'])) {
    throw new Error('Practice passage response was invalid.');
  }
  if (payload.passage === null) return null;
  if (
    !isRecord(payload.passage) ||
    !hasOnlyKeys(payload.passage, ['id', 'title', 'text'])
  ) {
    throw new Error('Practice passage response was invalid.');
  }
  const { id, title, text } = payload.passage;
  if (
    typeof id !== 'string' ||
    id.length === 0 ||
    id.length > 128 ||
    typeof title !== 'string' ||
    title.length === 0 ||
    Array.from(title).length > 200 ||
    typeof text !== 'string' ||
    !isSupportedPassageText(text)
  ) {
    throw new Error('Practice passage response was invalid.');
  }
  return { id, title, text };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => key in value);
}

function isSupportedPassageText(value: string): boolean {
  return (
    value.length >= 1 &&
    value.length <= 50_000 &&
    /^[\t\n -~]+$/.test(value) &&
    /[!-~]/.test(value)
  );
}
