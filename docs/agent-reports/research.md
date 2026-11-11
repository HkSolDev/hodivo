# Research lane report — focused research gap prompt

Status: handed off for coordinator review. Implemented by the replacement
OpenCode research implementer (actual model `opencode/deepseek-v4.1-flash-free`,
replacing the earlier GLM assignment) on 11 November 2026. No runtime wiring,
provider call, publication or contract revision is claimed.

## Baseline and scope

- Worktree: `/Users/mrblackghost/Work/Projects/aptus-hf-research`
- Branch: `codex/hf-research`
- Frozen batch record: `docs/AGENT_COORDINATION_HTML_FIRST.md` (initial baseline
  `3d03bbb`); this worktree started at the later coordinator freeze commit
  `e9541e7` with a clean tree and no existing unstaged work to preserve.
- Owned paths only:
  - `services/ai/research_gap_prompt.py` (new helper)
  - `services/ai/tests/test_research_gap_prompt.py` (new focused offline tests)
  - this report
- No existing runtime module, shared test, contract, schema, dependency,
  credential, production path or other worktree was edited.
- Graphify/Ponytail: not available in this agent environment (same limitation
  recorded in `docs/GEMINI_WORKER_CONFIG_HANDOFF.md`). The prescribed method was
  followed directly: actual call paths were read in source before implementation,
  and the change is one small readable module with focused tests.

## Source traced before implementation

- `services/ai/targeted_enrichment.py`: `verify_enrichment_identity`,
  `is_official_issuer_url`, `ALLOWED_ENRICHMENT_FIELDS`, evidence/provenance
  rules in `_field_has_strong_official_provenance` and `_validate_captured_item`,
  and the existing request planner. The helper reuses the frozen identity and
  URL-officialness functions rather than duplicating them.
- `services/ai/repair_clients.py`: `GeminiRepairSearch.discover_for_request`
  consumes a request/prompt and returns unproven candidates; capture and quote
  matching remain the evidence gate.
- `services/ai/autonomous_pipeline.py`: `review_and_repair`, the pre-extraction
  research step around the targeted enrichment call, `ReviewFinding`, and
  acceptance handling. Research is bounded and cannot publish.
- `services/ai/schema.py`: `Post` field names, used as the only source of
  allowed post field paths.
- `services/ai/verify_bundle.py`: identity extraction, `official_host_candidate`
  authority marker, and `conflicting_*`/`ambiguous_*` review reasons.
- `services/ai/extract_bundle.py`: `facts.posts`, `facts.evidence`
  (`field_path`, `evidence_id`, `quote`) and `facts.missing_fields`
  (`field_path`, `reason`).

## What changed

`build_research_gap_prompt(facts, source_input, *, review_findings=None,
requested_fields=None, issuer_hosts=None)` returns a structured, deterministic
prompt plan:

- `blocked` with a reason when notice identity is missing, ambiguous or
  conflicting; no prompt is built and no facts are guessed.
- `supported_facts`: only values whose citation quote is located in a supplied
  official section with locations. Unlocated quotes, non-official documents and
  null values are never promoted.
- `gaps`: supplied `missing_fields`, review findings with status `missing`,
  `needs_enrichment` or `suspicious`, and explicitly requested unresolved fields.
  Requested bare field names are expanded per post; unknown or non-researchable
  paths are ignored rather than invented.
- `conflicts`: review findings with status `conflicting`, preserved explicitly.
  They are never silently resolved.
- `official_urls`: only HTTPS, credential-free URLs from documents already
  marked `official_host_candidate`; when `issuer_hosts` is supplied they are
  revalidated with the existing `is_official_issuer_url` helper.
- `prompt`: a focused instruction block containing the verified identity, the
  permitted official URLs, already-supported facts as context, the unresolved
  gaps and conflicts, and explicit rules: exact quotation plus locator, no
  defaults or inference, no cross-post copying, no third-party citations, and
  unresolved is an acceptable outcome.
- No gaps or conflicts returns `complete` with `prompt=None`.

The helper performs no provider, network, filesystem or database operation and
does not mutate its inputs. It is preparation for coordinator integration, not a
replacement for the existing bounded search, capture, quote-location and review
gates.

