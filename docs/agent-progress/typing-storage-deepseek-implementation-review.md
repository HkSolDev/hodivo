> Coordinator note: historical implementation/draft review. Final corrected candidate is verified locally but not integrated; exact-commit free-agent review is blocked. See [current handoff](../TYPING_STORAGE_IMPLEMENTATION_REVIEW.md).

# Typing draft storage: independent implementation-review preparation

Date: 12 November 2026
Reviewer: DeepSeek independent review lane
Batch: `typing-storage-implementation-20261112`
Contract: `storage-draft-v1` (frozen)
Status: **static preparation only; not implementation acceptance**

## Baseline and boundary acknowledgement

I acknowledge the exact baseline `a600ef65ed1cd194a7ad18b55a9fb3ac1b8d909f`,
worktree `/private/tmp/aptus-typing-storage-review`, and reviewer branch
`codex/typing-storage-review-20261112`. The only path I write is
`docs/agent-progress/typing-storage-deepseek-implementation-review.md`.
The implementation worktree was not read and no implementation diff has been
accepted or rejected yet.

No runtime, test, database, migration, network, provider, install, commit, push
or deployment action was performed. No `.env` file was read or loaded. The
untracked batch document
`docs/AGENT_COORDINATION_2026-11-12-typing-storage-implementation.md` is the
expected coordination record, not implementation.

Approval boundary: the frozen contract approves draft-only catalogue storage
and import semantics. It does **not** approve a read API, frontend, publication
command, attempts/history, live migration, deployment, seed data, or any new
field, enum member, default, update/upsert path, normalization mode, alternate
count unit, or fallback database. A reviewer may not accept beyond that
boundary, and an implementation may not redefine it. Static preparation is not
acceptance; acceptance requires the exact handoff diff, pure tests, migration
review, and the coordinator's isolated-database proof.

## Existing patterns inspected (baseline only)

- `prisma/schema.prisma:6-13` uses `prisma-client-js` output `../generated/prisma`;
  `src/db.ts:4` reads `DATABASE_URL` and constructs the adapter at module import.
- `scripts/helpers/auth-database.ts:8-33` creates a random schema and applies every
  directory under `prisma/migrations/` in sorted order. A new typing migration
  will therefore be exercised by that helper.
- Recent migrations use `TEXT` ids, `createdAt DEFAULT CURRENT_TIMESTAMP`, and
  `updatedAt TIMESTAMP(3) NOT NULL` with no database default (for example
  `20261025120000_add_saved_jobs/migration.sql`). Existing enum migrations use
  `CREATE TYPE ... AS ENUM (...)` (for example `20260907102240_add_post_group`).
- `scripts/publish-extraction-candidate.ts:33-37,136` is the existing interactive
  transaction precedent: `Serializable`, explicit timeout, create/guarded compare,
  no blind retry.
- `scripts/store-extraction-candidate.test.ts:58-130` is the existing isolated-DB
  test precedent: `TEST_DATABASE_URL`, random schema, discoverable migration,
  cleanup, concurrent calls.
- `prisma7.config.ts:2` imports `dotenv/config`; `pnpm exec prisma validate` may
  therefore read the application `.env` even though validation does not connect.
  Tests must still never load `.env` or fall back to `DATABASE_URL`.
- `generated/prisma` is not an owned implementation path and is not in the
  baseline's typed model set. Typing code will not typecheck or run against the
  new models until the coordinator/agent regenerates the client. Generated
  output must not be committed as if it were part of the reviewed diff.

Implication: keep parsing/canonicalization pure and dependency-inject the
database client. Do not import `src/db.ts` from pure tests or from a module whose
import should not require `DATABASE_URL`. Use the existing helper or an injected
client for database tests.

## Acceptance analysis against `storage-draft-v1`

### 1. Schema and migration

Verify all of the following in the schema and the single new migration
`20261112120000_add_typing_catalogue`:

- Exactly the three additive models `TypingExam`, `TypingExamVersion`,
  `TypingPassage`; no edits to existing models, auth, recruitment, `Post`,
  `Source`, `SavedJob`, or `ExtractionCandidate`.
