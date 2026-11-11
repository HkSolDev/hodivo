# HTML-first worker implementation plan

Status: proposed implementation sequence; no runtime behavior changed.
Baseline: origin/main d49189c7504e5577541c822dc5c5eb91ebf3f30c.
Branch: codex/html-first-worker-plan.

## Goal

Capture HTML first. Let Gemini request missing official evidence through bounded
tools. Reuse PDF text extraction and selective OCR/Vision only when needed.
Research unresolved fields with Google Search, then let DeepSeek produce the
existing candidate JSON. Preserve deterministic validation, review, retirement,
retry and publication behavior.

## Verified existing path

Graphify code-only index: 2,910 nodes, 6,334 edges. Source inspection confirmed:

- `shared_pipeline.py:prepare_source` calls `shared_crawl.py:crawl_source`,
  verifies bundles and prepares extraction inputs before AI extraction.
- `recover_documents.py:capture_and_normalize` normalizes PDFs during capture;
  PDF selection already exists in `select_pdf_sections.py`.
- `generic_pipeline.py:run_pipeline` owns saved notice reuse, retirement,
  selective Vision recovery, extraction, review and publication decisions.
- `autonomous_pipeline.py:review_and_repair` already performs bounded research
  after review findings; `evaluate_automated_acceptance` owns publication gates.
- `repair_clients.py` provides Gemini search and official source capture.
  Search quotations must match independently captured text; a prose response
  alone cannot satisfy the existing evidence contract.
- `providers/gemini.py` provides structured requests, search discovery and image
  recovery. Existing search and JSON structuring use separate requests.

The current crawler is not a lazy PDF tool: it captures/normalizes documents
before the proposed Gemini evidence-planning stage. Existing fingerprints skip
unchanged extraction, but do not prove all document processing is skipped early.

## Proposed flow

HTML capture → notice identity and saved-state check → Gemini evidence assessment
→ requested official PDF text → selective OCR/Vision if unreadable
→ Google Search for remaining gaps → captured evidence bundle
→ DeepSeek structured extraction → deterministic validation → Gemini review
→ existing bounded repair and acceptance → existing internal ingestion.

Tool means a Gemini function request executed by our Python code. Google Search
is a separate provider operation. Python owns allowed URLs, budgets, cache,
timeouts, evidence persistence and stop conditions; model output cannot publish.

## Implementation slices and acceptance checks

### 1. Establish a reproducible baseline

Use saved IIIT Pune JRF, one complete HTML notice, one listing with several
notices, and one scanned/poor-text notice. Record output facts, evidence coverage,
PDF fetches/pages, provider calls/tokens where available and elapsed time.
Keep publication disabled for the comparison. Existing tests are the starting
point: `test_generic_pipeline.py`, `test_source_transport_acceptance.py`,
`test_notice_state.py`, and `test_evidence_gate_acceptance.py`.

Done when each fixture has a known identity and expected evidence-backed facts;
no live database writes are required. One successful JRF example is insufficient
to claim general accuracy or cost savings.

### 2. Make document capture conditional

Extend `shared_crawl.py` and `shared_pipeline.py` with an opt-in HTML-first path.
Retain linked PDF URLs and surrounding link text without normalizing them yet.
Separate listing pages from individual notices and bind each child to its notice.
Reuse `NoticeStateManager` and saved captures; preserve changed-version handling,
retirements and receipts. A changed HTML fingerprint must not accidentally hide
an amendment or a newer linked notice.

Done when complete HTML causes zero PDF parsing, listing children stay separate,
and unchanged saved evidence causes zero paid extraction calls. Extend existing
crawl, grouping and notice-state tests rather than duplicating them.

### 3. Add Gemini assessment and the PDF tool

Add one small evidence-planning module beside the current pipeline. Input:
captured HTML evidence, exact notice identity, known official links and existing
schema field paths. Output: supported fields, unresolved fields and bounded tool
requests. Missing, explicitly unstated, conflicting and unreadable are distinct.

