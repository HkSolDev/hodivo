# Typing storage and read API — design proposal (GLM)

Batch: `typing-storage-design-20261112`, revision `draft-1`. Role: GLM design/implementation lead.
Date: 12 November 2026.

**Acknowledgement.** This is a documentation-only design task. Baseline is a read-only
source snapshot of `codex/typing-practice-plan` HEAD `d930a69e0093a440ef5ad99c92a6ab19326cec17`
plus current uncommitted files — not a clean release commit. No schema, migration,
contract-lock, code, install, network, secret, DB, commit or deployment action was taken.
All source samples in this snapshot are unverified. Nothing here claims a runtime test.

**Snapshot note.** The snapshot contains only `src/app.ts`, `src/routes/public.ts`,
`src/lib/public-jobs.ts` and `prisma/schema.prisma`. `src/app.ts` imports modules that are
not present in this snapshot (`routes/health|match|explain|ingest|profile|saved-jobs`,
`auth/*`, `lib/logging|static|render-job`, `routes/jobs|job-detail`), so its full request
pipeline could not be inspected here. Baseline claims are limited accordingly.

## 1. Frozen vs proposed (summary)

Frozen by the reviewed plan (`TYPING_APPLICATION_PLAN.md` §4, §5, §6, §9) — these decisions
are restated, not reopened:

- Three catalogue models (`TypingExam`, `TypingExamVersion`, `TypingPassage`), kept separate
  from recruitment `Post`/`User` tables; no attempts table.
- Draft-only content entry first; a version with unresolved required rules stays `DRAFT`.
- Published text and rules are immutable; a correction creates a new version/revision and
  retires the old record. The only permitted mutation of a published row is → `RETIRED`.
- A public passage requires both its own status and its rule version's status `PUBLISHED`,
  applied identically in list and direct-detail queries.
- One Fastify read API behind the existing Next rewrite; no parallel Next DB handlers.
- List responses use `{ data, pagination }`; lists never include full passage text.
- Status-code policy: 400 for malformed/duplicate/unsupported query input; 404 for missing,
  draft or retired detail; 503 for temporary database failure; generic error bodies.
- No Redis, no caching layer; fresh `no-store` catalogue/detail reads.
- Policy values are decided with the first real exam; null unknowns are never coerced to
  zero/default; qualification is not inferred when thresholds are missing.

Proposed by this document (require coordinator/Hemant approval before any implementation):

- Exact field names, types, nullability and unique keys (§3).
- Canonicalization, hashing and the single counting convention (§4).
- Import idempotency/conflict behavior and transaction shape (§5).
- Public projection shapes and endpoint query validation (§6).
- Implementation limits (§7) and the first implementable slice (§9).

## 2. Affected files (proposed; none edited in this batch)

| Path                               | Change                                             | Note                                                                                                    |
| ---------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `prisma/schema.prisma`             | Additive: 3 models + enums below                   | Shared file; needs approval and a reviewed additive migration                                           |
| `prisma/migrations/*`              | New additive migration                             | Never applied without authorization                                                                     |
| `src/lib/typing-content.ts`        | New: canonicalization, hash, counting helper       | Shared pure functions; location to be reviewed against both TS projects and Docker COPY rules (plan §3) |
| `src/lib/typing-catalogue.ts`      | New: explicit Prisma reads and public projections  | Named in plan §3                                                                                        |
| `src/routes/typing.ts`             | New: the three GET endpoints                       | Named in plan §3                                                                                        |
| `src/app.ts`                       | One-line registration                              | Only touch is registration; `app.ts` is shared                                                          |
| `scripts/import-typing-content.ts` | New: validated, dry-run-default, draft-only import | Uses existing DB config; never prints credentials                                                       |
| `docs/contracts/*` + lock          | New contract record for this boundary              | Coordinator-owned; requires protocol §7 change process                                                  |

## 3. Model contract (proposed exact shape)

Prisma-style; all timestamps `DateTime`; IDs `String @id @default(cuid())` to match the
existing schema. Statuses and source kinds are Prisma enums (value sets frozen now —
they are workflow states and honest provenance labels, not exam semantics).

```prisma
enum TypingContentStatus { DRAFT PUBLISHED RETIRED }
enum TypingSourceKind { OFFICIAL_PREVIOUS_YEAR RECONSTRUCTED PRACTICE }
```

### TypingExam — stable identity

