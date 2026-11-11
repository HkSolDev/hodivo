# HTML-first worker branch handoff

Branch: `codex/html-first-worker-plan`.
Base: `d49189c7504e5577541c822dc5c5eb91ebf3f30c` (main fetched 11 November 2026).
Read [the staged plan](HTML_FIRST_WORKER_PLAN.md) first.

## Current state

Implementation in progress. The opt-in worker path has local changes; default
provider settings, database schemas and production services are unchanged. Graphify index is local/generated, not committed.
Hemant's additional requirements are recorded in plan slice 7: category cutoffs
for three completed exam cycles, official syllabus, recommended free YouTube
resources, and compact base age limits. Freeze their additive data contract
before assigning implementation writers.

Plan slice 8 adds official-only public notice/application destinations and job
titles without discovery-site branding. Retain third-party discovery provenance
internally and preserve real recruiting-body/exam acronyms. Include existing
published records in the audit; production backfill is a separate previewed step.

PDF/OCR/Vision is explicitly best-effort: preserve partial evidence and continue
to internet research on failure. A PDF failure must not abort the notice. The
combined evidence still needs the existing validation/review gates to publish.

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

## Coordinator implementation in progress

Use the stable worktree `/Users/mrblackghost/Work/Projects/aptus-html-first-worker`
and branch `codex/html-first-worker-plan`. The shared Colab-inspired prompt lives
in `services/ai/research_gap_prompt.py`; the preparation extension is opt-in and
has no new storage/API fields yet. `html_first_evidence.py` performs bounded,
best-effort recovery and `html_first_checkpoint.py` saves it before extraction.
The worker exposes `--html-first --issuer-hosts /path/to/issuer-hosts.json` for
explicit trials; ordinary runs retain existing behavior. The hosts JSON maps
exact issuer names to allowed public hostnames, e.g. illustrative test data:
`{"Example Board": ["example.gov.in"]}`. Do not infer issuer authority from a
third-party discovery host. Search task settings remain the existing
`SEARCH_PROVIDER` / `SEARCH_MODEL` (or Gemini-specific model setting).

No live trial, deployment, database mutation or rollout is claimed. See the
coordination record for open slices and verification results.

## Combined worker and SEO takeover — 11 November 2026

Hemant assigned both lanes to Codex. Existing uncommitted SEO changes are
preserved. The two reviewed SEO fixes now normalize default-sort/display query
parameters for clean pagination metadata and return a server error on job-detail
backend outages instead of HTTP 200/noindex. Production-build HTTP/browser tests
verified real-job 200, missing-job 404 and outage 500. No deployment occurred.

Worker regression reproduced PDF-only listing loss (old: two bundles; HTML-first:
zero). Direct listing document children now use existing bounded capture; linked
PDFs on notice HTML remain deferred. An offline four-case capture comparison is
in test_html_first_baseline.py. IIIT uses saved public PDF text with checksums,
reconstructed into a test PDF; this does not test original layout or OCR. Other
cases are synthetic complete HTML, a two-notice listing, and corrupt PDF. This is
only capture comparison, not completion of the real scanned-notice or end-to-end
baseline. IIIT year resolution remains incomplete in this fixture.

Transient research timeout regression failed before the fix. Evidence now retains
successful assessment/search/Vision calls in separate checksum-verified stage
checkpoints; retryable failures use bounded StageRetries backoff. Existing successful evidence fingerprints are preserved. Legacy saved failure
reports are held for review rather than blindly replaying paid calls. Unknown
provider completion and corrupt checkpoints remain blocked. This does not yet
prove partial capture reuse or every provider failure mapping.

Verified before the final legacy-record/Vision wrapper adjustment: 522 Python
tests, 6 SEO unit tests, production build, 8 frontend integration/browser tests,
TypeScript checks and lint passed. Rerun relevant tests after further edits.
Remaining: five assessment states, scanned-PDF identity/Vision ordering, complete
provider accounting/budgets, full real-notice baseline and publication retry
acceptance, enrichment contract/storage/API/UI, official-link/title consumers.
No push, merge, live provider call, DB write or deployment is authorized by this
record. The HTML-first flag remains opt-in.
