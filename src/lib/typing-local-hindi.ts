import {
  HINDI_EXAM_LETTER,
  HINDI_EXAM_TEXT,
} from '../../lib/typing/exam-contract.js';
import { Prisma } from '../../generated/prisma/index.js';

export const localHindiVersion = {
  status: 'DRAFT',
  language: 'hi',
  versionKey: 'ssc-hindi-30wpm-2026-v1',
  exam: { slug: 'ssc-hindi-typing-master' },
} as const;

export function isLocalHindiEnabled(): boolean {
  return (
    process.env.NODE_ENV === 'development' &&
    process.env.APTUS_LOCAL_HINDI_EXAM === '1'
  );
}

export const hindiPracticeText = Prisma.sql`
  p."sourceKind" = 'PRACTICE'
  AND p."text" COLLATE "C" ~ ${HINDI_EXAM_TEXT.source.replaceAll('\\t', '\t').replaceAll('\\n', '\n')}
  AND p."text" COLLATE "C" ~ ${HINDI_EXAM_LETTER.source}
`;

export const localHindiPassage = Prisma.sql`p."status" = 'DRAFT' AND ${hindiPracticeText}`;
