# Typing storage/read API: independent design review

Date: 12 November 2026
Reviewer: DeepSeek (independent review lane)
Batch: `typing-storage-design-20261112`, revision `draft-1`
Scope: design-only review of planned slice 2. No implementation, schema,
migration, contract-lock, install, network, secret, database, commit, push or
deployment action was performed. No runtime tests were run.

## Baseline acknowledgement

I acknowledge the assignment baseline: a read-only source snapshot from
`aptus-next`, branch `codex/typing-practice-plan`, HEAD
`d930a69e0093a440ef5ad99c92a6ab19326cec17`, plus current uncommitted files. It is
**not** a clean release commit. This review does not treat the snapshot as a
release baseline, does not verify the claimed slice 0/1 results, and does not
claim any runtime, database, browser or deployment evidence.

Snapshot limitation: the supplied tree contains only `src/app.ts`,
`src/routes/public.ts`, `src/lib/public-jobs.ts`, `prisma/schema.prisma`,
`package.json`, `tsconfig.json`, `deployment/api.Dockerfile` and docs. Files
referenced by the plan or by these modules are absent here, including
`src/routes/jobs.ts`, `src/routes/job-detail.ts`, `src/db.ts`, `src/server.ts`,
`frontend/`, `scripts/`, `generated/prisma`, tests, migrations,
`docs/TYPING_IMPLEMENTATION_REVIEW.md` and
`docs/AGENT_COORDINATION_2026-11-12-typing.md`. Their absence here is an evidence
limitation, not proof they are absent from the real branch. I therefore cannot
trace `handleJobs` query validation, the Next rewrite, the Prisma adapter, the
migration tool configuration, or the claimed slice 1 evidence.

## Bottom line

Slice 2 is **not ready to implement** and remains `planned`, not
`contract frozen`. The plan is directionally sound, but it defers decisions that
must be fixed before an additive migration or public read contract can be
written. The largest risks are not Prisma mechanics; they are ambiguous
null/unknown semantics, an enum-freeze contradiction, incomplete
published child-parent filtering, and an import design that could overwrite or
silently duplicate reviewed content.

## Frozen constraints (not reopening these)

These come from the assignment and approved plan, not from this review:

- Store exact passage text plus explicit, typed rules. No attempts table.
- No invented official duration, Backspace, editing, scoring or threshold
  defaults. Unresolved rules stay null in a draft.
- One mode at a time; practice is complete; slice 2 is storage/read API only.
- Published text/rules are immutable; a correction creates a new
  version/revision; retirement is not deletion.
- Empty catalogue is valid; do not seed unverified content as published.
- Additive migration; code rollback does not drop catalogue tables.
- Existing Aptus frontend/Fastify/Prisma split and generic error body style.
- All current source samples are unverified. Do not claim what this review did
  not run.

## What the existing code actually shows

- `src/app.ts:21-30` builds Fastify with `maxParamLength: 128`, no body schema for
  GETs, and `removeAdditional: false`.
- `src/app.ts:37-52` maps 4xx errors to a generic message and **everything else
  to 500**. A thrown 503 would become 500. A planned 503 must be returned
  explicitly with `reply.code(503)`, not thrown into this handler.
- `src/app.ts:33-35` returns `{ error: 'Not Found' }` for unmatched routes.
  Overlong path parameters hit the router limit and become 404 before a typing
  handler can return 400.
- `src/routes/public.ts:8-33` uses `app.all` plus an explicit 405/`Allow`
  pattern; it parses query strings manually with `URL.searchParams`.
- `src/routes/public.ts:39` validates a public id with
  `/^[a-zA-Z0-9_-]{1,128}$/`. This is the closest existing id-validation pattern.
- `src/lib/public-jobs.ts:7-31` uses an explicit Prisma `select` projection and
  never selects user/profile data. That is the right model for typing list
  responses.
- `src/lib/public-jobs.ts:35-100` validates nothing itself; it assumes `page`
  and `pageSize` were already checked. It performs count and rows in one
  `RepeatableRead` transaction, uses offset pagination, and adds `id` as a
  deterministic tie-breaker.
- `src/lib/public-jobs.ts:102-113` uses `findUnique` for detail and widens the
  projection there. For typing, a filtered query plus an explicit detail
  projection is safer.