Expose a narrow `read_notice` tool through the existing Gemini REST provider.
Arguments: known document URL and requested schema fields. Reuse capture,
normalization and section selection; return evidence IDs, text and page locators.
Reject unknown tools, invalid fields, unrelated/private URLs and repeated calls.
Treat document text as data, never as tool-execution instructions.

Initial budget: at most two distinct linked official documents per notice;
reuse existing PDF/Vision page caps. Persist tool requests/results for resume.
Gemini may request a tool, but code validates and executes it.

Done when incomplete HTML requests the appropriate PDF once, complete HTML skips
it, and malformed/repeated requests terminate without bypassing validation.

### 4. Recover unreadable pages, then research remaining gaps

Reuse `vision_recovery.py:recover_unreadable_pdf_pages` for relevant unreadable
pages. Reassess remaining gaps after new evidence. Use the configured search
provider through `GeminiRepairSearch`; improve the existing path so discovery
selects official documents and quotations are derived from captured content.
Preserve grounding metadata and resolve source identity before accepting facts.

Initial budget: one pre-extraction search recovery round. Existing later repair
limits share a per-notice budget so retries cannot multiply paid work. Search
failure preserves progress and records a retryable reason. Unstated optional
fields remain null; conflicts stay explicit.

Done when unreadable pages use selective recovery, search adds verifiable source
evidence, unrelated notices are rejected, and exhausted budgets produce a saved
review/retry outcome. Extend existing Vision, enrichment and repair tests.

### 5. Structure, validate and review

Pass the resulting canonical evidence bundle into existing `extract_bundle.py`
using the configured DeepSeek extraction provider. DeepSeek structures facts;
it does not independently establish factual correctness. Reuse existing schema,
citations, numeric/date checks and `review_and_repair`. Persist the review report.
Keep preparation enrichment in its own structured section, implemented in slice 7.

Done when equivalent HTML/PDF evidence produces the same candidate semantics,
unknowns remain null, unsupported claims fail, and retries reuse checkpoints.
Extend stage-5, generic pipeline and evidence acceptance tests.

### 6. Connect publication and evaluate rollout

Use existing acceptance and ingestion only after validation/review pass. Preserve
byte-keyed retirements, approvals/receipts, duplicate protection and delivery retry
without re-extraction. Run the fixed fixture comparison, then a bounded live
provider trial producing drafts only. Compare correctness, completeness, latency
and measured provider usage against slice 1 before enabling the new path.

Done when supported candidates reach existing ingestion, unsupported/conflicting
ones are held, retired drafts make zero AI calls and retrying delivery creates
no duplicate job. Deployment and production activation are separate operations.

### 7. Category cutoffs, syllabus, free videos and compact age display

Requested by Hemant on 11 November 2026; included in branch scope. Implement
after the core evidence path, with explicit producer/storage/API/UI mappings.
Use Graphify to trace those consumers before assigning paths or changing schemas.

- Historical cutoffs: collect the last three completed exam cycles with published
  official cutoffs. Store cycle/year, exam identity, stage/paper, post/region where
  applicable, category, cutoff number, maximum marks/score scale when stated,
  official source and publication/correction date. Preserve separate SC, ST,
  OBC, EWS, UR and other officially reported categories. Do not combine different
  stages or invent unavailable years; distinguish not applicable, not published,
  not found and a genuine numeric zero. Label results as historical, not a
  prediction of this year's qualifying score. Prefer corrected official tables.
- Syllabus: collect the official syllabus for the exact exam cycle and stage,
  with subjects/topics, paper structure and official evidence. Where an issuer
  explicitly reuses an older syllabus, preserve that reference. For interview-only
  project jobs, distinguish officially stated research topics from suggested
  preparation; do not label inferred topics as an official examination syllabus.