- Required fields and nullability exactly match the contract table. In
  particular `organization`, `examYear`, `durationSeconds`, `backspacePolicy`,
  `editingPolicy`, `scoringMethod`, `targetWpm`, `maxErrorPercent`,
  `targetKeystrokes`, `instructions`, `ruleSourceUrl`, `ruleSourceNote`, `shift`,
  `sourceUrl`, and `sourceNote` remain nullable; `language`, `text`,
  `contentHash`, `sourceKind`, identity keys, and status remain non-null.
- `status` defaults to `DRAFT`; source kind is one of
  `OFFICIAL_PREVIOUS_YEAR`, `RECONSTRUCTED`, `PRACTICE`; backspace is one of
  `UNRESTRICTED`, `DISABLED`, `CURRENT_WORD_ONLY`; language accepts only `en` at
  the import boundary.
- `editingPolicy` and `scoringMethod` are nullable **strings**, not enums, and
  the import validator accepts only `null` for both. No placeholder enum value,
  empty union, `"UNKNOWN"`, default string, or arbitrary method is acceptable.
- Unique constraints: exam `slug`; version `(examId, versionKey)`; passage
  `(examVersionId, contentKey, revision)`. `contentHash` is not globally unique.
  Indexes: `(examId, status)` and `(examVersionId, status)`; do not add
  speculative indexes or an unapproved content-hash index.
- Parent foreign keys are restrictive: deleting an exam with versions, or a
  version with passages, must fail; no cascade delete on these parents.
- `text` uses PostgreSQL `TEXT`, not a narrow `varchar`.
- Migration SQL creates only new types/tables/indexes/constraints and does not
  alter or backfill existing tables. `migration_lock.toml` and old migrations
  are unchanged.
- Migration SQL and Prisma schema agree on defaults, nullability, constraint and
  index names, and referential actions. Existing migrations use `updatedAt`
  without a database default; raw test inserts must supply it if used.
- No seed rows, no test fixture auto-import, no data migration.

### 2. Import shape and validation

The contract fixes strict behavior, not a permissive parser:

- All schema keys are required, including nullable ones. An absent nullable key
  is invalid, not `null` by implication. Unknown keys are rejected at the top
  level and inside exam, version, and every passage.
- No caller-supplied `id`, `examId`, `examVersionId`, `contentHash`, counts,
  timestamps, `status`, `reviewedAt`, or `publishedAt`.
- Exactly one exam, one version, and 1–20 passages per file. Reject empty,
  oversized, non-object, and structurally unknown input before any write.
- `revision` is explicit and never auto-incremented by the importer. Duplicate
  `(contentKey, revision)` pairs within one file should be rejected during
  validation, not left to a mid-transaction unique failure.
- Validate the complete file before any mutation. Dry-run is the default and
  performs no inserts; only an explicit apply flag writes.
- Bounds: slug/versionKey `[a-z0-9-]{1,64}`, contentKey `[a-z0-9-]{1,128}`,
  names/labels/titles 1–200, organization 1–200 or null, shift 1–100 or null,
  instructions/notes 1–10000 or null; year 1900–2100; duration 1–3600;
  targetWpm 1–1000; maxErrorPercent finite 0–100; targetKeystrokes 1–100000.
  Reject numeric strings, booleans, floats where an integer is required, and
  non-finite values. Zero is valid only where the contract explicitly allows it
  (`maxErrorPercent`).
- Nullable non-null values must be non-empty. `""` is invalid wherever the only
  allowed alternatives are a bounded value or `null`.
- Non-text metadata must have no surrounding whitespace. Treat this as rejection,
  not silent trimming. Preserve internal spacing. Do not normalize metadata.
- Source URLs: parse as HTTP(S), at most 2048 characters, no embedded username
  or password, never fetched. Validate without storing a silently normalized
  `url.href` unless that normalization is approved; no-op comparison must use
  the same representation that would be stored.
- With the contract's null-only rule, `editingPolicy`/`scoringMethod` must reject
  every string including empty string. `backspacePolicy` may be null or one of
  its three enum values; `sourceKind` is non-null and closed.

