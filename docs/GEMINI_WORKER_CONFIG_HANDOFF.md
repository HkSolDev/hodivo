# Handoff — BATCH-20261110-GEMINI-CONFIG (worker lane)

Status: handed off for coordinator review. Produced by the worker-lane
implementation agent on 10 November 2026. Governed by
[AGENT_CONTRACT_PROTOCOL.md](AGENT_CONTRACT_PROTOCOL.md); the frozen batch
record is [docs/AGENT_COORDINATION_2026-11-10-gemini-worker-config.md]
(../AGENT_COORDINATION_2026-11-10-gemini-worker-config.md) (unchanged).

## Baseline and environment

- Worktree: `/private/tmp/aptus-gemini-worker-config-fix`
- Branch: `codex/gemini-worker-config-fix`
- Baseline: `3f25b40dde522da0571557c75b8d2c58ac726458` (verified equal to HEAD
  before any edit; working tree clean; `git worktree list --porcelain` confirms
  branch/worktree pairing).
- Interpreter: `services/ai/.venv/bin/python`, Python 3.14.7. The venv did not
  exist in this worktree; it was created with `python3 -m venv services/ai/.venv`
  (system python3 = `/opt/homebrew/Caskroom/miniconda/base/bin/python3`) and
  dependencies were installed with
  `services/ai/.venv/bin/pip install -q -r services/ai/requirements.txt`
  (`requirements.txt` was installed from, not edited).
- Graphify/Ponytail: neither skill is available in this agent environment; the
  project rules were followed directly (actual call paths read in source,
  smallest clear change, extended existing tests instead of duplicating).

## Commits (in order)

| Commit | Contents |
| --- | --- |
| `8d1f2d4` | Slice 1: per-purpose Gemini model wiring (`gemini_purpose_model` in `services/ai/providers/gemini.py`; review/research/vision wiring in `services/ai/generic_pipeline.py`; tests) |
| `06d0935` | Slice 2: seven-entry key-pool acceptance test; `.env.example` documents the three auxiliary model settings |
| `7e053d4` | Slice 3: missing-review recovery in `services/ai/generic_pipeline.py` reuse path; recovery tests |

Changed files (all inside owned paths; nothing else touched):

- `services/ai/providers/gemini.py` — added `GEMINI_PURPOSE_MODEL_ENV`,
  `GEMINI_PURPOSE_MODEL_DEFAULT` (`gemini-3.8-flash`),
  `_MODEL_NAME_PATTERN`, and `gemini_purpose_model(purpose, env=None)`.
  Existing key-pool functions (`gemini_api_keys`, `gemini_api_key`), rotation
  logic (`is_gemini_quota_exhausted`, `_response_has_resource_exhausted`,
  `request_json`) and extraction model resolution were **not modified**.
- `services/ai/generic_pipeline.py` —
  1. reviewer/research/vision providers receive their configured model
     (`gemini_purpose_model('review'|'search'|'vision')`); research discovery
     gets its own provider instance (`GeminiRepairSearch(GeminiProvider(...))`);
  2. `_persist_recovered_review_report(...)` helper plus recovery trigger in
     the cached-draft reuse block; `recovered` counts and
     `summary['drafts']['review_reports_recovered']`.
- `services/ai/tests/test_gemini_provider.py` — purpose-model tests, seven-entry
  pool test, request-URL model test, invalid-name failure test.
- `services/ai/tests/test_generic_pipeline.py` — provider-wiring test;
  `GenericDraftReviewRecoveryTests` (recovery, deferred recovery,
  published-draft protection, approved-draft protection).
- `.env.example` — documents `GEMINI_SEARCH_MODEL`, `GEMINI_REVIEW_MODEL`,
  `GEMINI_VISION_MODEL` with empty values; no real secret values were used
  anywhere (tests use `test-key-a`/`key-1`… style illustrative credentials).

## Per-slice completion against the frozen acceptance cases

1. **Per-task model wiring** — `LLM_MODEL=deepseek-flash` set: initial
   extraction configuration unchanged (`llm.py`, `extract_bundle.py`, and the
   `GeminiProvider.__init__` default path untouched); `gemini_purpose_model`
   returns `gemini-3.8-flash` by default for search/review/vision, and honors
   `GEMINI_SEARCH_MODEL`/`GEMINI_REVIEW_MODEL`/`GEMINI_VISION_MODEL`
   per purpose. The pipeline constructs the review provider with the review
   model, a separate research provider instance with the search model, and the
   vision default provider with the vision model; URLs are asserted to embed
   the configured model. Tests:
   `test_purpose_models_never_inherit_shared_llm_model`,
   `test_request_json_uses_the_configured_purpose_model`,
   `test_review_search_and_vision_providers_receive_their_own_models`.
   **Verified.**