## Verification

Commands and actual results:

```bash
# focused suite, miniconda Python 3.14.7 with dependencies
cd services/ai
/opt/homebrew/Caskroom/miniconda/base/bin/python3 \
  -m unittest tests.test_research_gap_prompt -q
# Ran 7 tests ... OK

# full offline Python suite, existing project virtualenv used read-only
PYTHONPATH=services/ai \
  /Users/mrblackghost/Work/Projects/aptus/services/ai/.venv/bin/python \
  -m unittest discover -s services/ai/tests -q
# Ran 492 tests ... OK

git diff --check
# clean
```

The full-suite interpreter was an existing project virtualenv outside this
worktree, used read-only because the local `.venv` had not been created. No
files were written to it or to any other worktree. The local
`/opt/homebrew/bin/python3` lacks `pydantic`, so it was not used. No live
provider, database, browser, deployment or production check was run.

Focused coverage:

1. verified identity, supported facts, official URL filtering, gap and conflict
2. unlocated quotes and unofficial documents are not supported facts
3. missing/ambiguous identity blocks without a prompt
4. requested fields are post-scoped and skip supported values
5. unknown and non-researchable fields are not invented
6. issuer-host revalidation can exclude an `official_host_candidate` document
7. inputs are not mutated and output is deterministic

## Commit

- `07072b5` — `feat(worker): build focused research gap prompts`
  (helper and focused tests)

## Design rationale

- Reuse `verify_enrichment_identity` and `is_official_issuer_url` so the research
  lane cannot drift from the frozen identity/official-host semantics.
- Keep the prompt provider-agnostic. The coordinator can pass it to the existing
  search provider; the helper itself cannot spend tokens or call out.
- Keep factual uncertainty explicit: only located official quotes become
  "supported"; everything else is a gap or conflict. This mirrors the project
  rule that null/unknown must not become eligibility or a guessed default.
- Restrict researchable post paths to `Post` field names and the existing
  `ALLOWED_ENRICHMENT_FIELDS`; unknown paths are dropped instead of being sent to
  a search provider as invented questions.

## Limitations

- Not wired into `autonomous_pipeline.py` or `generic_pipeline.py`; the
  coordinator owns integration.
- The helper does not discover URLs, capture pages, verify quotes against newly
  captured text, or decide eligibility. Those existing gates remain mandatory.
- A prompt can be built with no supplied official URLs; the prompt then says so
  explicitly. Any later discovery path must still pass the existing official
  issuer/host and quote-location checks before a fact is accepted.
- Review findings outside the researchable field set (for example `post_name`)
  are intentionally not researched and remain the runtime review's concern.
- No live research accuracy, recall, latency or token-budget measurement was
  performed.

## Confirmed risks

| Risk | Likelihood | Impact | Evidence |
| --- | --- | --- | --- |
| Prompt size grows with every gap/post because supported facts, gaps and conflicts are uncapped | 3 | 2 | `_build_prompt` iterates all items; `ALLOWED_ENRICHMENT_FIELDS` is 13 fields but post count is source-dependent. Coordinator should cap or batch before a provider call. |
| `official_host_candidate` is trusted when `issuer_hosts` is not supplied | 3 | 6 | `verify_bundle.py` sets that marker using the configured issuer hosts; the helper revalidates only when `issuer_hosts` is passed. Integration should pass the same map. |
| Empty `official_urls` still yields a ready prompt | 4 | 5 | Test 6 shows `status="ready"` with an explicit "None supplied" instruction. Acceptable only if the downstream search/capture path enforces official-host evidence; otherwise the coordinator should block. |
| Gaps are limited to supplied missing/review/requested fields; a null post field with no explanation is not auto-added | 5 | 3 | `_add_gap` call sites. By design: the caller/extraction contract owns null explanation, and guessed gaps would risk inventing research targets. |
| Conflicts are preserved but not resolved by this helper | 1 | 2 | Conflict entries are copied into the prompt; resolution still requires captured official evidence and review. No unsafe fallback exists in this module. |

No contract blocker was found. This lane makes no shared semantic change and
requires no contract revision; it is an additive helper awaiting coordinator
wiring and review.