| Field                    | Type     | Null | Notes                                                              |
| ------------------------ | -------- | ---- | ------------------------------------------------------------------ |
| `id`                     | String   | no   | Internal stable ID; safe to expose (matches jobs API practice)     |
| `slug`                   | String   | no   | `@unique`. Catalogue key for import idempotency; `[a-z0-9-]{1,64}` |
| `name`                   | String   | no   | Display name                                                       |
| `organization`           | String?  | yes  | Null while unknown; never defaulted                                |
| `createdAt`, `updatedAt` | DateTime | no   | Maintenance timestamps                                             |

### TypingExamVersion — one explicit set of rules

| Field                    | Type                     | Null | Notes                                                                                                                                                                                                                              |
| ------------------------ | ------------------------ | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                     | String                   | no   |                                                                                                                                                                                                                                    |
| `examId`                 | String                   | no   | FK → TypingExam, `onDelete: Restrict`                                                                                                                                                                                              |
| `versionKey`             | String                   | no   | `[a-z0-9-]{1,64}`; `@@unique([examId, versionKey])`                                                                                                                                                                                |
| `label`                  | String                   | no   | Human-readable edition name                                                                                                                                                                                                        |
| `examYear`               | Int?                     | yes  | Null when unspecified                                                                                                                                                                                                              |
| `language`               | String                   | no   | Only `"en"` supported in slice 1 (plan: English first)                                                                                                                                                                             |
| `durationSeconds`        | Int?                     | yes  | Positive int required at publication                                                                                                                                                                                               |
| `backspacePolicy`        | `TypingBackspacePolicy?` | yes  | Enum `UNRESTRICTED \| DISABLED \| CURRENT_WORD_ONLY`; value set freezable now, but `CURRENT_WORD_ONLY` semantics must be confirmed against implemented session behavior before any published version uses it (§8)                  |
| `editingPolicy`          | String?                  | yes  | **Value set NOT freezable.** Stored as provisional string in drafts; publication validation accepts only members of a code-owned frozen union that is empty until the first exam rules are recorded. Nothing publishes until then. |
| `scoringMethod`          | String?                  | yes  | **Value set NOT freezable.** Same mechanism as `editingPolicy`.                                                                                                                                                                    |
| `targetWpm`              | Int?                     | yes  | Stored only if the selected scoring method requires it                                                                                                                                                                             |
| `maxErrorPercent`        | Float?                   | yes  | Same condition                                                                                                                                                                                                                     |
| `targetKeystrokes`       | Int?                     | yes  | Same condition                                                                                                                                                                                                                     |
| `instructions`           | String?                  | yes  | Plain text; non-empty required at publication                                                                                                                                                                                      |
| `ruleSourceUrl`          | String?                  | yes  | Evidence URL                                                                                                                                                                                                                       |
| `ruleSourceNote`         | String?                  | yes  | Page/section reference                                                                                                                                                                                                             |
| `status`                 | TypingContentStatus      | no   | Default `DRAFT`                                                                                                                                                                                                                    |
| `reviewedAt`             | DateTime?                | yes  | Set only by the deliberate publish operation                                                                                                                                                                                       |
| `publishedAt`            | DateTime?                | yes  | Set at publication                                                                                                                                                                                                                 |
| `createdAt`, `updatedAt` | DateTime                 | no   |                                                                                                                                                                                                                                    |

Indexes: `@@index([examId, status])`, `@@index([status])`. Restrictive FK; no index on
unqueried fields.

### TypingPassage — one selectable revision

| Field                       | Type                | Null | Notes                                                                  |
| --------------------------- | ------------------- | ---- | ---------------------------------------------------------------------- |
| `id`                        | String              | no   |                                                                        |
| `examVersionId`             | String              | no   | FK → TypingExamVersion, `onDelete: Restrict`                           |
| `contentKey`                | String              | no   | `[a-z0-9-]{1,128}`                                                     |
| `revision`                  | Int                 | no   | `>= 1`; `@@unique([examVersionId, contentKey, revision])`              |
| `title`                     | String              | no   |                                                                        |
| `examYear`, `shift`         | Int? / String?      | yes  | Null when unspecified                                                  |
| `text`                      | String              | no   | Canonicalized stored text (§4); PG `text` column; ≤ 50,000 code points |
| `contentHash`               | String              | no   | SHA-256 hex (64 chars) of stored text (§4)                             |
| `sourceKind`                | TypingSourceKind    | no   |                                                                        |
| `sourceUrl`, `sourceNote`   | String?             | yes  | Provenance                                                             |
| `status`                    | TypingContentStatus | no   | Default `DRAFT`                                                        |
| `reviewedAt`, `publishedAt` | DateTime?           | yes  | As on version                                                          |
| `createdAt`, `updatedAt`    | DateTime            | no   |                                                                        |

Indexes: `@@index([examVersionId, status])`, `@@index([status])`.