- `prisma/schema.prisma:6-13` uses Postgres and a generated client outside
  `src`; `prisma/schema.prisma:187` already demonstrates `onDelete: Restrict`
  for protected relations. Existing recruitment `Source` has a unique `url` and
  mutable `fetchedAt`, so reusing it for typing content would be wrong.
- `deployment/api.Dockerfile:7-13` copies `src`, named scripts and `frontend`,
  not an arbitrary root `lib/`. A slice-2 server module under `src/lib` is
  included automatically; a new root shared module or operator script is not.
- `package.json:24-25` typechecks `scripts/**/*` and `src/**/*`; database tests
  are not automatically isolated by the default test scripts.
- `docs/contracts/README.md:93-108` makes contract artifacts, fixtures and
  checks coordinator-controlled. The plan and protocol already say new shared
  field semantics need a reviewed contract. That contract is not present.

## Risk review

### 1. Route integration, status codes and caching

Real risks:

- **503 mismatch.** The plan requires 503 for temporary database failure
  (`TYPING_APPLICATION_PLAN.md:228-229`), but the current error handler collapses
  it to 500. Catch database failures in the route and send a generic 503
  explicitly; log without request text or credentials.
- **400/404 ambiguity for oversized ids.** `maxParamLength: 128` means a longer
  path id is a router-level 404 before validation. If the contract requires 400
  for a malformed id, it cannot be met without changing router behavior. Freeze
  whether overlong ids are accepted as 404 (recommended, consistent with
  `public.ts:39`) and require 400 only for bad query parameters.
- **Method handling.** New routes must decide whether to mimic the explicit
  405 pattern in `public.ts` or accept Fastify's default unmatched-method
  behavior. Do not leave this implicit.
- **Cache policy.** The plan says fresh `no-store` reads. Both list and detail
  must send `Cache-Control: no-store`; otherwise a retired passage can remain
  cached. A published immutable row could be cached later, but that is a
  separate decision and should not be mixed into the first slice.
- **Detail-before-start caching.** Next server rendering must not cache a detail
  fetch and later hydrate from a stale snapshot. Freeze the client start snapshot
  behavior; do not refetch the same detail on mount.

### 2. Pagination and text exposure

Real risks:

- **Text in list responses.** The only safe pattern is an explicit list
  `select` that omits `text`, internal notes, reviewer fields and provenance
  fields not approved for public display. Do not reuse a detail projection or a
  shared broad `publicFields` object for both endpoints.
- **Unvalidated page inputs.** `public-jobs.ts` trusts its caller. Typing routes
  need explicit runtime parsing before `skip` arithmetic: reject empty,
  non-integer, signed, exponent, whitespace-padded, duplicated and
  out-of-range values. `page=0`, negative `pageSize`, `pageSize=51`,
  `page=10001` and `?page=1&page=2` must have frozen behavior (recommended 400).
- **Page beyond the last page.** This should be a defined outcome, not an
  accident. Recommend 200 with an empty `data` array and honest `totalItems`;
  do not turn it into 404.
- **Count/rows consistency.** The existing `RepeatableRead` count-and-rows
  transaction is a reasonable precedent while publication/retirement can occur.
  Reuse it or explicitly justify a single-query alternative.
- **Ordering.** `id` tie-breaking is necessary but not sufficient. Freeze the
  full order: exam list (e.g. parent exam display name, year nulls last, version
  key, id) and passage list (year, shift, revision, id). Do not expose a
  user-controlled sort key without an allowlist.
- **Deep offset cost.** `page <= 10000` still permits expensive offsets. Keep
  the limit, document it as an implementation guard, and defer cursor pagination
  rather than silently adding it.
- **Response size.** A 50,000-character passage detail is large but bounded.
  Freeze the counting unit (see below) and ensure the limit is enforced before
  storage, not only in the browser.

### 3. Null versus unknown versus not applicable

This is the most important unresolved contract area. The plan correctly says
unknown is not zero and missing is not the same as null
(`docs/AGENT_CONTRACT_PROTOCOL.md:98-121`), but the response contract does not
yet state how each field distinguishes:

1. key present with a known value;
2. key present with `null` meaning unknown;
3. a value not applicable to the selected scoring method;
4. a key omitted entirely;
5. an empty string or zero.

Recommended proposals for approval, not frozen decisions:

- Response keys are always present; JSON omission is never used to mean unknown.
  Null means unknown or unstated; never coerce null to zero, an empty string or
  a default label.
- Published versions require non-null values only for fields the selected
  scoring method actually needs; unresolved required fields block publication.
