import { pathToFileURL } from 'node:url';
import {
  TypingContentError,
  readTypingContentFile,
} from '../src/lib/typing-content.js';
import {
  TypingImportConflictError,
  TypingValidationError,
  importTypingContent,
  parseTypingImport,
} from '../src/lib/typing-import.js';
import type { PrismaClient } from '../generated/prisma/index.js';

export function parseImportCliArgs(argv: readonly string[]): {
  filename: string;
  apply: boolean;
} {
  const [filename, ...flags] = argv;
  if (!filename || filename.startsWith('--'))
    throw new TypingValidationError(
      'usage: import-typing-content <content-file.json> [--apply]',
    );
  let apply = false;
  for (const flag of flags) {
    if (flag !== '--apply')
      throw new TypingValidationError(
        'Only the optional --apply flag is accepted',
      );
    if (apply)
      throw new TypingValidationError('--apply was given more than once');
    apply = true;
  }
  return { filename, apply };
}

// Errors surfaced to the operator must never include a database URL, a stack
// trace or imported content; only our own bounded validation messages pass.
function safeReason(error: unknown): string {
  if (
    error instanceof TypingContentError ||
    error instanceof TypingValidationError ||
    error instanceof TypingImportConflictError
  )
    return error.message;
  return 'import_failed';
}

function isEntryScript(): boolean {
  return (
    Boolean(process.argv[1]) &&
    import.meta.url === pathToFileURL(process.argv[1]).href
  );
}

if (isEntryScript()) {
  let database: PrismaClient | null = null;
  try {
    const { filename, apply } = parseImportCliArgs(process.argv.slice(2));
    const input = await readTypingContentFile(filename);
    // Dry-run is the default; --apply is required for any database write, and
    // the database module is imported only after the whole input validates.
    parseTypingImport(input);
    const imported = await import('../src/db.js');
    database = imported.prisma;
    const result = await importTypingContent(input, database, { apply });
    console.log(JSON.stringify(result, null, 2));
    if (result.conflicted) process.exitCode = 1;
  } catch (error) {
    process.exitCode = 1;
    console.error(
      JSON.stringify({ status: 'error', reason: safeReason(error) }),
    );
  } finally {
    try {
      await database?.$disconnect();
    } catch {
      process.exitCode = 1;
      console.error(
        JSON.stringify({ status: 'error', reason: 'disconnect_failed' }),
      );
    }
  }
}