2. **Key pool integrity** — pre-existing implementation verified (comma
   `GEMINI_API_KEYS`/`GEMINI_API_KEY`, numbered `GEMINI_API_KEY_1..N`,
   trimming, ordered dedup; first entry selected). Existing tests cover
   mixed numbered/comma dedup; the new
   `test_seven_comma_separated_pool_trims_deduplicates_and_selects_first`
   covers seven entries with duplicates/blanks ⇒ distinct ordered pool and
   first-entry selection. **Verified; behavior preserved, no code change
   needed.**
3. **Quota failover** — pre-existing behavior verified:
   `test_429_resource_exhausted_rotates_once_per_key_without_logging_keys`
   (one advance per key, bounded), `test_exhausted_key_pool_stops_safely…`
   (exhaustion ⇒ `unresolved` + `retryable` + `gemini_quota_exhausted`, work
   preserved), `test_non_429_errors_and_invalid_json_do_not_rotate`
   (400/401/403/500 and malformed JSON never rotate). **Verified; source
   logic unchanged.**
4. **Authentication explicitness** — 401/403 surface as
   `gemini_http_<code>` with `status: unresolved`, non-retryable (only the
   existing retryable set {408, 500, 502, 503, 504} applies), one request,
   no rotation; covered by `test_non_429_errors_and_invalid_json_do_not_rotate`
   (asserts `reason == f'gemini_http_{status}'`, `attempt_count == 1`,
   `call_count == 1`). **Verified; unchanged.**
5. **Missing-review recovery** — `test_missing_report_is_recovered_…` proves:
   second run for a reused unchanged draft missing its saved report runs the
   review on the saved envelope + saved `source_evidence` (zero extraction
   calls — asserted), persists `metadata.review_report`, preserves unknown
   metadata (`operator_observation` sentinel) and the candidate facts, keeps
   the state checksum consistent; `test_unavailable_reviewer_defers…`
   proves an unresolved/transport review leaves stored bytes untouched and a
   later run still recovers; `test_published_draft_is_never_revised` and
   `test_approved_draft_is_never_revised_or_unapproved` prove published and
   operator-approved drafts are never rewritten (approvals/receipts are keyed
   to exact bytes — see interpretation note below). **Verified offline.**
6. **Deployment plumbability** — `.env.example` documents the three model
   settings and `GEMINI_API_KEYS`/`GEMINI_API_KEY`; `deployment/worker.Dockerfile`
   already copies `services/ai/*.py` and `services/ai/providers/*.py`, so the
   patched code ships; credentials remain deploy-time environment (none in the
   image or docs). No production secrets touched. **Verified as
   documentation/plumbing only — no deployment was performed.**

## Verification performed (offline only)

- Focused suite: `PYTHONPATH=services/ai:services/ai/tests services/ai/.venv/
  bin/python -m unittest tests.test_gemini_provider tests.test_generic_pipeline
  tests.test_repair_clients tests.test_vision_recovery -q` → 27 tests, OK.
- Full Python suite: `… -m unittest discover -s services/ai/tests -q` →
  470 tests, OK.
- Baseline (pre-change) focused run: 18 tests OK; baseline full suite: 461 OK.

### Pre-existing failures (not introduced by this batch)

- The **exact** batch-record focused command
  `PYTHONPATH=services/ai services/ai/.venv/bin/python -m unittest
  tests.test_gemini_provider tests.test_generic_pipeline
  tests.test_repair_clients tests.test_vision_recovery -q` errors under this
  Python/venv setup: `tests.test_generic_pipeline` imports
  `test_autonomous_pipeline` / `test_extraction_input`, which are modules of
  `services/ai/tests` and are only on `sys.path` when tests/ is on the path.
  It failed identically **before any edit** (error at
  `test_generic_pipeline.py:196` → `from test_autonomous_pipeline import
  _make_extracted`); under the exact command with this venv it yields 5 errors
  (4 from the new recovery tests + 1 pre-existing) — all
  `ModuleNotFoundError`, no behavioral failures. Running with
  `PYTHONPATH=services/ai:services/ai/tests` (or `unittest discover -s
  services/ai/tests`, which sets the path itself) passes everything.
  Recommendation: either add `-s services/ai/tests`-style handling in the
  batch record's focused command or keep the extended `PYTHONPATH` variant
  recorded above; the coordinator may set this preference. No production
  change is required in the test modules themselves.
- No paid or live provider calls were made; all provider HTTP paths were
  exercised via injected fake `httpx.Response`/Mock clients, as the existing
  tests do. **No live-provider verification was performed** (separately
  gated; live 401 resolution and live model/search smoke checks remain a
  coordinator-gated step out of this batch).

