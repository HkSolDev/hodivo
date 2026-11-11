# HTML-first team batch 1

Baseline: 3d03bbb. Coordinator: Codex. All five writers use separate worktrees.
Read HTML_FIRST_WORKER_PLAN.md, HTML_FIRST_WORKER_HANDOFF.md,
AGENT_CONTRACT_PROTOCOL.md and contracts/README.md. Use Graphify and Ponytail.

Frozen initial assignment: inspect the assigned boundary and implement only a
small standalone helper plus meaningful offline tests within the owned NEW files
below. Existing runtime files and protected schemas/contracts are coordinator-only
until integration interfaces are reviewed. Do not edit dependencies, production,
credentials, other worktrees or shared tests. No nested agents. No push/deploy.
Each agent must trace actual source before implementation and may report a
contract blocker instead of guessing. Report paths, tests, design rationale,
limitations and confirmed risks with likelihood/impact/evidence. Commit only
owned paths. Reports belong in docs/agent-reports/<lane>.md.

| Lane        | Model                                | Owned new helper and tests                                                                                              |
| ----------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| capture     | AGY gemini-4-argon-low               | services/ai/html_first_capture.py; services/ai/tests/test_html_first_capture.py                                         |
| tools       | OpenCode opencode/glm-5.3-flash-free | services/ai/evidence_tool_contract.py; services/ai/tests/test_evidence_tool_contract.py                                 |
| research    | OpenCode deepseek/deepseek-flash     | services/ai/research_gap_prompt.py; services/ai/tests/test_research_gap_prompt.py                                       |
| enrichment  | OpenCode xai/grok-4.7                | docs/agent-reports/enrichment.md only: propose exact additive contract and existing producer/consumer paths before code |
| publication | AGY claude-sonnet-5-5-low            | services/ai/public_notice_identity.py; services/ai/tests/test_public_notice_identity.py                                 |

Capture helper: preserve usable HTML/PDF tool results on failures; dependency-
injected bounded retrieval, no provider/network, no alternate full pipeline.
Tools helper: validate read_notice arguments against known official URLs and
existing schema field paths; no arbitrary execution, no invented evidence shape.
Research helper: exact notice identity, supported facts, gaps/conflicts and known
official URLs into focused research prompt; no guessed facts, no provider calls.
Publication helper: clean portal branding while retaining issuer/exam acronyms;
select public notice/apply links only from supplied verified associations, no
discovery fallback. Follow actual existing URL validation helpers.

These helpers are preparation for coordinated runtime integration, not a claim
of complete implementation. Coordinator owns wiring after review. All Gemini
3.8 Flash High reviewer sessions are read-only and never modify files. Schedule
one reviewer per lane once its diff/report is available; assess actual production
risk and return findings to its implementer until resolved. Record actual models,
failures and fallback assignments. User authorises other working implementers,
including Claude Sonnet Low; reviewer remains Gemini 3.8 Flash High.

## Coordinator takeover — 11 November 2026

Hemant explicitly assigned implementation to Codex. No new implementer agents
are running under this takeover. Work remains on `codex/html-first-worker-plan`
in `/Users/mrblackghost/Work/Projects/aptus-html-first-worker`; the original dirty
checkout is preserved. Integrated tools commit a8fa4f6 and research commits
07072b5/5be2867. Their reports describe offline work, not live verification.

Current slice: opt-in conditional capture, bounded pre-extraction evidence
recovery, durable checkpoint, and Hemant's Colab research prompt adaptation.
Existing extraction, storage, eligibility and publication contracts are unchanged.
`read_notice` uses exact known official HTTPS URLs, default HTTPS port, existing
post-relative schema fields, and at most two distinct retrieval attempts. Gemini
can request a read; Python validates and executes it. A fresh reassessment sees
usable evidence and failure outcomes, then one research round may discover at
most three additional issuer URLs. Captures must independently match issuer,
advertisement/exam and year before contributing evidence. No search prose is
inserted as source evidence. Existing OCR/Vision recovery is reused when supplied.

Evidence checkpoints reuse the existing checksum/lease mechanism with an internal
`evidence` stage. Unknown completion after a crash does not repeat paid work.
A completed evidence round (including partial outcomes) is reused for unchanged
input; changed source or model identity creates a new version. The worker's later
research is disabled when pre-extraction research consumed this notice's round.
No contract/golden-fixture changes or production operations are included.

Remaining before rollout: PDF-only listing children need a bounded identity
bootstrap; enrichment needs the explicit producer/storage/API/UI contract;
public title and official-action-link mapping still needs implementation;
real-notice baseline comparison and provider smoke checks are not yet run.
The flag remains off by default. New paths do not establish deployment readiness.

### Coordinator verification

Exact command (offline, fake provider transports; no `.env` loading):

```sh
PYTHONPATH=services/ai:services/ai/tests /Users/mrblackghost/Work/Projects/aptus-hf-tools/services/ai/.venv/bin/python -m unittest discover -s services/ai/tests -q
```

Result: 520 tests passed. `git diff --check` passed. Changed Markdown formatted
with the existing project's Prettier. Worker `--help` exposes the trial flag;
no worker processing run was started. Graphify AST refreshed to 3,793 nodes and
7,360 edges; 19 SQL files are unindexed because tree_sitter_sql is unavailable.
No dependency was added. Independent Gemini review remains unrun.

Confirmed inherited findings fixed in this slice: tool URL matching ignored
ports (likelihood 4, impact 5, risk 20; alternate-port URL was accepted as the
known endpoint), and research instructions prohibited discovering additional
official URLs (likelihood 8, impact 6, risk 48; every gap needing a new official
page was instructed to remain unresolved). Focused regressions cover both.
No speculative cleanup/refactor was included.
