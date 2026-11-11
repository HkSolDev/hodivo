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

| Lane | Model | Owned new helper and tests |
| --- | --- | --- |
| capture | AGY gemini-4-argon-low | services/ai/html_first_capture.py; services/ai/tests/test_html_first_capture.py |
| tools | OpenCode opencode/glm-5.3-flash-free | services/ai/evidence_tool_contract.py; services/ai/tests/test_evidence_tool_contract.py |
| research | OpenCode deepseek/deepseek-flash | services/ai/research_gap_prompt.py; services/ai/tests/test_research_gap_prompt.py |
| enrichment | OpenCode xai/grok-4.7 | docs/agent-reports/enrichment.md only: propose exact additive contract and existing producer/consumer paths before code |
| publication | AGY claude-sonnet-5-5-low | services/ai/public_notice_identity.py; services/ai/tests/test_public_notice_identity.py |

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
