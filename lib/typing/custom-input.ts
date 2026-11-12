// Validation for the two custom inputs (frozen typing-practice-v1 rules).
// Rejections are returned as reasons so the UI can explain them visibly.
export const MAX_CUSTOM_PASSAGE_LENGTH = 10000;
export const MIN_CUSTOM_DURATION_SECONDS = 1;
export const MAX_CUSTOM_DURATION_SECONDS = 3600;

// English printable ASCII plus whitespace only; other scripts and emoji are
// rejected instead of being silently scored with code-unit comparisons.
const ALLOWED_PASSAGE_CHARS = /^[\x20-\x7E\s]*$/;

export type CustomPassageResult =
  | { ok: true; passage: string }
  | {
      ok: false;
      reason: 'unsupported-characters' | 'empty' | 'too-long';
    };

export function validateCustomPassage(raw: string): CustomPassageResult {
  if (!ALLOWED_PASSAGE_CHARS.test(raw)) {
    return { ok: false, reason: 'unsupported-characters' };
  }
  // Same whitespace normalization as the original practice controller.
  const passage = raw.trim().replace(/\s+/g, ' ');
  if (passage.length === 0) {
    return { ok: false, reason: 'empty' };
  }
  if (passage.length > MAX_CUSTOM_PASSAGE_LENGTH) {
    return { ok: false, reason: 'too-long' };
  }
  return { ok: true, passage };
}

export function parseCustomDuration(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const seconds = Number(trimmed);
  if (
    seconds < MIN_CUSTOM_DURATION_SECONDS ||
    seconds > MAX_CUSTOM_DURATION_SECONDS
  ) {
    return null;
  }
  return seconds;
}

// Shared with the session engine so typing input and custom passages use one
// definition of what may be scored.
export function isSupportedTypingText(text: string): boolean {
  return ALLOWED_PASSAGE_CHARS.test(text);
}