- A field that is inapplicable to a method is not silently the same as unknown.
  Prefer a per-method `rules` shape (discriminated by `scoringMethod`) or an
  explicit assessment-state field. This needs a reviewed contract; the current
  flat table is insufficient.
- `durationSeconds`, thresholds and counts reject zero/negative/NaN unless the
  selected semantic explicitly allows zero (for example a zero-error allowance
  is a boundary decision, not an automatic default).
- `examYear` null is unknown; zero is invalid. `shift` null is unknown; empty
  string is invalid. `organization` null is unknown.
- `language` is explicit and supported; do not represent unknown language as
  null and do not advertise unsupported language support.
- `sourceNote` must be declared public-safe. If it can contain internal review
  prose, it must not be exposed; add a separate internal note only if needed.
- Status is a closed enum, never null and never a free-form string.

Until this is frozen, a frontend cannot correctly show "qualification not
assessed" versus "threshold is zero", and a strict consumer will either invent a
default or reject a valid payload.

### 4. Published child-parent filtering

The plan's two-status rule (`TYPING_APPLICATION_PLAN.md:170-179`) is necessary
but incomplete. Freeze these additional points:

- List passages must filter both `passage.status = PUBLISHED` and
  `examVersion.status = PUBLISHED`. Filtering only the passage leaks content
  under a draft/retired version.
- Detail must use one filtered query
  (`findFirst`/`findFirstOrThrow` on id + both statuses), not `findUnique`
  followed by a check. The latter permits a race and can distinguish
  draft/retired existence through timing or error paths.
- The exam list must not expose a published version whose parent exam is
  unusable. Decide explicitly whether a version with zero published passages
  appears. Recommendation: hide it from the selectable list, or return it with
  an honest empty state; do not invent a passage.
- A passage cannot be `PUBLISHED` under a `DRAFT` or `RETIRED` version. This is
  a write-time invariant for the importer/publication step, not something a
  simple foreign key can enforce.
- Counts (`totalItems`) must use exactly the same filter as the rows.
- All not-found states (missing, draft, retired, wrong parent) should be a
  uniform 404 with no existence leak. Decide whether a draft `examVersionId`
  in the passages list is a 404 or an empty 200; either is defensible, but it
  must be frozen and tested.
- Retiring a version should make all its passages unstartable for new sessions;
  an already loaded client may finish from its frozen snapshot.

### 5. Import idempotency, revisions and publication

The plan's dry-run/default-write design (`TYPING_APPLICATION_PLAN.md:180-206`)
is good, but the identity and conflict rules are underspecified.

Proposals requiring approval:

- **Identity scope.** Freeze whether `contentKey` is globally unique or unique
  within an exam/version. The natural key is
  `(examVersionId, contentKey, revision)`. The plan currently says only
  `contentKey + revision` (`:148`) without the parent scope.
- **Revision allocation.** Do not auto-increment implicitly. The import file
  should carry the explicit revision. A taken `(examVersionId, contentKey,
revision)` with identical content and metadata is a no-op; with different
  bytes or metadata it is a conflict. The operator creates the next revision.
- **Create, never upsert.** Prisma `upsert` can silently mutate a published row.
  Use `create` inside a transaction, or read-and-insert with a guarded
  comparison, and catch the unique-constraint error. A conflicting import must
  abort, not overwrite.
- **Comparison is broader than the hash.** `contentHash` equality detects equal
  text, not equal metadata, rules, provenance or status. Compare every stored
  field before declaring a no-op.
- **Transaction scope.** Validate the whole import before writing, then apply a
  transaction (per file or per record as approved). A conflict should produce a
  clear nonzero result and no partial import. Read back and compare text, hash,
  metadata and rules after commit.
- **Ambiguous commit retry.** If the process dies after commit but before
  reporting, re-running dry-run/apply must find the row and report a no-op, not
  create a duplicate. State this explicitly and test it.
- **Publication is separate.** Import creates drafts only. Publication is an
  explicit reviewed transition that verifies both passage and version
  completeness, sets `reviewedAt`/`publishedAt` once, and is idempotent on retry.
  Never silently publish a draft because it was imported a second time.
- **Immutable published rows.** State the enforcement level. Application-only
  enforcement is acceptable for v1 if the importer is the only writer and no
  update API exists; a database trigger is stronger but optional future work.
  Do not claim immutability if a generic update path remains possible.
