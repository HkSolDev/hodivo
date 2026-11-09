# Automated review and repair

Branch: `codex/vision-enrichment-20261103`. Existing worker changes were saved
separately in checkpoint `bdf733a` before this implementation.

## Implemented flow

HTML remains the first source. Existing PDF selection and OCR/Vision recovery
supplement missing fields, with a default limit of six Vision pages per notice.
Both worker entry points now share `review_and_repair`: review, request verified
official enrichment for reported fields, merge validated candidates, review
again. Each run permits two repair rounds and three reviews. Review findings
force research even when the existing value already has a citation.

The scheduled worker configures a Gemini reviewer with the default extractor
and configured key pool. `repair_clients.py` uses existing Gemini Google Search
grounding for discovery and existing public-URL capture for evidence. Quotes
must match captured text and pass issuer, advertisement and post-binding checks.
The injectable autonomous entry point uses the reviewer/search/capture supplied
by its caller. Existing enrichment field/schema limits remain in force; unsupported
repairs remain unresolved rather than invented.

Final deterministic validation, Vision/enrichment checks and the last review
control automatic ingestion. No human approval step is added. Unaccepted valid
drafts retain the candidate and review/repair reports with a one-hour retry time.
Due retries resume saved facts and re-review without repeating extraction when
the evidence cache remains valid. Changed evidence or invalid cached citations
still cause a cache miss. Invalid candidates use the existing retry/checkpoint
path. Other notices continue. A persistence failure no longer records completed
state before delivery. Acceptance alone is not proof that a database write occurred.

This is bounded automatic recovery, not a guarantee that internet results are
correct or that every notice eventually publishes. Missing evidence never becomes
permission to publish. Merged-facts artifacts now contain the post-repair facts.

## Verification and review

Offline Python suite: 413 tests pass. Existing tests were extended for scheduled
retry and explicit three-page cap behavior; added coverage checks the default six
page boundary, real planner/merge with mocked search/capture followed by re-review,
repair exhaustion, missing reviewer findings, numeric candidates and stale capture.
These tests establish orchestration and validation, not live OCR or search accuracy.
`git diff --check` passes. `pnpm typecheck` and `pnpm lint` were attempted but could
not start: this worktree has no node_modules (`tsc` and `eslint` unavailable).
No paid API calls, live ingestion, deployment or live accuracy test was performed.

A fresh code-only Graphify extraction of this branch's services/ai (1190 nodes,
3148 edges) confirmed both callers of the shared helper and the existing Vision
and acceptance tests. Source was read directly after lookup. Generated graph kept
outside Git at `/private/tmp/aptus-review-repair-graph-20261109`; it is a lookup
snapshot and becomes stale after subsequent edits.

Confirmed issues addressed, scored for production conditions:

| Issue and concrete trigger                                | Likelihood | Impact | Risk | Evidence / targeted fix                                                      |
| --------------------------------------------------------- | ---------- | ------ | ---- | ---------------------------------------------------------------------------- |
| Review flags a cited value but planner skips it           | 6          | 7      | 42   | Pass review findings as validation errors; helper test asserts planner input |
| Reviewer returns an object without findings and passes    | 4          | 8      | 32   | Missing-findings regression; malformed response now fails closed             |
| Pending valid draft reused forever without another review | 6          | 7      | 42   | Scheduled retry regression resumes saved candidate and invokes reviewer      |
| Completed state recorded before persistence throws        | 4          | 7      | 28   | Source ordering: completion now follows successful persistence               |
| Audit merged facts saved before repair                    | 6          | 5      | 30   | Save moved after repair and includes repair reports                          |

No speculative concerns were used to justify unrelated refactoring.

## Main integration and local failure diagnosis — 9 November 2026

Merged locally available `origin/main` (`f8c6569`) without replacing Vision's
worker implementation. Kept both automated records and main's review models,
receipt validation, and extraction/provider metrics. Repair resumes retain saved
facts without recording a fresh extraction call.

The combined Python suite reproduced five storage validation errors: repair
bookkeeping was written outside the strict draft schema. Moved those fields into
existing `metadata`; extended the existing saved-draft/resume test to validate
that envelope. All 461 offline Python tests pass. All three autonomous ingestion
tests pass with in-memory database doubles; these do not prove live database or
provider behavior. Their Python helper now uses the project virtualenv, matching
CI dependency installation and the other contract tests.

Prisma validation, type checking, lint, and repository formatting pass locally.
Formatted six branch-owned files rejected by the formatting check. GitHub fetch
and CI-log retrieval failed due to agent-environment DNS/connectivity, so the
remote failure steps and latest main SHA remain unverified. No deployment,
publication, paid provider call, or merge into main was performed.