## Interpretation notes (coordinator review items)

1. "Operator-retired records" — worker code and state at this baseline contain
   no explicit `retired` marker. Recovery conservatively treats the only
   operator-controlled out-of-circulation signals present (publication
   receipts, byte-keyed approvals) as retired/in-flight and never rewrites
   such drafts; non-recruitment dispositions are excluded by condition. If a
   dedicated `retired` flag semantic is wanted, that is a semantics change
   requiring a recorded decision — not implemented here.
2. Deferred recovery loop — while all configured keys are exhausted or the
   reviewer transport is failing, each subsequent reuse run retries the review
   once (bounded per run) and defers persistence. This preserves work and
   eventually converges, but a long outage means repeated single review
   attempts per run. If a review retry budget like the stage-retry backoff is
   wanted for the recovery path, treat that as a scoped follow-up change
   request.
3. Draft bytes are rewritten during recovery (report attached), and the state
   checksum is refreshed in the same locked section; a crash between the two
   atomic writes leaves a stale state checksum (safe cache miss ⇒ re-extract
   on the next run). Same ordering risk exists in the existing
   draft→`record_outcome` flow; flagged for awareness, unchanged pattern.
4. Model-name validation (`_MODEL_NAME_PATTERN`) fails loudly on malformed
   auxiliary model values instead of silently constructing a malformed URL.
   Behavior change is only for misconfigured values that previously would have
   been sent as-is.

## Remaining deployment steps (recommendations only — no production access)

- Populate `GEMINI_API_KEYS` (or `GEMINI_API_KEY`) in the deployment
  environment with the intended pool; optional per-purpose overrides
  `GEMINI_SEARCH_MODEL`, `GEMINI_REVIEW_MODEL`, `GEMINI_VISION_MODEL`
  (leave unset for the `gemini-3.8-flash` default). Never paste real secret
  values into chat, docs, or the repository.
- Coordinator-gated live smoke checks (not run here): live 401 resolution with
  the real credential, one license-safe grounded search request, one review
  request, and one bounded vision request against the deployed pool.

## Contract change requests

None. All shared contracts (`contracts/**`, `scripts/contracts/**`,
`candidate-storage.schema.json`, worker→backend payloads, receipts, retry and
publication semantics) are untouched; diff verified above. No protected-path
edits; no test assertions weakened or removed (existing suites unchanged and
passing).

## Explicit not-done list

No merge, no push, no deploy, no production reads/writes, no restarts, no
dependency changes, no Interactions API migration, no batch-record edits.

## Coordinator continuation — 10 November 2026

Completed the uncommitted retirement slice and added missing recovery backoff
and xAI routing. Generic task settings SEARCH/REVIEW/VISION_PROVIDER and MODEL
are now read; Gemini is the auxiliary default and retains GEMINI_*_MODEL
fallbacks. xAI requires explicit models and XAI_API_KEY, never inherits a Gemini
model, and never silently switches providers on authentication failure.
The real extraction transport in extract_bundle.request_structured supports
xAI in addition to the legacy provider factory. Web research uses /v1/responses
with the web_search tool, output citation annotations and tool usage. Review
and vision use structured chat completions; local fact/grounding gates remain.

Retired exact bytes skip repair/recovery/publication and backlog counts. The
existing retirement regression checks unchanged draft and state bytes, zero
AI work, and version-scoped processing. Recovery has an isolated
review_recovery ledger keyed by draft digest: transient failures wait 30/60
seconds then 24 hours after three failures, allowing a fresh bounded cycle.
Nonretryable errors require operator intervention/reset of that recovery
record after fixing the cause. Publication retry state is untouched.

Offline backfill against both saved cleanup manifests verified 82 original
draft versions, with 0 missing and 0 mismatches; 82 markers staged outside the
archive at /private/tmp/aptus-retirement-backfill-verified. This does not prove
those original digests still match every current production cache file.
Production application must compare the current cached bytes/state against the
markers, and explicitly review any changed versions. No production writes,
live provider calls, deployment, push or merge were performed.

Official transport references checked:
https://docs.x.ai/developers/tools/web-search
https://docs.x.ai/developers/model-capabilities/text/structured-outputs

Final verification: focused continuation tests 23 passed; full Python suite
481 passed (4.683 seconds), including retirement, backfill, Gemini routing,
xAI transport and recovery-budget tests. git diff --check passed. Graphify
code-only index refreshed and request_structured/task_provider relationships
queried, with actual callers independently inspected. SQL indexing was skipped
because the optional SQL parser is absent; no dependency was installed.
