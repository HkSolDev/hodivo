# Typing draft storage: implementation batch

Batch `typing-storage-implementation-20261112`; contract `storage-draft-v1`.
Hemant approved proceeding (“work on”) after the concrete proposal. Frozen
semantics: [storage contract](TYPING_STORAGE_CONTRACT_PROPOSAL.md).

Baseline: isolated snapshot commit `a600ef65ed1cd194a7ad18b55a9fb3ac1b8d909f`,
from original branch `codex/typing-practice-plan` HEAD `d930a69e` plus explicitly
snapshotted current local source. No fetch, production or release claim.
Original source hashes: `/private/tmp/typing-storage-implementation-baseline.json`.

| Role               | Model                                        | Worktree / branch                                                                  | Owned paths                                                                                                                                                                                                                                                                                                                                             |
| ------------------ | -------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Implementation     | OpenCode `opencode/glm-5.3-flash-free`       | `/private/tmp/aptus-typing-storage-impl`, `codex/typing-storage-impl-20261112`     | schema additive section only; new migration `20261112120000_add_typing_catalogue`; `src/lib/typing-content.ts`, `src/lib/typing-import.ts`; `scripts/import-typing-content.ts`; `scripts/typing-content.test.ts`, `scripts/typing-import.test.ts`, `scripts/typing-import-database.test.ts`; `docs/agent-progress/typing-storage-glm-implementation.md` |
| Independent review | OpenCode `opencode/deepseek-v4.1-flash-free` | `/private/tmp/aptus-typing-storage-review`, `codex/typing-storage-review-20261112` | `docs/agent-progress/typing-storage-deepseek-implementation-review.md` only                                                                                                                                                                                                                                                                             |
| Coordinator        | Main conversation                            | Original checkout + review worktree                                                | Frozen contract, batch, independent acceptance tests and integration                                                                                                                                                                                                                                                                                    |

No API registration/publication/frontend/worker/auth/CI/dependency/old-migration
or protected existing-contract edits. Agents cannot change accepted semantics.
Report mismatches before dependent edits. No shared writable dependencies.
Only coordinator starts a disposable local PostgreSQL cluster; agents do not
read application .env or run DB commands until an explicit test-only URL is supplied.
No production/shared database, remote provider or deployment operations.

Acceptance is the contract's validation, canonicalization/hash/counting,
read-back, dry-run, no-op, conflict/rollback, concurrency and FK behavior.
Writer supplies focused tests and rationale; reviewer independently inspects
the exact handoff; coordinator verifies pure tests and real isolated persistence.
Commands: explicit Node24 `node --import tsx --test scripts/typing-*.test.ts`,
`pnpm exec prisma validate --config prisma7.config.ts`, `pnpm typecheck`,
`pnpm lint`, relevant existing regression suites. Tests must not load .env;
DB tests use TEST_DATABASE_URL, never implicit DATABASE_URL.

Integration will copy only accepted owned paths after exact-commit review.
Original unrelated staged/unstaged work is preserved. No push, merge, live
migration, official-content publication or deployment is authorized.

## Coordinator implementation clarifications

The natural JSON envelope is `{ exam: {...}, version: {...}, passages: [...] }`;
field names match the frozen table, with id/parent ids/status/timestamps omitted
from input and inferred only by the importer. revision is a positive PostgreSQL
Int (1–2147483647). Identical existing records no-op irrespective of status;
compare semantic fields but never mutate status/review timestamps. Metadata
bounds use code points; well-formed Unicode is required for all strings; plain
single-line metadata rejects controls, while instructions/notes may retain LF/TAB.
These clarify representation, not new official exam rules. Duplicate JSON keys
retain standard JSON.parse last-value behavior; no custom JSON parser is in scope.
Backspace policy accepts the three approved enum values or explicit null; only
editingPolicy/scoringMethod are null-only. Do not narrow that accepted policy.

## Actual handoff: verified candidate, not integrated

Candidate commit `15b47e8267c2c3150b904be4373ca984f751aceb` in the review
worktree contains 12 source/migration/test paths. Coordinator corrected the
initial GLM draft following independently confirmed DeepSeek findings. One
additional focused input-validator module was authorized to separate validation
from persistence. Frozen candidate suite:53 passed/0 skipped; full backend and
contract suite:140 passed/18 skipped/0 failed; practice regressions:23 passed;
lint and Prisma validation passed. Root typecheck retains only the existing
frontend/profile-api.ts:6 import-extension error.

Final exact-commit DeepSeek review did not complete because free-provider calls
repeatedly failed. Cached v4.1 model name was rejected in a clean OpenCode profile;
verified available v4 Flash free also failed provider requests. Earlier draft
review is not final acceptance. Candidate stays isolated; no original application
files or index were changed, no shared/live migration or deployment occurred.
Only documentation is integrated. Full rationale, test evidence and resume gate:
[TYPING_STORAGE_IMPLEMENTATION_REVIEW.md](TYPING_STORAGE_IMPLEMENTATION_REVIEW.md).

## Final local integration

Terra reviewed candidate15b47 and fix `5d46aaf1cd6d82778769914dd03d95dce60ccdb5`.
Its C1 metadata finding is resolved; no remaining code-review blockers.
The coordinator integrated only the 12 owned paths with original staged index
preserved. See `TYPING_STORAGE_IMPLEMENTATION_REVIEW.md` for checks and limits.
Earlier provider-blocked handoff is historical; API/exam work remains next.