- **Transitions.** Freeze allowed status transitions: `DRAFT -> PUBLISHED`,
  `PUBLISHED -> RETIRED`, and perhaps `DRAFT -> RETIRED`; forbid republishing a
  retired version and forbid editing a published revision in place.
- **Retirement timestamp.** The plan has no `retiredAt`. Decide whether that is
  acceptable; adding it later is additive but loses historical timing for
  already-retired rows.
- **Duplicate text.** Decide whether the same text may exist under another
  revision or content key. Hash equality must never be used as proof of
  authenticity or official provenance.

### 6. Exact-text integrity, canonicalization, hash and counts

The plan says canonical text and a stored hash (`:150-160`, `:199-206`) but does
not define the canonical form. Freeze, before the first import:

- Encoding: UTF-8 input; reject invalid UTF-8 and reject U+0000 (Postgres text
  cannot store it). Do not silently strip or replace bytes.
- Line endings: choose a deliberate policy. Preserving CRLF in Postgres while a
  browser textarea exposes LF can make displayed text and hash disagree.
  Recommended: canonicalize CRLF/CR to LF at import, document that this is the
  stored form, and do not collapse any other whitespace. This is a semantic
  decision, not an implementation detail.
- BOM: strip a leading UTF-8 BOM or reject it, and document which.
- Unicode normalization: do not apply NFC/NFD silently; it changes code points
  and therefore the assessed passage. Preserve as supplied unless reviewed.
- Control characters: allow `\n` and `\t`; decide whether other control
  characters are rejected rather than silently retained. Do not strip trailing
  spaces or blank lines.
- Hash: freeze the algorithm and encoding, e.g. lowercase SHA-256 hex over the
  UTF-8 bytes of the canonical stored text. Compute it with one shared helper
  used by import and read-back. The hash is an integrity/duplicate signal, not
  proof of authorship, officialness or review.
- Counts: freeze a documented counting convention before exposing derived
  counts. `String.length` is UTF-16 code units and is usually wrong for
  non-BMP text; code points via `Array.from` are a defensible start, but
  combining marks, emoji and word boundaries still need a decision. State the
  unit (code points/words), whitespace rule and max-length unit. Label counts
  as stored-text statistics, not official exam marking.
- Round-trip proof: write and read back text containing CRLF, tabs, trailing
  spaces, quotes, backslashes, `<script>`, emoji and combining characters.
  Assert byte/code-point equality, hash recomputation and derived counts.
  Do not use a test helper that reimplements the counting rule; share the
  production helper.

### 7. Migration and deployment compatibility

- The proposed three new tables and enums are additive and should not alter
  `Post`, `Source`, `User`, auth tables or saved jobs. Keep it that way; no
  backfill, no renamed columns, no status columns on recruitment tables.
- `prisma/schema.prisma:6-13` has no datasource URL and the Prisma config file
  is absent from this snapshot. I cannot verify the actual migration command or
  whether Prisma 7 driver-adapter configuration changes deploy steps. Do not
  claim migration compatibility until the real workspace's generated client,
  migration SQL and deploy command are inspected.
- Additive migration order: apply schema before API, API before any content,
  content before exam UI. Old images should continue running against the new
  tables. Rollback should restore compatible images and keep the tables; retire
  bad content instead of dropping history.
- Use Postgres `text`, not a narrow `varchar`, for passage text; the 50,000
  limit belongs in import validation unless a reviewed DB constraint is added.
- Indexes and uniqueness need an explicit list tied to real queries, not every
  field. At minimum: exam slug unique; version `(examId, versionKey)` unique;
  passage `(examVersionId, contentKey, revision)` unique; status/version
  indexes used by list and detail. Add a non-unique content-hash index only if
  duplicate detection actually queries it.
- New `src` files are included by the current Dockerfile. A new root
  `lib/typing` module is not. For slice 2, keep server catalogue code under
  `src/lib`; if the import script must exist inside the image, add an explicit
  Dockerfile copy. Do not rely on the plan's proposed root layout without
  changing the image.
- Database tests must use a disposable database and must not join the default
  offline contract suite unless that suite is designed to skip without
  `TEST_DATABASE_URL`.

## Independent review of the current plan

The plan is honest about deferral and correctly rejects a JSON rules engine,
unverified fixtures and attempt persistence. The following are real gaps or
internal tensions, not code defects:

