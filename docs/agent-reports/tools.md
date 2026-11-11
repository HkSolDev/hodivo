# HTML-first batch 1 — tools lane report

Agent: tools lane (OpenCode opencode/glm-5.3-flash-free). Worktree:
`/Users/mrblackghost/Work/Projects/aptus-hf-tools`, branch `codex/hf-tools`.
Baseline: coordination doc names 3d03bbb; this worktree HEAD is e9541e7
(3d03bbb plus one coordinator docs-only commit "freeze isolated agent team
assignments"). Working tree was clean before my changes; no existing runtime
file was modified.

## Scope compliance

- Owned paths only: `services/ai/evidence_tool_contract.py` (new),
  `services/ai/tests/test_evidence_tool_contract.py` (new), this report.
- No changes to runtime files, contracts, fixtures, CI, dependencies or other
  worktrees. No provider calls, network fetches, production access, push or
  deploy. The venv under `services/ai/.venv` is a fresh local venv (gitignored),
  created because this worktree had none; no shared/symlinked venv.
- Graphify and Ponytail skills are not installed in this environment; per the
  coding standard I traced source manually instead and state it here.

## Source tracing (manual, evidence)

- Existing URL validation: `targeted_enrichment.py:is_official_issuer_url`
  (https only, hostname required, no userinfo) and
  `verify_bundle.py:describe_document` (same URL constraints). My
  `parse_official_url` mirrors those exact constraints.
- Existing schema field paths: `compact_inline.py:field_catalogue` produces the
  canonical allowed path list (post-relative, `<index>` array placeholders, 62
  paths for `build_extraction_input.BundleFacts`). Index matching follows
  `extract_bundle.py:FactDecodingError` (`<index>` → `(?:0|[1-9]\d*)`,
  rejecting `00`, `-1`).
- Reason-code style: fixed codes with no echoed model values, matching
  `FactDecodingError` ("never response values").

## Design and rationale

The module validates one requested `read_notice` tool call and nothing else:
`validate_read_notice_request(tool_name, arguments, *, known_urls,
field_paths)` returns `(accepted, reason, payload)`.

- Tool name must be exactly `read_notice`; anything else → `unknown_tool`.
- Arguments must be a dict with exactly `document_url` and `fields`
  (extra/missing keys → `invalid_arguments`), mirroring the `extra="forbid"`
  spirit of `services/ai/schema.py`.
- `document_url` must be absolute credential-free https AND exactly match one
  of the supplied known official URLs (scheme/hostname-casefold/path/query/
  fragment comparison). Same-host-different-path, added query strings, http,
  credentials → `invalid_document_url` / `unrelated_document_url`. Known URLs
  are supplied by the capture runtime (dependency-injected; no discovery or
  fetch here). A malformed entry in the injected known list raises
  `ValueError` — a wiring bug, distinct from a bad model request.
- `fields` must be a nonempty list of unique strings, each full-matching a
  catalogue path with concrete indices; `duplicate_field` /
  `unknown_field_path` (fixed code only, no echo). The accepted payload is
  exactly `{tool, document_url, fields}` — no tool-result or evidence shape is
  defined; that stays with the retrieval runtime per the assignment.

Why post-relative field paths: the existing `field_catalogue` list is the
canonical allowed-path grammar (it is what `decode_compact` and
`FactDecodingError` validate against). I did not invent a `posts.<index>.`
tool-request convention; the runtime wiring can map accepted post-relative
fields onto full evidence `field_path`s when recording results. This boundary
needs coordinator review during slice-3 wiring (see risks).

## Verification (actual commands, offline)

- `PYTHONPATH=services/ai services/ai/.venv/bin/python -m unittest
services.ai.tests.test_evidence_tool_contract -v` → 14 tests OK.
- Full offline suite `... -m unittest discover -s services/ai/tests -q` →
  499 tests OK (includes existing suites; the JSON in the output is a test's
  own substituted fixture, not a live run).
- Not run: provider/live checks (forbidden here), TypeScript suites
  (unaffected), contract suites (unaffected; no protected bytes touched).

## Risks and limitations

1. Field-path convention (post-relative vs `posts.<index>.` full paths) is my
   reading of the existing catalogue grammar; likelihood of needing a mapping
   at wiring time: medium. Impact: low (pure mapping, no semantics). Evidence:
   catalogue output vs `posts.0.min_age` paths in `check_evidence`.
2. The validator does not enforce budgets (two documents per notice, repeated-
   call limits). That is runtime state the coordinator owns; this module only
   validates single requests. Likelihood of duplicate paid work if wiring
   forgets budgeting: medium; impact: medium (paid calls).
3. Known-URL equality is exact-component match; a redirected canonical URL
   (e.g. trailing-slash variant) would be rejected and surface as
   `unrelated_document_url` rather than silently accepted. Likelihood: low;
   impact: low (fail-closed, visible reason).
4. No implementation of the Gemini function-declaration side; the provider
   declaration of `read_notice` arguments is coordinator wiring, not authored
   here.