### 3. Exact text, decoding, hash, counts

- Read at most 1 MiB measured in bytes before decoding. Use a fatal UTF-8
  decoder. `Buffer.toString('utf8')` is insufficient because it replaces invalid
  bytes with U+FFFD.
- Allow exactly one leading file BOM; do not store it. Do not confuse that with
  a U+FEFF that is genuinely inside a passage; preserve passage characters
  except the canonical line-ending conversion.
- Convert CRLF and lone CR to LF in passage text only. Preserve case,
  punctuation, spaces, tabs, blank lines, trailing spaces, quotes,
  backslashes, and markup such as `<script>`. Do not trim, collapse whitespace,
  or apply NFC/NFD.
- Reject unpaired surrogates, including lone surrogates introduced through JSON
  `\uD800`-style escapes, not just invalid UTF-8 bytes. Reject NUL, C0 controls
  except LF and TAB, and DEL. Do not silently strip them. The contract does not
  require rejecting C1 controls or normalizing other Unicode; preserve them
  unless a separate decision says otherwise.
- Reject whitespace-only canonical passage text. Define "whitespace" once and
  use the same definition for rejection and word counting; `String.trim()` and
  JavaScript `\s` differ from Unicode `White_Space` at U+FEFF and similar code
  points, so an inconsistent choice is a real defect.
- Character count is Unicode code points, including LF and TAB. Use
  `Array.from(text).length` or equivalent, not `text.length` (UTF-16 units).
  Enforce the 50,000-code-point limit after canonicalization. Combining marks
  count as separate code points; do not switch to grapheme clusters.
- `contentHash` is lowercase SHA-256 hex over the UTF-8 bytes of canonical
  stored text. Recompute it with the same shared helper used for read-back; do
  not accept a caller hash and do not hash raw bytes, BOM, or pre-canonical CRLF.
- Word count is nonempty runs split by Unicode whitespace; it is a content
  statistic, not an exam marking rule. Counts may appear in preview/read-back
  only, never as caller input or hand-editable stored metadata in this slice.

### 4. Conflict, concurrency, and repeat behavior

Exact expected outcomes:

- New natural key: create a DRAFT exam/version/passage as applicable.
- Existing natural key with every imported semantic field equal: no-op. A
  matching `contentHash` alone is insufficient; compare text, metadata,
  provenance, and rules field by field. Status and review/publication timestamps
  are not imported fields and must never be replaced or downgraded on retry.
- Existing natural key with any imported semantic difference: hard conflict,
  including when the existing row is a DRAFT. There is no update/upsert path.
- Same text under a different identity is legitimate; never treat content-hash
  equality as a duplicate or as proof of authenticity.
- Apply the whole file atomically in one serializable transaction. Any conflict
  at any passage rolls back every insert from that file, including a newly
  created exam or version. Do not partially import and do not commit then report
  a conflict.
- Unique constraints remain the final duplicate guard. Serializable isolation
  alone is not sufficient. Two concurrent identical imports must result in one
  committed set and, for the other, a safe conflict/retry result with nonzero
  exit, not a duplicate, overwrite, or false success.
- A serialization (`P2034`) or unique (`P2002`) failure must be mapped to a safe
  conflict message and nonzero exit. Do not blindly retry inside the importer.
  Do not print SQL, full text, connection strings, or credentials.
- Within the transaction, read back inserted text, hash, and all semantic fields
  and compare before allowing commit. The create return value is not a substitute
  for the required read-back.
- After a committed but unacknowledged write, rerunning the same explicit import
  must find the rows and report no-ops, not create duplicates or conflicts.
- Dry-run, apply, conflict, and success paths must disconnect cleanly, including
  error paths.
- Foreign-key behavior proves restrictive deletion; no cascade path may delete
  catalogue children.

### 5. Verification evidence required at handoff

- Pure validation/canonicalization tests with no `.env`, no `DATABASE_URL`, and
  no database connection.