1. **Enum freeze contradiction.** The plan says editing-policy and
   scoring-method values are frozen with the first stored exam
   (`:133-137`), but a Prisma/Postgres enum must have values at migration time.
   Slice 2 cannot write the migration before that decision. Either freeze the
   enum sets now, define a safe non-official storage representation for unknown
   methods, or split the schema so scoring columns are added later. This is a
   blocker; do not pick an enum value merely to make the schema compile.
2. **`editingPolicy` has no value list.** It is described behaviorally but not
   enumerated. The schema and runtime validator cannot be written against an
   undefined type.
3. **`scoringMethod` has no value list and no implemented scorer.** The plan
   permits a null draft method, but the column type still needs a decision.
4. **"Nullable only while draft" is imprecise.** Retired rows are also not
   public. Reword the invariant as "non-null and complete for PUBLISHED under
   the selected method"; do not imply that retirement erases values or that
   drafts may contain invented placeholders.
5. **`contentKey` uniqueness scope is unstated.** The plan says `contentKey +
revision` but also places passages under a version. Freeze the full key.
6. **Canonicalization and counting convention are unstated.** The plan says
   "documented" but names no document or rule. The API cannot promise exact
   text and derived counts without it.
7. **Version selection and empty versions are unstated.** The exams endpoint
   says published version summaries, but a published version with no published
   passage is a dead end. Decide whether to hide it.
8. **503 conflicts with the existing error handler.** The plan must state that
   routes return 503 explicitly rather than throwing.
9. **`sourceNote` publicness is ambiguous.** Decide whether it is public
   provenance or internal review material.
10. **Retirement timestamp is absent.** Optional, but decide rather than leave
    audit history implicit.
11. **The plan's evidence links are not in this snapshot.** The status table
    claims slice 1 verification and references an implementation review and
    coordination batch that are unavailable here. This does not invalidate the
    plan, but slice 2 cannot be marked `contract frozen` from this snapshot
    alone; the coordinator must supply the actual batch record and contract
    revision.
12. **"Page max 10000" is a product/implementation limit, not an exam limit.**
    Label it as such; do not let it become an official rule.
13. **The plan correctly says no full text in lists and no browser database
    handlers.** Preserve those as acceptance criteria, not suggestions.
14. **No production fixture is safe.** The initial four counts are known wrong
    (`:206`), so importing them as published would repeat a known defect. Keep
    them draft/practice until provenance and rules are reviewed.

## Alternatives rejected

- Reusing `Post`/`Source` for typing: rejected. It would conflate recruitment
  publication, source hashing and public-job projections with exam catalogue
  semantics.
- Storing all rules in one `Json` column: rejected by the plan and by the
  protocol's required/unknown/null rules. It weakens validation and makes
  "unknown" indistinguishable from "not applicable".
- Import `upsert`: rejected. It risks mutating published rows and hiding
  revision conflicts.
- `findUnique` then status check for detail: rejected. Use one filtered query.
- Cursor pagination now: rejected for v1. Offset pagination matches Aptus and
  keeps the first slice small; revisit only if real catalogue size demands it.
- Caching or ETag in slice 2: rejected for v1. Retirement staleness and cache
  keys need a separate decision.
- Materialized editable counts: rejected. Derive from stored text with one
  helper.
- Auto-publishing imports: rejected. Publication is an explicit reviewed
  transition.
- Seeding sample catalogue rows to avoid an empty list: rejected. Empty is a
  valid state; unverified samples must stay drafts and must not masquerade as
  official papers.
- Storing HTML/Markdown: rejected. Plain text only; render through React text
  nodes.
- Adding an attempts table now: frozen out of scope.

## Minimal safe first slice (proposal)

Do not start coding until the P0 contract decisions below are recorded. Once
they are:

1. Add the three additive models and the **approved** enums only. No changes to
   existing recruitment/auth tables, no seed data, no attempt table.
2. Add one server-side catalogue module under `src/lib/` with explicit list and
   detail projections; list never selects `text`.
3. Add one `src/routes/typing.ts` with two GET endpoints, strict query parsing,
   filtered published child-parent reads, uniform 404s, explicit 503 handling
   and `Cache-Control: no-store`.
4. Add a draft-only import path with validation, dry-run, explicit apply,
   create-not-upsert, conflict reporting and read-back. No publication of real
   content.
5. Add tests with a disposable database and synthetic, clearly non-official
   fixtures. No production seed, no published sample, no exam UI, no frontend
   work.

