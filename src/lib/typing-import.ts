import type { PrismaClient, Prisma } from '../../generated/prisma/index.js';
import {
  parseTypingImport,
  type TypingImportInput,
  type TypingPassageInput,
} from './typing-import-input.js';
export {
  parseTypingImport,
  TypingValidationError,
} from './typing-import-input.js';

export class TypingImportConflictError extends Error {}
type Outcome = 'create' | 'noop' | 'conflict';

function sameFields(expected: object, stored: object) {
  return Object.entries(expected).every(
    ([key, value]) => Reflect.get(stored, key) === value,
  );
}
function outcome(expected: object, stored: object | null): Outcome {
  return stored === null
    ? 'create'
    : sameFields(expected, stored)
      ? 'noop'
      : 'conflict';
}
function passageFields(passage: TypingPassageInput) {
  return {
    contentKey: passage.contentKey,
    revision: passage.revision,
    title: passage.title,
    text: passage.text,
    contentHash: passage.contentHash,
    sourceKind: passage.sourceKind,
    examYear: passage.examYear,
    shift: passage.shift,
    sourceUrl: passage.sourceUrl,
    sourceNote: passage.sourceNote,
  };
}

async function inspectImport(
  input: TypingImportInput,
  tx: Prisma.TransactionClient,
) {
  const exam = await tx.typingExam.findUnique({
    where: { slug: input.exam.slug },
  });
  const version = exam
    ? await tx.typingExamVersion.findUnique({
        where: {
          examId_versionKey: {
            examId: exam.id,
            versionKey: input.version.versionKey,
          },
        },
      })
    : null;
  const passages = [];
  for (const passage of input.passages) {
    const stored = version
      ? await tx.typingPassage.findUnique({
          where: {
            examVersionId_contentKey_revision: {
              examVersionId: version.id,
              contentKey: passage.contentKey,
              revision: passage.revision,
            },
          },
        })
      : null;
    passages.push({
      passage,
      outcome: outcome(passageFields(passage), stored),
    });
  }
  return {
    exam,
    version,
    examOutcome: outcome(input.exam, exam),
    versionOutcome: outcome(input.version, version),
    passages,
  };
}

export async function importTypingContent(
  input: unknown,
  database: PrismaClient,
  options: { apply?: boolean } = {},
) {
  const parsed = parseTypingImport(input);
  try {
    return await database.$transaction(
      async (tx) => {
        const plan = await inspectImport(parsed, tx);
        const conflicted =
          plan.examOutcome === 'conflict' ||
          plan.versionOutcome === 'conflict' ||
          plan.passages.some((item) => item.outcome === 'conflict');
        if (options.apply && conflicted)
          throw new TypingImportConflictError(
            'Existing catalogue identity has different content; use a new version or revision.',
          );
        if (options.apply) {
          const exam =
            plan.exam ?? (await tx.typingExam.create({ data: parsed.exam }));
          const version =
            plan.version ??
            (await tx.typingExamVersion.create({
              data: { ...parsed.version, examId: exam.id },
            }));
          for (const item of plan.passages) {
            if (item.outcome === 'create')
              await tx.typingPassage.create({
                data: {
                  ...passageFields(item.passage),
                  examVersionId: version.id,
                },
              });
          }
          // Query only this file's bounded identities; verify storage before commit.
          const readBack = await inspectImport(parsed, tx);
          if (
            readBack.examOutcome !== 'noop' ||
            readBack.versionOutcome !== 'noop' ||
            readBack.passages.some((item) => item.outcome !== 'noop')
          )
            throw new TypingImportConflictError(
              'Imported content failed transactional read-back verification.',
            );
        }
        return {
          applied: options.apply === true,
          conflicted,
          exam: { ...parsed.exam, outcome: plan.examOutcome },
          version: { ...parsed.version, outcome: plan.versionOutcome },
          passages: plan.passages.map(({ passage, outcome }) => ({
            contentKey: passage.contentKey,
            revision: passage.revision,
            title: passage.title,
            sourceKind: passage.sourceKind,
            text: passage.text,
            contentHash: passage.contentHash,
            characterCount: passage.characterCount,
            wordCount: passage.wordCount,
            outcome,
          })),
        };
      },
      { isolationLevel: 'Serializable', maxWait: 5000, timeout: 15000 },
    );
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      (error.code === 'P2002' || error.code === 'P2034')
    )
      throw new TypingImportConflictError(
        'Concurrent import conflict; rerun the explicit import to check its outcome.',
      );
    throw error;
  }
}