- Isolated database test using only an explicit `TEST_DATABASE_URL`, never an
  implicit application database, with cleanup. Cover dry-run leaving the
  database unchanged; apply/read-back; repeat no-op; changed metadata with the
  same text conflicting; whole-batch rollback; concurrent imports; unique keys;
  restrictive foreign keys; and existing tables remaining intact.
- Static migration review against the schema and an additive-only check.
- Separate reporting of pure checks and real database checks. Mocks cannot
  replace the disposable-database persistence proof.
- Ultimately run the batch commands (`node --import tsx --test
scripts/typing-*.test.ts`, `pnpm exec prisma validate --config
prisma7.config.ts`, `pnpm typecheck`, `pnpm lint`, relevant regressions) and
  report exactly what ran. None were run for this preparation.

## Ambiguities to report, not silently decide

These are gaps in the frozen text or handoff, not new approval gates. The
implementer should not silently choose a semantic answer and the reviewer should
not accept one without the coordinator's record:

1. The contract describes one exam, one version, and 1–20 passages but does not
   freeze the exact import JSON key names/nesting or a fixture. The handoff must
   identify the exact shape; `exam`/`version`/`passages` and camelCase field
   names are the natural reading, not yet a reviewed fixture.
2. The lower bound and integer range for `revision` are not stated beyond
   "explicit, never auto-incremented." A positive-integer requirement needs the
   coordinator's confirmation.
3. Whether an existing non-DRAFT row at an imported natural key is a no-op or a
   conflict is not exercised by this draft-only slice. The contract clearly
   forbids downgrading status or replacing review timestamps; the writer must
   not update, and the classification should be reported if it arises.
4. Control-character rules are stated in the passage-text paragraph. Whether
   metadata such as `instructions`/notes may contain LF/TAB and whether
   unpaired surrogates are rejected in all strings should be confirmed rather
   than guessed.
5. Length units for metadata strings are not specified; passage text is
   explicitly code points. Pick one consistently and document it rather than
   mixing UTF-16 length and code points.
6. Duplicate JSON object keys are accepted last-wins by `JSON.parse`; the
   contract does not state whether they must be rejected. A strict rejection is
   safer, but it is an implementation decision to record, not a frozen rule.

## Preliminary implementation review (current copied diff)

**Preliminary only.** I inspected the current review-tree copy, not the writer's
worktree, and did not edit application code, tests, schema, contracts, generated
files, or migrations. The writer may still revise. The findings below must be
rechecked against the next exact handoff before any final acceptance.

### Confirmed blocking findings

1. **Backspace policy is the wrong type and is null-only.**
   `prisma/schema.prisma:262` stores `backspacePolicy String?`, the migration
   stores `"backspacePolicy" TEXT` at
   `prisma/migrations/20261112120000_add_typing_catalogue/migration.sql:25`,
   and `src/lib/typing-import.ts:37,243-247,329` accepts only `null`. The frozen
   contract defines the enum values `UNRESTRICTED`, `DISABLED` and
   `CURRENT_WORD_ONLY`; only `editingPolicy` and `scoringMethod` are null-only.
   The protected acceptance test fails on all three allowed values. The writer's
   own `scripts/typing-import.test.ts:176-186` asserts the wrong behavior and
   must not be treated as passing evidence.
2. **A double leading BOM is accepted.**
   `src/lib/typing-content.ts:14-19` removes one BOM manually, then
   `new TextDecoder('utf-8', { fatal: true })` strips a second leading BOM by
   default. The protected acceptance test therefore fails at
   `scripts/typing-storage-acceptance.test.ts:48-49`. Using
   `{ ignoreBOM: true }` after the explicit check, or explicitly rejecting any
   remaining leading BOM, is required.
3. **The CLI validates a raw file and then revalidates its parsed output.**
   `scripts/import-typing-content.ts:61-64` calls `parseTypingImport(input)`
   and then passes that derived result to `importTypingContent`, which parses
   again at `src/lib/typing-import.ts:730`. Parsed passages contain
   `contentHash`, `characterCount` and `wordCount`
   (`src/lib/typing-import.ts:58-60,368-370`), which are not accepted input keys.
   Confirmed by direct reparse and by CLI execution: a valid file fails with
   `Unknown field "contentHash" in passage 1` before any database use. Pass the
   raw `input` to the importer, or split raw-input and validated-output types.