If the enum sets cannot be approved now, do not write an artificial schema
split just to start early. Finalizing the contract and enum values is the
smaller, safer step; adding core-only columns and changing them again later
creates avoidable migration churn.

## Prioritized acceptance checklist

### P0: blockers before implementation

- [ ] Batch record exists and names the exact baseline, owned paths, protected
      paths, contract revision and acceptance cases. Slice 2 is explicitly
      `contract frozen` before edits.
- [ ] Approved enum values for passage/version status and every typed rule
      field, or an explicit approved deferral of the rule columns. No placeholder
      enum invented to make Prisma compile.
- [ ] Approved API contract: exact list/detail shapes, key presence, null
      meanings, unit definitions, pagination fields, error body, status codes,
      headers and query-parameter rules.
- [ ] Published child-parent filters proven for list and detail: draft passage,
      retired passage, draft version, retired version, version with no published
      passages, wrong parent and direct-id guesses.
- [ ] List projection proven to omit passage text and internal fields; detail
      projection proven exact.
- [ ] Import identity, revision allocation, no-op definition, conflict
      behavior, transaction scope and publish transition frozen.
- [ ] Exact-text canonicalization, NUL/control handling, hash algorithm and
      counting convention frozen.
- [ ] Migration reviewed as additive; existing tables unchanged; deploy order
      and code-only rollback documented.
- [ ] No seed data and no attempt table.

### P1: required within the slice

- [ ] Query parser rejects empty, non-integer, duplicate, unknown and
      out-of-range parameters with the frozen status; page beyond total is
      frozen behavior.
- [ ] Explicit 503 path for database failure; generic body; no text or
      credentials in logs.
- [ ] Deterministic ordering with an id tie-breaker and documented null order.
- [ ] `no-store` on list and detail; no refetch of the same detail on mount.
- [ ] Count and rows share a consistent snapshot, or a reviewed alternative is
      justified.
- [ ] Dry-run writes nothing and reports creates/no-ops/conflicts; apply is
      all-or-nothing per approved scope; rerun is a no-op; ambiguous-commit
      retry does not duplicate.
- [ ] Same revision + different text/metadata fails without mutating the
      existing published row; a new revision succeeds.
- [ ] Write/read-back proves exact text, recomputed hash, metadata and rule
      fields.
- [ ] Text round-trip covers CRLF, tabs, trailing spaces, quotes, backslashes,
      `<script>`, emoji, combining marks and NUL rejection.
- [ ] Token/status transitions are tested: no republish of retired content, no
      in-place edit of published content.
- [ ] Focused tests run against a disposable `TEST_DATABASE_URL`; they are not
      mixed into the offline contract suite without an explicit skip.
- [ ] `pnpm typecheck`, `pnpm lint` and the relevant existing tests are run on
      the actual implementation handoff. These were not run for this review.
- [ ] Docker includes any new runtime module; operator-only import code is not
      expected in the image unless explicitly added.

### P2: optional future work, not slice-2 blockers

- Cursor pagination or stable page tokens at real catalogue scale.
- ETag/conditional reads for immutable published rows.
- Database trigger or check constraint enforcing published immutability and
  nonempty text.
- `retiredAt`/transition audit history.
- Admin UI, automated ingestion, Hindi/IME support, search, recommendations.
- Attempt history, accounts, leaderboards. These remain explicitly out of
  scope.

## Decisions required from Hemant before implementation

1. Approve or revise the exact API contract and null/unknown semantics.
2. Resolve the enum-freeze contradiction: approve the first supported rule and
   scoring value sets, or approve deferring those columns.
3. Decide whether a published version with zero published passages appears in
   the exam list.
4. Decide the draft/retired `examVersionId` response (404 versus empty list).
5. Freeze pagination ordering, bounds, duplicate/unknown parameter handling and
   page-beyond-total behavior.
6. Freeze import identity scope, revision allocation, no-op/conflict rules and
   publication transition ownership.
7. Freeze text canonicalization, hash and counting conventions.
8. Confirm whether `sourceNote` is public-safe.
9. Confirm the enforcement level for published immutability.
10. Confirm that synthetic test fixtures are test-only and are never shipped or
    seeded as official content.

## Verification status

No runtime, database, migration, browser, typecheck, lint or test command was
run for this audit. The review is based on static inspection of the supplied
snapshot only. The absence of runtime evidence is deliberate and must not be
reported as passing verification.
