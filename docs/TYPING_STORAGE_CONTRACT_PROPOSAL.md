# Typing catalogue: first storage contract proposal

Date: 12 November 2026. Batch: `typing-storage-design-20261112`.
Status: **approved by Hemant (“work on”), 12 November 2026; frozen revision storage-draft-v1**.

## Coordinator conclusion

Keep the three-model design. Implement draft storage and import first, then the
published read API, then exam UI. This is a subdivision of plan slice 2, not a
replacement of the full-stack plan. It avoids inventing official exam rules to
finish a migration. No attempt history, public write endpoint or publication
command is included in this first sub-slice.

Both requested OpenCode free agents completed independent design assignments:
[GLM proposal](agent-progress/typing-storage-glm-proposal.md) and
[DeepSeek audit](agent-progress/typing-storage-deepseek-audit.md). These are raw
agent recommendations, not accepted contracts. This document resolves their
contradictions and is the proposed implementation authority after approval.

## Proposed first sub-slice: draft catalogue storage

Add `TypingExam`, `TypingExamVersion` and `TypingPassage` with restrictive parent
foreign keys. Existing recruitment, applicant, auth and saved-job models remain
unchanged. Add an SQL migration for review; do not apply it to a shared or live DB.
No seed records. Test fixtures are illustrative and never auto-imported.

| Entity  | Required non-null fields                                                                                    | Explicitly nullable fields                                                                                                                                                                   |
| ------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exam    | id, slug, name, createdAt, updatedAt                                                                        | organization                                                                                                                                                                                 |
| Version | id, examId, versionKey, label, language, status, createdAt, updatedAt                                       | examYear, durationSeconds, backspacePolicy, editingPolicy, scoringMethod, targetWpm, maxErrorPercent, targetKeystrokes, instructions, ruleSourceUrl, ruleSourceNote, reviewedAt, publishedAt |
| Passage | id, examVersionId, contentKey, revision, title, text, contentHash, sourceKind, status, createdAt, updatedAt | examYear, shift, sourceUrl, sourceNote, reviewedAt, publishedAt                                                                                                                              |

IDs use the existing cuid convention; timestamps are database/application-owned,
not supplied by import. Status enum: DRAFT, PUBLISHED, RETIRED, default DRAFT.
Source-kind enum: OFFICIAL_PREVIOUS_YEAR, RECONSTRUCTED, PRACTICE. A source-kind
label records the submitter's claim; it does not establish authenticity or review.
English is the only initially accepted language, serialized as `en`.

Identity constraints: unique exam slug; unique (examId, versionKey); unique
(examVersionId, contentKey, revision). Revision is explicit, never auto-incremented
by the importer. Same text may legitimately appear under different identities;
contentHash is not globally unique. Index version (examId, status), passage
(examVersionId, status). Additional query indexes are reviewed with the API.

Backspace enum values: UNRESTRICTED, DISABLED, CURRENT_WORD_ONLY. A stored value
is configuration, not proof the engine supports it. Editing/scoring columns may
be nullable strings in storage, but the first import validator accepts **only
null** for both. No arbitrary policy strings, empty unions or placeholder enum
values. Adding supported method names and publication requires a separately
reviewed contract and behavioral examples from the first actual exam.

All import schema keys are required, including nullable ones; unknown keys are
rejected. An absent nullable key is invalid rather than implicitly defaulted.
Nested input is one exam, one version and one or more passages per file. This
keeps the transaction and operator review small. No caller-supplied id, hash,
counts, timestamps or status. All created versions/passages are DRAFT.

Proposed bounds: slug/versionKey lowercase ASCII letters, digits and hyphens,
1–64 characters; contentKey same alphabet, 1–128; names/labels/titles 1–200;
organization 1–200 or null; shift 1–100 or null; instructions/notes 1–10000 or
null. Non-text metadata must have no surrounding whitespace. Year is 1900–2100
or null; duration 1–3600 integer or null; targetWpm 1–1000 integer or null;
maxErrorPercent finite 0–100 or null; targetKeystrokes 1–100000 integer or null.
These are implementation limits, never official exam claims. Source URLs are
HTTP(S), at most 2048 characters, no embedded credentials, or null; never fetched.

## Exact text and derived metadata

Read an at-most 1 MiB UTF-8 JSON file with fatal decoding. Allow one leading file
BOM. Convert passage CRLF and lone CR to LF; preserve all other text exactly:
case, punctuation, spaces, tabs, blank lines and trailing spaces. Do not trim,
collapse whitespace or normalize Unicode. Reject unpaired surrogates, NUL and
C0 controls except LF/TAB, and DEL. Reject whitespace-only text. Limit each
canonical passage to 50000 Unicode code points; at most 20 passages per file.