4. **Metadata bypasses control and surrogate rejection.**
   `src/lib/typing-import.ts:185-197` only checks length and surrounding
   whitespace. Confirmed accepted: NUL in `exam.name`, a lone surrogate in
   `exam.name`, NUL in `title`, NUL in `instructions`, and DEL in `sourceNote`.
   PostgreSQL cannot store NUL in `text`, and lone surrogates do not survive
   UTF-8 encoding, so this is both a validation and persistence-integrity defect.
   Reject NUL, C0 controls except the allowed LF/TAB, DEL, and unpaired
   surrogates in metadata as well as passage text. The contract sentence sits in
   the passage-text paragraph, so the coordinator should confirm the exact
   metadata LF/TAB scope; the current unvalidated acceptance is still wrong
   under the assignment's stated acceptance reading.
5. **Read-back is unbounded over the whole version.**
   `src/lib/typing-import.ts:681-683` uses `findMany({ where: { examVersionId } })`
   with no `select` and then searches the full result in memory. A version can
   accumulate many revisions; this loads every text and grows without bound even
   though the file has at most 20 passages. Query only the imported
   `(contentKey, revision)` identities with a bounded projection.
6. **The CLI does not typecheck: `$disconnect` is absent from the DB type.**
   `scripts/import-typing-content.ts:71` calls `database.$disconnect()`, but
   `TypingImportDatabase` (`src/lib/typing-import.ts:105-146`) does not declare
   it. `pnpm typecheck` reports TS2339 at line 71.
7. **An implementation test does not typecheck.**
   `scripts/typing-import.test.ts:114` deletes `passages`, which is required by
   the `Fixture` interface; `pnpm typecheck` reports TS2790. This is separate
   from the pre-existing baseline error in `frontend/profile-api.ts:6`.

### Confirmed test defects, not implementation defects

- **Astral boundary test is arithmetically wrong.**
  `scripts/typing-content.test.ts:88-92` uses `MAX_PASSAGE_TEXT_CODE_POINTS / 2`
  emoji. Each emoji is one code point, so 25,000 emoji are 25,000 code points,
  not 50,000; adding one more is still under the limit. The implementation's
  `countCodePoints` (`[...text].length`) is correct. The test should use 50,000
  emoji for the boundary and 50,001 to reject.
- **Source-URL boundary test is arithmetically wrong.**
  `scripts/typing-import.test.ts:346-351` prepends `https://example.test/`
  (21 characters) to 2,037 and 2,038 `a` characters, so both cases exceed 2,048.
  The "at limit" case is not at the limit; the implementation rejects both.
- **`typing-content.test.ts` temp-directory cleanup is racy.**
  The module-level `after` at lines 17-20 can remove the shared workspace while
  later async file tests still run. Observed failures: `ENOTEMPTY` on isolated
  run and `ENOENT` for `bom.json`, `invalid-utf8.json`, `content.json`, and
  `plain.txt` in the combined run. This is test flakiness, not a content-parser
  failure; use per-test directories or awaited per-test cleanup.
- **The DB test named "batch conflict rolls back all inserts" does not exercise
  rollback after an insert.** `scripts/typing-import-database.test.ts:269-289`
  changes an existing passage and adds a new one; all conflicts are detected
  before the first insert (`src/lib/typing-import.ts:584-600`), so no inserted
  row exists to roll back. A mid-transaction unique/serialization failure is
  needed to prove rollback. The same DB test's additive check at lines 99-132
  checks only table names and a few regexes; it does not verify all existing
  table contents or the missing backspace enum.

### Quality findings consistent with the coordinator's note

- `src/lib/typing-import.ts:105-146` is a large handwritten duplicate of the
  generated Prisma transaction/model types. It already drifted (missing
  `$disconnect`) and will drift again. Prefer the generated Prisma types or a
  narrow `Pick`/transaction type, and declare the disconnect used by the CLI.
