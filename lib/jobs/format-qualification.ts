export interface QualificationPoint {
  lead?: string;
  body: string;
}

export interface QualificationSummary {
  points: string[];
  chips: string[];
}

interface ChipRule {
  label: string;
  pattern: RegExp;
}

const CHIP_RULES: ChipRule[] = [
  { label: 'Domicile req.', pattern: /\bdomicile\b/i },
  {
    label: 'Fresher OK',
    pattern: /\bfresher[- ]?eligible\b|\bno (?:prior )?experience required\b/i,
  },
  {
    label: 'Experience req.',
    pattern:
      /(?<!\bno\s)(?<!\bno prior\s)\bexperience required\b|\bminimum [1-9]\d*\s*years?\b/i,
  },
  { label: 'Bonus marks', pattern: /\bbonus marks\b|\bage relaxation\b/i },
];

/**
 * Splits inline bulleted or newline-separated qualification strings from the DB
 * into clean individual points without altering stored records.
 */
export function splitQualificationPoints(
  text: string | null | undefined,
): string[] {
  if (!text) return [];
  const trimmed = text.trim();
  if (!trimmed || /^not specified$/i.test(trimmed)) return [];

  return trimmed
    .split(/\s*•\s*|\r?\n+|(?:^|\s+)[-–*]\s+/)
    .map((part) => part.replace(/^[•\-–*\s]+/, '').trim())
    .filter(Boolean);
}

/**
 * Extracts up to 3 high-signal scannable chips (e.g. Domicile, Fresher OK)
 * and clean bullet points from a qualification string.
 */
export function summarizeQualification(
  text: string | null | undefined,
): QualificationSummary {
  const points = splitQualificationPoints(text);
  const joined = points.join(' ');
  const chips: string[] = [];

  for (const rule of CHIP_RULES) {
    if (rule.pattern.test(joined) && !chips.includes(rule.label)) {
      chips.push(rule.label);
      if (chips.length === 3) break;
    }
  }

  return { points, chips };
}

/**
 * Strips verbose parenthetical boilerplate on list cards while keeping the core requirement.
 */
export function shortenQualificationPoint(point: string): string {
  return point
    .replace(/\s*\([^)]{24,}\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+\./g, '.')
    .trim();
}

/**
 * Splits a bullet point into a scannable lead-in and body when a colon or
 * natural delimiter is present, aiding fast eye-tracking.
 */
export function splitLeadAndBody(point: string): QualificationPoint {
  const colonIdx = point.indexOf(':');
  if (colonIdx > 2 && colonIdx <= 32) {
    return {
      lead: point.slice(0, colonIdx + 1).trim(),
      body: point.slice(colonIdx + 1).trim(),
    };
  }
  return { body: point };
}