Hash the canonical stored text's UTF-8 bytes with SHA-256, lowercase hex. Character
count includes every code point, including LF and TAB; word count is the number
of nonempty runs split by Unicode whitespace. These are content statistics,
not official marking rules or proof of English input support. Unicode draft
content may be stored faithfully; publication must enforce the chosen engine's
supported character set separately. Do not conflate practice's ASCII input
restriction with storage integrity.

First sub-slice computes counts in preview/read-back only. Do not expose counts
in an API metadata query by fetching every passage's text. At the API sub-slice,
review either write-derived count columns or SQL computation; hand-editable
counts are prohibited. This resolves the plan's list-projection/count tension.

## Draft import and repeat behavior

Dry-run is the default and performs no writes; an explicit apply flag enables
inserts. Validate the entire input before any DB mutation. Preview identities,
canonicalization, derived counts, resolved rules and planned creates/no-ops;
text is reviewed locally, never logged by public request handlers.

Compare all imported semantic fields, including text, metadata, provenance and
rules. A hash match alone is insufficient. Existing identical records are no-ops;
any difference at an existing natural key is a hard conflict, including drafts.
There is no update/upsert path in this first sub-slice. Correct a draft through
an explicit new key/revision; editing workflows can be designed later if needed.
Never downgrade status or replace review timestamps on retry.

Apply the whole file atomically using a serializable transaction. Unique keys
remain the final duplicate guard. On a serialization/unique conflict, return a
safe conflict/retry message with nonzero exit; do not claim success or blindly
retry. Re-running the same explicit import after a committed but unacknowledged
write must produce no-ops. Within the transaction read back and compare inserted
text/hash/all semantic fields before allowing commit. Disconnect cleanly on exit.
Use existing DB configuration without printing it; tests require an explicit
disposable TEST_DATABASE_URL and never fall back to the application DB.

## Acceptance and affected paths

GLM's eventual writer scope: schema additions, one new migration,
`src/lib/typing-content.ts`, `src/lib/typing-import.ts`,
`scripts/import-typing-content.ts`, focused typing import/content/database tests,
and its rationale report. No src/app.ts registration or frontend change yet.
DeepSeek independently reviews the exact diff and checks outcomes; coordinator
owns the contract and acceptance criteria. Implementation requires isolated
Git worktrees and an exact frozen source baseline after approval.

Required evidence: invalid/missing/extra fields rejected; explicit null and zero
boundaries; invalid UTF-8/surrogates/control/oversized text; preserved whitespace
and markup; canonical hash/counts; dry-run leaves DB unchanged; apply/read-back;
repeat no-op; changed metadata with same text conflicts; batch conflict rolls
back all inserts; concurrent imports cannot overwrite/duplicate; restrictive FK;
additive migration leaves existing tables intact. Report pure/DB checks separately.
No mocked database test substitutes for actual disposable-DB persistence proof.

## Read API and publication remain subsequent work

Keep the plan's three public GET endpoints, bounded pages and metadata-only
lists. Their exact response fields, ordering, empty-version behavior, count
storage and supported public rules must be frozen separately before implementation.
A published passage and its version must both be PUBLISHED. Missing/draft/retired
detail returns uniform 404; routes return generic 503 explicitly on DB failure,
not through the existing global handler that maps thrown server errors to 500.
Use no-store and the existing method/id conventions. No publication path ships
until an implemented policy/scorer and source-backed first exam are reviewed.

## Manager review of agent findings

Accepted: explicit nullability, scoped natural keys, immutable revisions, public
parent/child filtering, strict bounded queries, separate projections and generic
explicit failure responses. Draft-only first avoids premature exam semantics.

Rejected/corrected from GLM: hash-only passage equality; mutable draft imports;
claim that RepeatableRead alone makes concurrent insertions safe; optional NFC
import mode; character counts excluding LF; arbitrary draft method strings;
deriving metadata counts by loading full text for list queries. GLM's prose and
its acceptance checklist disagree on draft conflicts; this proposal uses hard
conflicts consistently. Its status-transition paragraph incorrectly refers to
all models although Exam has no status; only version/passage have statuses.

DeepSeek's report is an advisory audit, not a veto or implementation approval.
Its proposed first slice mistakenly says two GET endpoints; the plan has three.
A findUnique result followed immediately by checks on that same fetched snapshot
does not inherently create an extra read race; filtered queries are still the
clearer projection boundary. A list of ten approval questions is unnecessary:
this one draft-storage contract is the concrete approval unit. Reviewer notes
about missing snapshot files describe its inspection time; coordinator later
supplied jobs/detail handlers and independently verified actual source paths.

## Approval recorded

Hemant approved proceeding with this draft-only storage/import sub-slice. This approves the
proposed field meanings, text handling and conflict behavior for implementation;
it does not approve official exam rules, publication, live migration or deployment.
The protocol requires explicit approval before freezing new shared semantics:
[AGENT_CONTRACT_PROTOCOL.md, decision authority](AGENT_CONTRACT_PROTOCOL.md#1-decision-authority).
