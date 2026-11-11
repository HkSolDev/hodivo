# HTML-first worker branch handoff

Branch: `codex/html-first-worker-plan`.
Base: `d49189c7504e5577541c822dc5c5eb91ebf3f30c` (main fetched 11 November 2026).
Read [the staged plan](HTML_FIRST_WORKER_PLAN.md) first.

## Current state

Planning only. No worker behavior, provider settings, database schema or production
service changed on this branch. Graphify index is local/generated, not committed.
Hemant's additional requirements are recorded in plan slice 7: category cutoffs
for three completed exam cycles, official syllabus, recommended free YouTube
resources, and compact base age limits. Freeze their additive data contract
before assigning implementation writers.

## Start here

1. Verify branch, HEAD and working changes. Read project instructions,
   `CODING_STANDARD.md`, `AGENT_CONTRACT_PROTOCOL.md`, and `contracts/README.md`.
2. Read the plan and inspect the actual call paths it names. Rebuild Graphify's
   code-only index in your own worktree; do not trust another branch's index.
3. Complete baseline fixtures and measurements (slice 1) before changing runtime.
4. Implement one small slice at a time. Keep existing extraction, evidence,
   review and ingestion contracts unless Hemant approves a recorded revision.

## If the coordinator assigns multiple agents

This document is a proposed allocation, not a frozen batch or agent launch.
First create a batch record with exact owned paths, baseline, tool contract,
acceptance cases and commands. Each writer needs its own branch/worktree.

- Capture lane: HTML discovery, deferred PDF retrieval and saved-state reuse.
- Tool lane: Gemini evidence assessment and validated PDF tool requests; begin
  after the coordinator freezes the capture/tool boundary.
- Verification lane: independent fixtures, expected facts and checks; initially
  read-only, with test edits assigned explicitly.
- Coordinator: integrates slices, owns `generic_pipeline.py` wiring and shared
  contract decisions. Avoid concurrent writers in this central module.

Research integration depends on the tool/evidence boundary; DeepSeek and
publication wiring follow that integration. These are not independent parallel
tasks. Do not invent extra lanes just to use available agents.

## Delivery expectations

Report exact commits, changed paths, actual checks and remaining gaps. Offline
checks must not call providers or production. Live provider trials and deployment
are separate operations. Preserve retirement markers, immutable draft approvals,
receipts, retry budgets, source evidence and unknown values.

Syllabus, category cutoffs and YouTube enrichment are in scope as slice 7 after
the core evidence path. They need explicit persistence/API/UI lineage and must
not block valid job publication when unavailable. Compact age presentation must
preserve the detailed rules used by eligibility matching.