Status transitions (all models): `DRAFT → PUBLISHED` (deliberate, reviewed publish op),
`PUBLISHED → RETIRED`, `DRAFT → RETIRED` (discard). No transition out of `RETIRED`.
Publication precondition for a version: non-null `durationSeconds`, `backspacePolicy`,
`editingPolicy`, `scoringMethod`, non-empty `instructions`, and all stored thresholds
supported by the chosen `scoringMethod`; its exam must exist. A passage publishes only
inside a published version.

## 4. Text canonicalization, hashing, counting (proposed convention)

Applied in one place (`src/lib/typing-content.ts`), used identically by import and API:

1. Input is strict UTF-8; invalid byte sequences reject the import.
2. Line endings: CRLF and lone CR → LF. Nothing else is rewritten.
3. No whitespace collapsing, no trimming, no punctuation changes, no NFC by default.
   NFC is an explicit per-passage import option, recorded in the import report, used only
   when reviewed — it can alter the text being assessed.
4. Reject if empty, or > 50,000 code points, or containing NUL/control characters other
   than LF (after step 2). A real exam passage needing an exception is a reviewed decision,
   not a silent pass.
5. `contentHash` = SHA-256, lowercase hex, over the UTF-8 bytes of the stored text.
6. Counts, derived from stored text by the same helper (not materialized in slice 1 —
   derived in API metadata; materialization later is additive and on-write only):
   - `charCount` — Unicode code points, excluding LF characters (structural, not typeable).
   - `wordCount` — maximal runs of non-whitespace characters; whitespace = U+0020 and LF.

Hash equality detects repeated content; it never establishes authenticity (plan §4).
Import never accepts client-supplied counts or hashes.

## 5. Import: idempotency, transactions, conflicts (proposed)

Draft-only in this slice: the script structurally refuses to write `PUBLISHED`
(publish is a separate later operation after review of the first real exam config).

- Addressing is by natural keys — exam `slug`, version `(examId, versionKey)`, passage
  `(examVersionId, contentKey, revision)` — never by internal IDs in the input file.
- Whole input file is validated before any write; one invalid entry aborts everything.
- Apply runs in one `prisma.$transaction` with `RepeatableRead` (matching the existing
  `listPublicJobs` snapshot pattern in `src/lib/public-jobs.ts:78-99`), so count and reads
  share one snapshot.
- Repeat behavior, per record:
  - Natural key absent → insert (`DRAFT`).
  - Present and byte-identical where it must be (passage: `contentHash` equal; exam:
    name/organization equal; version: rule fields equal) → no-op, reported as duplicate.
  - Present with a difference:
    - Published row → hard conflict; import aborts with a before/after report; the fix is a
      new revision or new version, never an overwrite. This is the immutability gate.
    - Draft row → update is permitted (unpublished drafts are correctable), reported
      explicitly, never silent.
- Conflict detection uses the natural-key lookup inside the same transaction, so a
  concurrent equal import either sees the row (no-op) or creates it (insert); differing
  content on the same key aborts without partial writes.

Rejected alternatives: upsert-overwrite (would silently mutate published rows); DB triggers
for immutability (heavier; app-level gates plus code review chosen for slice 1 — DB-level
triggers are a listed remaining decision, §10); accepting CSV/handwritten counts.

## 6. Read API (proposed)

Registered in `src/app.ts`; GET-only with the existing 405-on-non-GET `onRequest` pattern
from `src/routes/public.ts:8-18`. Error bodies are `{ "error": string }` in the existing
style; identifiers are validated with the existing `/^[a-zA-Z0-9_-]{1,128}$/` pattern → 404
(mirrors `src/routes/public.ts:39`). Responses `Cache-Control: no-store`.

### `GET /api/typing/exams`

Query: `page` (int ≥ 1, default 1), `pageSize` (int 1–50, default 20). Any other query
parameter name, a duplicate parameter, or a non-integer/out-of-range value → **400**.
Selects only published versions joined to their exam, ordered `exam.name asc, exam.slug asc,
version.id asc` (ID tie-breaker).

```json
{
  "data": [
    {
      "exam": { "id": "…", "slug": "…", "name": "…", "organization": null },
      "version": {
        "id": "…",
        "versionKey": "v1",
        "label": "…",
        "examYear": 2024,
        "language": "en",
        "durationSeconds": 600,
        "backspacePolicy": "DISABLED",
        "editingPolicy": "<frozen at first exam>",
        "scoringMethod": "<frozen at first exam>"
      }
    }
  ],
  "pagination": { "page": 1, "pageSize": 20, "totalItems": 0, "totalPages": 0 }
}
```

