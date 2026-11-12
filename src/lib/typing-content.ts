import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';

const MAX_FILE_BYTES = 1_048_576;
export const MAX_PASSAGE_TEXT_CODE_POINTS = 50_000;

export class TypingContentError extends Error {}

export async function readTypingContentFile(path: string): Promise<unknown> {
  const file = await open(path, 'r');
  const buffer = Buffer.alloc(MAX_FILE_BYTES + 1);
  let length = 0;
  try {
    if (!(await file.stat()).isFile())
      throw new TypingContentError('Content input must be a regular file');
    while (length < buffer.length) {
      const { bytesRead } = await file.read(
        buffer,
        length,
        buffer.length - length,
        null,
      );
      if (bytesRead === 0) break;
      length += bytesRead;
    }
  } finally {
    await file.close();
  }
  if (length > MAX_FILE_BYTES)
    throw new TypingContentError('Content file exceeds the 1 MiB limit');
  const raw = buffer.subarray(0, length);
  const bytes = raw;
  let text: string;
  // ignoreBOM keeps a leading BOM as U+FEFF so exactly one can be allowed
  // here; any further leading BOM is rejected instead of silently stripped.
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      bytes,
    );
  } catch {
    throw new TypingContentError('Content file is not valid UTF-8');
  }
  if (text.startsWith('\uFEFF')) {
    text = text.slice(1);
    if (text.startsWith('\uFEFF'))
      throw new TypingContentError(
        'Content file has more than one leading BOM',
      );
  }
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    throw new TypingContentError('Content file is not valid JSON');
  }
}

export function canonicalizePassageText(raw: unknown): string {
  if (typeof raw !== 'string')
    throw new TypingContentError('Passage text must be a string');
  const canonical = raw.replace(/\r\n?/g, '\n');
  for (const character of canonical) {
    const code = character.codePointAt(0);
    if (code === 0x0a || code === 0x09) continue;
    if (code !== undefined && code >= 0xd800 && code <= 0xdfff)
      throw new TypingContentError('Passage text contains unpaired surrogates');
    if (code === undefined || (code < 0x20 && code !== 0x09) || code === 0x7f)
      throw new TypingContentError(
        'Passage text contains forbidden control characters',
      );
  }
  if (/^[\p{White_Space}]*$/u.test(canonical))
    throw new TypingContentError(
      'Passage text must not be empty or whitespace-only',
    );
  if (countCodePoints(canonical) > MAX_PASSAGE_TEXT_CODE_POINTS)
    throw new TypingContentError(
      `Passage text exceeds ${MAX_PASSAGE_TEXT_CODE_POINTS} code points`,
    );
  return canonical;
}

export function hashCanonicalPassageText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function countCodePoints(text: string): number {
  return [...text].length;
}

export function countWords(text: string): number {
  return text.split(/\p{White_Space}+/u).filter((word) => word.length > 0)
    .length;
}