- Free YouTube resources: search for actual accessible video/playlist URLs mapped
  to syllabus topics. Store title, channel, language, URL, covered topics and a
  short recommendation reason. Rank a small useful set by topic coverage,
  clarity, relevance and free accessibility; identify the recommended starting
  resource as our recommendation. Never fabricate titles/links or declare a
  universal 'best'. Verify links and retain checked-at dates; generic search
  suggestions without actual video URLs do not count as collected resources.
- Age display: show the source-backed base minimum and maximum compactly, e.g.
  '18–35 years', with a short note that applicable category relaxations are
  detailed in the official notice. Do not show the outer envelope across all
  categories or invent 18 as a missing minimum. Show one-sided limits honestly
  ('Up to 35 years') and missing limits as 'Not specified'. Keep post-specific
  limits separate. Preserve age-as-on dates and existing detailed relaxation
  rules for deterministic eligibility matching. Display simplification does not
  remove those underlying facts, and the note must not imply every job grants
  government/category relaxation.

Run research once per exam/cycle and cache shared syllabus/cutoffs/resources
across its posts. Keep preparation research under a separately bounded budget;
missing optional enrichment must not prevent publication of an otherwise valid
job. A failed enrichment request must not repeat paid core extraction.

Done when category/stage/year distinctions survive Python → storage → API → UI,
unavailable cutoffs remain explicit, syllabus provenance is displayed, recommended
videos have verified URLs, and age cards show the base range without changing
matching results. Include fixtures for a multi-stage exam, missing historical
year, interview-only JRF, category relaxation and a missing minimum age.

### 8. Official public links and clean job titles

Requested by Hemant: discovery may start on Sarkari Result, FreeJobAlert or other
third-party pages, but public source/notice and apply actions must lead to verified
official destinations. Preserve discovery URLs internally for provenance only.

- Model the discovery page, official notice, official organisation website and
  application destination separately. Never silently use the discovery URL when
  an official notice or apply URL is unavailable; show that action as unavailable.
- Verify that the notice belongs to the exact issuer, advertisement and cycle.
  Prefer the official PDF or complete official notice HTML as the visible source.
  A third-party mirror is not an official notice destination.
- An application destination may be an external recruitment platform or Google
  Form explicitly linked by the issuer. Verify that association from official
  evidence; a government-domain suffix is not the only acceptance criterion.
- Resolve/validate destinations through existing safe capture behavior; reject
  unrelated links and unsafe URLs. Retain verification evidence and checked dates.
- Job titles contain the real post/exam identity, without discovery-portal
  branding, SEO suffixes, promotional text or scraped navigation. Do not blindly
  remove acronyms: JKSSB/other recruiting bodies and IES/other exam names remain
  when they are genuine official identity. Portal names are removed when used as
  branding rather than being part of the official role or organisation.
- Audit both source/action links and title consumers across candidate mapping,
  ingestion, public list/detail API, cards, detail pages and saved jobs. Check
  legacy published records as well as new extraction. Plan a previewable backfill
  with evidence and counts before any production update; do not rewrite existing
  rows automatically as part of this documentation task.

Done when a job discovered on a third-party page displays only the verified
official notice and issuer-authorised application link, missing official links
never fall back to the portal, and title cleanup removes portal branding while
preserving genuine exam/recruiter identity. Extend existing source-link, job-card,
detail and publication tests for these cases.

## Contract and scope boundaries

Preserve existing schema semantics for slices 1–6. Slice 7 requires an additive
contract design for enrichment across extraction/storage/API/UI; slice 8 needs
explicit discovery-versus-public-link mappings. Document their
exact fields and compatibility before implementing changes. Document and review the
new internal tool request/result contract before slice 3. Any change to shared
evidence or acceptance semantics requires an explicit contract revision. Use no
new agent framework or dependencies. Implement one slice at a time and inspect
its diff and relevant behavioral checks before starting the next.

## Verification limits

This planning pass inspected current-main source and built a local AST graph;
it did not run provider calls, modify the worker, deploy or publish jobs. Graphify
reported missing SQL parsing support; Python call-path findings were checked in
source. No runtime tests are claimed for this documentation-only change.