Policy fields are non-null for every published version (publication precondition, §3);
they may only be `null` in drafts, which never appear here. `targets`, instructions and
rule-source live on the detail response only. Each item is explicitly an _exam version_,
not an exam (plan §6).

### `GET /api/typing/passages?examVersionId=…`

Query: `examVersionId` (required, 1–128 chars; unknown/never-published version → 404 if the
ID is well-formed, 400 if malformed), plus `page`/`pageSize` as above; strict unknown/dup
rejection → 400. Only passages that are `PUBLISHED` inside a `PUBLISHED` version, ordered
`contentKey asc, revision asc, id asc`. Metadata columns only — **no `text`, no
`contentHash`, no reviewer/internal fields**:

```json
{
  "data": [
    {
      "id": "…",
      "contentKey": "…",
      "revision": 1,
      "title": "…",
      "examYear": 2024,
      "shift": null,
      "sourceKind": "OFFICIAL_PREVIOUS_YEAR",
      "charCount": 932,
      "wordCount": 164
    }
  ],
  "pagination": { "…": "…" }
}
```

### `GET /api/typing/passages/:id`

One published passage plus its exact applicable rules:

```json
{
  "id": "…",
  "contentKey": "…",
  "revision": 1,
  "title": "…",
  "examYear": 2024,
  "shift": null,
  "text": "<exact stored text>",
  "contentHash": "<64 hex>",
  "sourceKind": "…",
  "sourceUrl": null,
  "sourceNote": "…",
  "charCount": 932,
  "wordCount": 164,
  "rules": {
    "durationSeconds": 600,
    "backspacePolicy": "DISABLED",
    "editingPolicy": "…",
    "scoringMethod": "…",
    "targets": {
      "targetWpm": null,
      "maxErrorPercent": null,
      "targetKeystrokes": null
    },
    "instructions": "…",
    "ruleSource": { "url": null, "note": "…" }
  }
}
```

Targets are `null` when not required/unknown — never `0`. Public projections expose no
reviewer identities, draft notes, `reviewedAt`, `updatedAt` or unrelated account data.

Status codes (both endpoints and detail, per plan §6 and frozen above):

- `200` valid request; `400` malformed/duplicate/unsupported/missing-required query input;
  `404` unknown, draft or retired passage, or malformed identifier; `405` non-GET;
  `500` internal (existing handler); `503` temporary database failure with a generic message.
- Drafts and retired records are invisible to every public query, including direct IDs.

Rejected alternatives: Next.js server-side DB handlers (plan forbids parallel handlers);
enriched list payloads containing text (defeats bounded loading); permissive unknown-param
tolerance (broader input acceptance is a contract revision under protocol §1).

## 7. Implementation limits (proposed, confirmable)

Page size default 20 / max 50; page max 10,000; identifier length 128; passage text 50,000
code points at import; `versionKey`/`contentKey` length caps per §3. These are
implementation limits to validate against real examples, not official exam limits.

## 8. Enums that cannot be frozen without the first exam

Cannot freeze now (values stay code-owned and empty; drafts may carry provisional strings,
nothing publishes until a real exam's rules are recorded and reviewed):

- `editingPolicy` — named policies covering cursor movement, selection, Delete and
  insertion (plan §4 explicitly freezes these with the first stored exam).
- `scoringMethod` — the marking method, plus which of `targetWpm` / `maxErrorPercent` /
  `targetKeystrokes` it actually requires, and the qualification semantics derived from
  them (missing threshold ⇒ "qualification not assessed", never a zero-default).
- Duration and any threshold values themselves — decided at content entry with source
  evidence (`ruleSourceUrl`/`ruleSourceNote`).

Freezable now, with one caveat: `TypingContentStatus` and `TypingSourceKind` (workflow and
provenance states); `backspacePolicy` value set `UNRESTRICTED | DISABLED |
CURRENT_WORD_ONLY` — but `CURRENT_WORD_ONLY`'s precise behavior (word-boundary definition,
whether the caret may rest mid-word) must match implemented session-engine behavior before
any published version uses it, per plan §7's policy-enforcement requirement.

`language` is frozen to `"en"` for slice 1; no Hindi/IME claims until implemented and tested.

## 9. Smallest first implementable slice (recommended)

1. **Contract record first** (coordinator): register the boundary, this proposal's shapes,
   and frozen fixtures in `docs/contracts/` per protocol §3, §7 — before any code.
2. **Additive migration** for the three models/enums, reviewed, not applied to production.
3. **`src/lib/typing-content.ts`** — canonicalize/hash/count helper with pure-function tests.
4. **Draft-only import script** — validate → preview/dry-run default → explicit apply;
   idempotent repeat; draft publish-refusal; read-back comparison.