- `noOpIfEqual` at `src/lib/typing-import.ts:435-437` is a one-line wrapper
  around `semanticEqual`; it adds no behavior and obscures the outcome mapping.
- `planImport` and `applyImport` duplicate the same exam/version/passage
  comparison and result-shaping logic (`src/lib/typing-import.ts:474-533` and
  `535-715`). This duplication already contributes to the raw/parsed type
  confusion behind the CLI revalidation bug.
- `readTypingContentFile` reads the entire file before checking the 1 MiB limit
  (`src/lib/typing-content.ts:10-12`). A large untrusted file is fully allocated
  before rejection; enforce the limit while reading or with `stat` first. This is
  a robustness issue, not the primary contract failure.

### Additional tests observed during the review

Two further untracked tests appeared after the initial inspection:
`scripts/typing-cli.test.ts` and
`scripts/typing-storage-database-acceptance.test.ts`. I did not run either because
they require `TEST_DATABASE_URL`; I also did not edit them.

- `scripts/typing-cli.test.ts:51` submits `backspacePolicy: 'DISABLED'` and
  expects preview/apply success. The current implementation rejects it, and the
  CLI revalidation bug above also makes the first preview fail. This test is a
  direct independent confirmation of both blocking findings.
- `scripts/typing-storage-database-acceptance.test.ts:21-34` adds a trigger that
  mutates the inserted title to prove read-back failure rolls back actual
  inserts. That is the rollback case the older DB test did not exercise. It is
  still unrun and must be part of the isolated-database handoff.
- The test file list is still moving while the writer revises. The final review
  must use one exact handoff snapshot, not this mixed working tree.

### Evidence actually run

All commands below used the review tree only; no `.env` was loaded, no database
was contacted, and no external service was used.

```text
/Users/mrblackghost/.nvm/versions/node/v24.10.0/bin/node --import tsx --test scripts/typing-content.test.ts
  tests 18, pass 15, fail 3 (astral test, double BOM, cleanup ENOTEMPTY)

/Users/mrblackghost/.nvm/versions/node/v24.10.0/bin/node --import tsx --test scripts/typing-import.test.ts
  tests 20, pass 19, fail 1 (source-URL boundary assertion is wrong)

/Users/mrblackghost/.nvm/versions/node/v24.10.0/bin/node --import tsx --test scripts/typing-storage-acceptance.test.ts
  tests 4, pass 2, fail 2 (backspace enum rejected; double BOM accepted)

/Users/mrblackghost/.nvm/versions/node/v24.10.0/bin/node --import tsx --test scripts/typing-content.test.ts scripts/typing-import.test.ts scripts/typing-storage-acceptance.test.ts
  tests 41, pass 33, fail 8

pnpm typecheck
  TS2835 frontend/profile-api.ts:6 (unchanged pre-existing baseline error)
  TS2339 scripts/import-typing-content.ts:71 ($disconnect)
  TS2790 scripts/typing-import.test.ts:114 (delete required passages)
  exit 2
```

Additional direct checks:

```text
parseTypingImport(parseTypingImport(validInput()))
  -> rejected: Unknown field "contentHash" in passage 1

CLI with a valid temp file
  -> {"status":"error","reason":"Unknown field \"contentHash\" in passage 1"}

Metadata probe
  -> exam.name NUL: accepted
  -> exam.name lone surrogate: accepted
  -> title NUL: accepted
  -> instructions NUL: accepted
  -> sourceNote DEL: accepted
```

No isolated-database test was run because `TEST_DATABASE_URL` was not supplied;
the database suite remains unverified and must not be reported as passing. The
protected acceptance test was not edited. The current implementation is
**not accepted**; these are preliminary findings for the writer/coordinator to
address and for a subsequent exact-diff review.

## Verification status

This report now contains static preparation plus a preliminary review of the
copied implementation. It is not final implementation acceptance. Final
acceptance remains pending a revised exact diff, corrected pure tests, a real
isolated `TEST_DATABASE_URL` persistence run, and re-review of the migration and
conflict/concurrency evidence.