5. **Read API** — the three endpoints with published-only filters, strict query validation,
   status codes above, and inject tests (400/404/405/503/200; no `text` in lists).
6. **No published fixture.** The catalogue ships empty (a valid handled state, plan §12);
   the illustrative draft below is test data only. The first published exam configuration
   is entered with Hemant — that is when §8 enums freeze.

This slice deliberately avoids inventing any scoring/editing policy value, threshold or
qualification rule, and includes no exam UI work.

## 10. Acceptance checks for the eventual implementation (proposed; not run here)

This is a documentation-only snapshot — no runtime tests were executed. Proposed checks
for the implementing batch, mirroring plan §11:

- _Import_: valid draft insert; repeated import = no-op; changed text under the same
  `(contentKey, revision)` = conflict + full rollback; empty/oversized/control-char text,
  invalid enum or key format rejected; attempt to write `PUBLISHED` refused; derived counts
  equal helper output; DB failure leaves no partial writes.
- _Database (disposable DB)_: migration applies; FK restrict behavior; unique-key conflicts;
  draft/retired invisible to published-only queries; deterministic order with ID tie-break.
- _Fastify (inject)_: 200 shape exactly as §6; 400 for unknown/duplicate/out-of-range query
  params; 404 unknown/draft/retired detail and malformed ID; 405 non-GET; 503 simulated DB
  failure; list responses contain no `text`; detail returns the exact associated rules.
- _Read-back integrity_: import → read back text, hash, metadata and rule fields unchanged.

## 11. Illustrative draft import JSON (NOT an official exam; test data only)

```json
{
  "exams": [
    {
      "slug": "illustrative-typing-exam",
      "name": "Illustrative Typing Exam (draft, not an official paper)",
      "organization": null,
      "versions": [
        {
          "versionKey": "v1",
          "label": "Illustrative draft — rules unresolved",
          "examYear": null,
          "language": "en",
          "durationSeconds": null,
          "backspacePolicy": null,
          "editingPolicy": null,
          "scoringMethod": null,
          "targetWpm": null,
          "maxErrorPercent": null,
          "targetKeystrokes": null,
          "instructions": null,
          "ruleSourceUrl": null,
          "ruleSourceNote": null,
          "status": "DRAFT",
          "passages": [
            {
              "contentKey": "illustrative-sample-1",
              "revision": 1,
              "title": "Illustrative practice sample",
              "examYear": null,
              "shift": null,
              "sourceKind": "PRACTICE",
              "sourceUrl": null,
              "sourceNote": "Locally written sample; not an official previous-year paper",
              "text": "The quick brown fox jumps over the lazy dog.\nA second line kept exactly as typed."
            }
          ]
        }
      ]
    }
  ]
}
```

This imports as drafts with all rule fields null and `sourceKind: "PRACTICE"`; it must never
be described as an official previous-year paper and must never auto-publish.

## 12. Remaining approval decisions (for Hemant/coordinator)

1. Approve this field/shape contract as a new shared contract record (protocol §7), then
   freeze it before any implementation begins.
2. Approve the additive `prisma/schema.prisma` change and its migration (shared file).
3. Approve the counting convention (§4: code points excluding LF; whitespace-run words) and
   no-NFC default canonicalization.
4. Approve strict unknown/duplicate query-parameter rejection with 400 (input widening is
   a contract revision under the protocol).
5. Approve the implementation limits (§7) or adjust them.
6. Decide whether `backspacePolicy`'s value set freezes now (this proposal) or together
   with `editingPolicy`/`scoringMethod` at the first exam.
7. Decide whether published-row immutability needs DB-level triggers now or app-level gates
   suffice for slice 1 (this proposal: app-level, triggers deferred).
8. Approve endpoint paths/shapes so the frontend lane (slice 3) can consume the frozen API.

## 13. Alternatives rejected (recap)

- Generic JSON rules engine or blob-typed rules — plan §4 forbids; typed fields chosen.
- Next.js DB handlers for typing — plan §6 requires one Fastify API.
- Editable materialized counts and client-supplied counts/hash — drift and spoofing; derived.
- Upsert-overwrite on import — violates published immutability; conflict + new revision.
- NFC/whitespace normalization by default — could change the text being assessed.
- An attempts table or Redis cache in slice 1 — plan §9/§6 defer or exclude both.
- Admin dashboard / automated scraper — manual reviewed import only (plan §5).

## 14. Report location

This proposal: `docs/agent-progress/typing-storage-glm-proposal.md` (this file). No other
files were created or modified. Report path: `docs/agent-progress/typing-storage-glm-proposal.md`.
