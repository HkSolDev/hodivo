# HTML-first worker implementation plan

Status: implementation in progress on the isolated branch; opt-in path only.
Production has not changed. The acceptance gates below remain required.
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

PDF recovery is best-effort and must not stop the research path. A failed fetch,
unrecognised format, parsing error, unreadable page or OCR/Vision failure records
the specific outcome and preserves every usable HTML/PDF evidence unit already
collected. Continue to the combined-evidence assessment and internet recovery
instead of aborting the notice or waiting for PDF success. Never represent a
partial document as completely read. Independent failures such as invalid notice
identity still retain their own validation rules.

Done when incomplete HTML requests the appropriate PDF once, complete HTML skips
it, and malformed/repeated requests terminate without bypassing validation.

### 4. Recover unreadable pages, then research remaining gaps

Reuse `vision_recovery.py:recover_unreadable_pdf_pages` for relevant unreadable
pages. Reassess remaining gaps after new evidence. Use the configured search
provider through `GeminiRepairSearch`; improve the existing path so discovery
selects official documents and quotations are derived from captured content.
Preserve grounding metadata and resolve source identity before accepting facts.

Gemini reassesses the union of usable HTML, PDF and OCR/Vision evidence, including
partial PDF results. Build the research prompt from the exact notice identity,
known official links, supported facts, conflicts and remaining field paths.
Internet research can supply fields absent from both HTML and PDF; PDF success
is not a prerequisite. Combine accepted research evidence with the saved evidence
before DeepSeek extraction. Search answers must retain verifiable sources;
unsourced prose cannot become a supported fact merely by being structured.

Initial budget: one pre-extraction search recovery round. Existing later repair
limits share a per-notice budget so retries cannot multiply paid work. Search
failure preserves progress and records a retryable reason. Unstated optional
fields remain null; conflicts stay explicit.

Done when unreadable pages use selective recovery, search adds verifiable source
evidence, unrelated notices are rejected, and exhausted budgets produce a saved
review/retry outcome. Extend existing Vision, enrichment and repair tests.

Required regression cases: PDF download fails but official web research completes
the job; PDF parsing fails but HTML is sufficient; partial PDF/OCR evidence is
retained and research fills only remaining gaps; all retrieval paths fail and the
candidate is saved with unresolved reasons rather than published. Verify no PDF
failure alone prevents reaching research or discards earlier evidence.

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

## Original planning-pass verification limits

The original planning pass inspected current-main source and built a local AST graph;
it did not run provider calls, modify the worker, deploy or publish jobs. Graphify
reported missing SQL parsing support; Python call-path findings were checked in
source. No runtime tests are claimed for this documentation-only change.

## Research prompt baseline: approved Colab example

Hemant supplied the working `gemini-2.5-flash` Google Search Colab example as
our research template. Keep its detailed recruitment coverage, adapted per notice
rather than hardcoding IIIT Pune. `research_gap_prompt.py` owns the shared prompt;
`html_first_evidence.py` supplies exact identity, collected evidence, remaining
fields and known links. Gemini researches unresolved facts; DeepSeek structures
the resulting independently captured evidence. No SDK/dependency replacement is
required: the existing provider already uses the v1beta endpoint.

Core coverage: notice/issuer, posts, vacancies, dates, qualifications, examinations,
base age and separate relaxations, pay, application method/contact/documents,
selection/exclusions and explicit uncertainties. Known URLs are starting points,
not an exhaustive source allowlist: discovery may find additional official
sources; Python verifies issuer, notice identity, safe capture and exact evidence.
Never claim a failed PDF was read. Snippets alone cannot establish an omission.

Preparation is a separate optional prompt extension: category/stage/cycle cutoffs
for three completed cycles, official syllabus, labelled preparation advice and
actual verified free YouTube links with topic mapping and recommendation reasons.
Interview-only project posts must not gain fabricated exam syllabuses or cutoffs.
Missing enrichment does not block valid core publication. This prompt change does
not itself add storage/API fields or prove live provider/worker integration.

## Progress against the original plan — 11 November 2026

| Slice                  | Verified state                                                                               | Remaining acceptance work                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1. Baseline            | Existing synthetic/native-page/listing tests available                                       | Saved IIIT Pune fixture and four-case comparison measurements not completed |
| 2. Conditional capture | Opt-in deferred PDF links retain context; extensionless PDF-labelled links supported         | PDF-only listing identity bootstrap and amendment/version comparison        |
| 3. Assessment/tool     | Gemini adapter, validated reads, two-attempt bound and saved results tested offline          | Independent reviewer and real-notice trial                                  |
| 4. Recovery/research   | PDF failure reaches research; wrong issuer/advertisement rejected; partial evidence retained | Real scanned-notice OCR/Vision comparison and transient-recovery acceptance |
| 5. Structure/review    | Opt-in evidence stage reaches existing extraction; existing gates retained                   | Equivalent HTML/PDF fact comparison against known real notices              |
| 6. Publication         | Existing publication remains gated; unchanged retired legacy version skips planning          | Full new-path publication/retry acceptance and drafts-only live trial       |
| 7. Enrichment/age      | Detailed optional research prompt recorded                                                   | Additive contract, persistence/API/UI implementation and tests              |
| 8. Public identity     | Official-source requirements included in research prompt                                     | Public link/title mapping, consumer tests and backfill preview              |

Do not mark the complete pipeline finished or enable production from these unit
results. Implementation wiring has started before the full baseline comparison
was completed; that comparison remains open and required, not waived. Next
verification returns to slice 1 before broadening this candidate or rollout.

## Dependency-ordered continuation — 11 November 2026

Keep each increment independently testable; inspect its diff before the next.
Do not combine worker changes with the already committed SEO implementation.

1. **Capture baseline (current small increment).** Strengthen the existing four-case
   comparison to require the exact expected advertisement/issuer set in both modes,
   without duplicate notice bundles. Check complete HTML retains qualifications,
   ages and deadline; a failed PDF retains the HTML deadline; reconstructed IIIT
   PDF retains its JRF title and vacancy text. Touch only the existing baseline
   test and this plan. These are capture assertions, not extracted JSON accuracy.
   Next baseline increment needs authentic scanned evidence and page locators;
   synthetic corruption cannot prove OCR quality. Do not infer the missing IIIT
   identity year or fabricate facts in its HTML to make the comparison complete.
2. **Resume and accounting.** Review the saved-call/checkpoint path, extend existing
   retry tests for assessment and Vision outcomes, then trace provider accounting
   around planning and review. Reuse StageRetries and existing request tracking;
   prove completed paid work is reused and waiting retries make zero calls.
3. **Unreadable linked PDF.** Reproduce the identity-before-Vision rejection with
   the real scanned fixture. Permit bounded recovery only for a verified parent's
   direct official document link, then verify recovered notice identity before
   accepting new facts. Wrong-notice recovery stays rejected; failure proceeds
   to remaining-gap research while preserving HTML.
4. **Assessment states.** Review the internal assessment/tool contract and propose
   the five-state representation before changing provider and consumer together.
   Explicitly unstated needs source evidence; snippet absence remains missing.
   Reuse current field-path validation, tool caps and checkpoint behavior.
5. **End-to-end core proof.** Compare equivalent HTML/PDF facts through structured
   extraction and review; prove retired bytes make zero AI calls, and delivery
   retries reuse validated drafts without duplicate publication. All initial
   checks remain offline and publication-disabled. A drafts-only live trial is
   a separate authorized operation after these gates pass.
6. **Public identity and enrichment.** Trace producer/storage/API/UI consumers;
   define official notice/apply mappings and additive preparation fields through
   the contract protocol. Implement official links/title behavior first, then
   age presentation, syllabus, historical category cutoffs and verified videos
   as separate increments. Optional research must not block core publication.
7. **Release verification.** Run combined checks on the final source revision.
   Push, deploy and production activation remain separate operator steps. After
   deployment verify SEO through public HTTP responses and worker behavior through
   an observed bounded run; local tests alone do not establish deployed state.

The smallest increment adds no runtime behavior or dependencies. It closes a
confirmed verification weakness: navigation bundles previously satisfied the
baseline's nonempty assertion even if an expected notice disappeared. Remaining
baseline fidelity, runtime recovery and rollout gates are still open.

### Recovery-order increment — 11 November 2026

Confirmed bug: an unreadable linked PDF was rejected for missing standalone
identity before Vision could recover that identity. Offline regression reproduced
zero Vision calls on a directly linked official PDF with no native text.
Likelihood 7/10 for this input class, impact 6/10 (missing evidence), risk 42.

`html_first_evidence.py` now uses the existing Vision identity/link guard on a
provisional bundle before standalone verification for unreadable PDFs. Only
recovered PDF evidence is considered for addition; it must independently match
issuer, advertisement and year. Parent evidence is not rewritten. Recovery errors
remain best-effort tool outcomes and allow remaining-gap research. No acceptance,
provider, storage or publication contract changed.

Regression checks cover matching identity, wrong-notice rejection and Vision
failure continuing to research. Saved UPESSC legacy-font material remains a
third-party mirror and is rejected by the official-source gate; it was not
relabeled as official. The positive recovery test uses synthetic unreadable
content and a fake Vision response. Authentic scanned-page/image and live model
accuracy remain unverified; the full baseline gate is still open.

### Enrichment audit and smallest age increment — 11 November 2026

Existing paths: `targeted_enrichment.py` researches official syllabus and optional
historical cutoffs; `store_candidate.py` retains those candidates separately from
eligibility. The research prompt also requests free verified video resources.
These worker capabilities do not establish a complete public API/UI path:
`JobDetailContent` currently has no syllabus/cutoff/video presentation fields.
Audit the exact candidate-to-publication mapping before proposing additive shared
contracts; do not reimplement the existing research helpers.

Age details already display the stored base min/max separately from category age
rules and retain the age-as-on date. This increment changes one-sided labels to
“Up to 35 years” and “At least 18 years”, without filling missing bounds or widening
the base range to the category maximum. Existing unavailable-bound notices and
category details remain. A regression covers both bounds, each one-sided bound,
both unknown, the separate SC range and unchanged input data. No schema, matching
or ingestion semantics changed. Legacy records with incorrect stored base ages
still need evidence-backed review; display wording cannot correct source data.

Next preparation increment: trace syllabus candidate approval through publication,
storage and public API, and propose the smallest compatible mapping. Then implement
source-backed syllabus display, followed by category/cycle/stage cutoff display,
then verified video resources with actual URLs and checked dates. Preserve unknown,
not-applicable and numeric-zero distinctions; optional preparation cannot block
core publication. These are separate increments, not final release readiness.

### Storage-only preparation increment — 11 November 2026

Hemant requested database storage first, with AI collection and UI deferred.
This is the additive storage design for that scope; protected candidate schema
and extraction/eligibility/publication semantics remain unchanged.

- Existing `AutomatedNoticeRecord.officialSyllabus` and `.historicalCutoffs`
  already persist notice-level candidate JSON through autonomous ingestion.
  Historical scores remain reference-only, not eligibility marks. This increment
  verifies their existing persistence alongside resources; it does not replace
  those existing formats or complete category/cycle enrichment collection.
- Add nullable `AutomatedNoticeRecord.youtubeResources` JSONB, with an additive
  migration. No existing rows are rewritten. Existing callers may omit it.
- The authenticated autonomous-ingest envelope accepts optional `youtubeResources`:
  at most 20 entries, each containing `url`, `title`, `channel`, `language`
  (string or null), `topics` (up to 50 strings), `checkedAt` (ISO timestamp),
  and `recommendationReason` (string or null). Unknown keys and invalid values
  are rejected before persistence. Only HTTPS YouTube video/playlist destinations
  are accepted. URL syntax validation does not prove availability, educational
  quality, or that the caller actually checked the URL; collection must verify
  those later. Nothing is marked verified by this ingestion code.
- Omission preserves saved YouTube resources on notice-record updates, null clears
  them, and an empty array records no resources. Accepted identical-version replays
  retain existing idempotent behavior; this is not a new enrichment-update endpoint.
- Resources remain private notice metadata, not public reviewed facts or matching
  inputs. No Python AI producer or frontend consumer is added in this increment.
- Apply the database migration before deploying code that selects/writes this new
  Prisma field. Rollback code first; leave the nullable column in place to retain
  stored resources. Dropping it would lose resources and is not automatic rollback.

Checks: Prisma client generation, TypeScript typecheck, ESLint and all five existing
plus extended autonomous-ingest tests pass. Tests use a Python-produced envelope
and in-memory database; no actual PostgreSQL migration/write, production mutation,
provider call or URL availability check was performed. The local test worktree uses
an ignored symlink to the existing Python environment; no dependencies installed.

### PostgreSQL proof and next-stage gates — 11 November 2026

Local PostgreSQL 14 cluster, loopback-only port 55439, disposable database
`aptus_preparation_test`: all 20 migrations applied successfully, including the
nullable YouTube resources column. All six autonomous-ingest tests passed with
one actual PostgreSQL round-trip. The integration test guards the loopback host,
exact disposable database name and matching DATABASE_URL/TEST_DATABASE_URL before
writing. It removes its own notice record and checks Post count is unchanged.

Observed: syllabus JSON, category cutoff numeric zero and resource JSON survive
storage/read-back; omitted resources survive retry; [] and null clear explicitly;
invalid resource URLs are rejected without a new notice record. This supersedes
the previous storage increment's unrun PostgreSQL check, not its production limits.
No production migration, content collection, AI call or frontend work occurred.
The test cluster is stopped after verification; its files remain under temporary
storage for diagnosis, not as a project database.

Next execution order and stop conditions:

1. Save the reviewed capture baseline, recovery-order, age wording and storage
   changes as separate local commits; keep generated graph files excluded.
2. Trace retries and provider accounting around evidence planning, extraction,
   review and repair. Extend existing tests before modifying shared tracking.
   Done when a failed request is counted, waiting retries make zero calls, and
   successful saved work is reused. Do not replace the existing retry ledger.
3. Define and review the five-state assessment contract with actual examples,
   then change provider and consumer together. Explicitly unstated requires
   affirmative evidence; malformed output must not invent supported facts.
4. Prove extraction/review/publication end-to-end offline: held conflicts cannot
   publish, retired bytes make zero paid calls, delivery retries create one job.
   Reuse existing publication and retirement checks. Investigate failures before
   adding new abstractions or changing acceptance semantics.
5. Report the offline gates and propose a bounded drafts-only live trial with
   explicit call/output limits before making paid provider requests. Push/PR and
   deployment are separate operations. Apply storage migration before new API
   code; verify deployed revision and observed worker results afterward.

Syllabus/cutoff/video AI generation and frontend display remain deferred by
Hemant. Storage readiness does not establish content accuracy, automatically
populate these fields, or complete the other worker reliability gates.

### Provider accounting increment — 11 November 2026

- Confirmed bug: `track_provider_requests` covered extraction only. Evidence
  assessment/search/Vision and review/recovery calls made through `provider_post`
  outside that block were omitted from source and run totals. Likelihood 9,
  impact 4, risk 36; trigger: any HTTP provider attempt outside extraction.
- Small fix: retain one request-counter context per prepared notice and aggregate
  it in `finally`, including early exits and failures. Extraction-call counters
  remain separate. No retry, publication, provider selection or budget semantics
  changed. HTTP success still means successful transport/status, not valid facts.
- Regression: simulated evidence waiting counts one request; review success then
  transport failure counts two attempted, one succeeded, one failed. Previously
  review reported zero. Existing preflight checks still report zero HTTP calls.
- Verification: full offline Python suite 526 tests passed. No paid provider,
  production database or deployment involved.
- Next: inspect remaining retry classification and task-model checkpoint identity,
  then shared per-notice limits. This change measures calls; it does not introduce
  a new call budget. Five-state assessment and end-to-end publication gates remain
  later slices. Preparation AI collection and frontend display remain deferred.

### Vision checkpoint identity increment — 11 November 2026

- Confirmed gap: evidence checkpoints included the search model but omitted the
  Vision model. Changing Vision configuration could reuse an old outer result
  without invoking the newly selected model. Likelihood 6, impact 5, risk 30.
- Add optional Vision identity (provider class and model) to the outer request;
  Vision call checkpoints use that identity while assessment/research retain
  their search identity. Calls without a Vision identity keep legacy keys.
- Configuration changes intentionally create a fresh outer evidence checkpoint.
  Existing inner assessment/research responses remain reusable for identical
  requests. An upgrade from an unversioned Vision identity may repeat Vision
  once; no completed draft or publication receipt is rewritten by this helper.
- Offline regression proves same-config reuse, changed-Vision execution and
  assessment reuse. Full Python suite: 527 passed. Existing transient research
  test confirms waiting makes no second search call and successful assessment
  survives retry. No new retry policy introduced.
- Remaining: search provider identity beyond its model name, finer injected
  assessor identities, retry classification review and shared per-notice limits.
  Live-provider correctness remains untested; no deployment performed.

### Task-adapter HTTP accounting correction — 11 November 2026

- Analysis found that GeminiProvider and XaiProvider used direct HTTP `.post`
  calls, bypassing `provider_post`. The earlier per-notice scope fix was necessary
  but its synthetic callback regression did not prove adapter instrumentation.
- Confirmed reproduction: Gemini key rotation made two fake HTTP requests while
  totals remained zero. Likelihood 9, impact 5, risk 45. This understated real
  auxiliary-task HTTP usage and would undermine a shared request budget.
- Minimal fix: both adapters call the existing provider_post helper. Transport,
  payloads, key rotation, return shapes and retry policy are unchanged. Each key
  attempt counts separately; no extra outer increment causes double counting.
- Adapter regression verifies Gemini 429-to-success rotation, Gemini/xAI network
  failures and xAI success. Focused 26 tests and full 528-test Python suite pass
  offline. HTTP success still does not imply valid extraction or factual accuracy.
- Scope: generic worker's per-notice counter observes synchronous task requests
  through these adapters. Legacy OpenAIProvider is not selected by task_provider
  and was left unchanged. Provider-side searches inside a single HTTP response
  are not separate HTTP attempts. No token/cost budget is claimed.
- Remaining: retry classification, search-provider checkpoint identity, shared
  per-notice limits and end-to-end publication verification. No live calls or
  deployment performed.

### Task-provider transient transport retries — 11 November 2026

- Confirmed: a fake HTTP ReadTimeout returned retryable=false from both Gemini
  and xAI task adapters. A slow response could therefore be saved as an unresolved
  result instead of entering the evidence checkpoint retry path. Likelihood 6,
  impact 5, risk 30; no production incident frequency is claimed.
- Both adapters now classify httpx NetworkError and TimeoutException as retryable.
  Existing checkpoint backoff and attempt limits remain unchanged; no immediate
  retry or key rotation is added for transport failures. LocalProtocolError stays
  non-retryable. Authentication, HTTP status and JSON validation handling remain
  unchanged. Previously saved non-retryable checkpoints are not migrated.
- Extended the existing adapter regression for connection/read failures,
  read/write/pool timeouts and permanent protocol errors, including exact HTTP
  attempt totals. All 528 Python tests pass offline, including evidence backoff
  and completed-assessment reuse. Typecheck and lint pass. No live calls or deploy.
- Next: search-provider checkpoint identity and shared per-notice limits, followed
  by end-to-end publication verification. Preparation AI/UI remain deferred.

### Search-provider checkpoint identity — 11 November 2026

- Confirmed by pipeline regression: search evidence identity contained only the
  model string. Switching provider classes while retaining a model identifier
  could reuse evidence from the previous provider. Likelihood 2, impact 2, risk 4;
  no production occurrence demonstrated. Flagged and fixed as cache correctness,
  under the correctness exception to the risk threshold.
- Minimal change: the pipeline passes provider class plus model, matching the
  existing Vision identity format. Existing fingerprinting requires no changes.
  Default task providers are distinguished; custom injected callbacks without a
  task provider still have no explicit identity and are outside this fix.
- Migration consequence: legacy model-only checkpoints are not reused by the
  configured search provider, so evidence work may repeat once. Retirements,
  validated drafts and publication receipts are unchanged. No credentials enter
  checkpoint identities; changing keys alone does not invalidate evidence.
- Tests prove actual pipeline wiring, same-provider reuse and different-provider
  invalidation with the same model name. All 529 Python tests, typecheck, lint
  and diff checks pass offline. No live calls, push or deployment performed.
- Next: shared per-notice limits and end-to-end publication verification.
  Preparation AI collection and frontend display remain deferred.

### Shared HTTP cap, first bounded slice — 11 November 2026

- Analysis: stage-specific limits existed, but provider_post had no shared ceiling
  across assessment, Vision, research, extraction, review and key rotation. This
  is a confirmed missing planned guard, not evidence of runaway production cost.
  Likelihood 4, impact 4, risk 16 when several stages and key retries run together.
- HTML-first processing now allows at most 32 actual provider HTTP attempts for
  each prepared notice during one worker pass. run_pipeline accepts a positive
  integer max_provider_requests_per_notice override; legacy non-HTML-first
  processing remains unchanged. This is an HTTP-attempt ceiling, not token,
  provider-side search-query or money accounting. 32 is an initial conservative
  implementation ceiling, not a measured ideal production allocation.
- The existing metrics boundary checks before transport: denied calls are not
  attempted/failed HTTP requests. Key rotation consumes the same allowance.
  Exhaustion raises a retryable error, records provider_request_budget_exhausted
  in the source report and increments provider_budget_exhaustions. Existing
  validation, review and publication gates remain mandatory. The diagnostic
  blocked outcome may accompany the stage failure outcome for the same notice.
- Existing evidence checkpoints retain completed work. Regression proves a paid
  assessment is not repeated when research resumes after budget exhaustion and
  backoff. A fresh pass gets a fresh allowance; therefore this slice does NOT
  bound cumulative spending across scheduled runs or implement persistent shared
  research-round accounting. Those remain a separate follow-up. Existing saved
  checkpoints are unchanged and no new durable state is introduced.
- Tests cover exact transport ceiling, success/failure accounting, key rotation,
  invalid limits, context cleanup, pipeline wiring/reporting and checkpoint
  resume. All 531 Python tests pass offline; typecheck and lint pass. No live
  calls, production changes, push or deployment performed.
- Next: persistent per-notice allowance across retries, then end-to-end
  review/retirement/publication verification. Preparation AI/UI remain deferred.

### Durable notice request allowance — 11 November 2026

- Confirmed gap: the prior cap reset every pass, so scheduled retries could
  multiply HTTP attempts on unchanged evidence. Likelihood 4, impact 4, risk 16;
  this is a missing planned guard, not an observed production spending incident.
- HTML-first notices now share the existing 32-attempt allowance across passes.
  The ledger lives at state/provider_budgets/{fingerprint}.json beneath the
  worker data root. The fingerprint reuses the existing evidence/version helper
  on the original bundle's normalized text, locators, identity and document
  metadata, before enrichment. Capture timestamps, prepared-file rewrites,
  provider/model/key changes and run dates do not reset it. Changed source text
  or extraction version gets a fresh allowance. Link-only changes do not renew
  the allowance unless represented in those fingerprinted evidence fields.
- Each HTTP slot is reserved atomically under the existing file lock before
  transport. Successes, HTTP errors, timeouts and uncertain interrupted calls
  all consume slots. Exhaustion prevents further HTTP calls and is non-retryable
  at the request boundary; existing checkpoint wrappers may still report waiting,
  but cannot replenish the ledger. The source report retains the explicit budget
  exhaustion diagnostic. No automatic expiry/reset or operator reset tool added.
- Invalid state or failed reservation blocks transport. This does not invalidate
  saved evidence, bypass review/retirement/publication gates, or charge cached
  work. Legacy non-HTML-first processing remains unchanged. The ceiling measures
  HTTP attempts, not tokens, money or provider-side search queries.
- Migration limit: calls made before this ledger exists cannot be reconstructed
  reliably; accounting starts with this change. Preserve the worker data volume.
  Lost/deleted ledger state loses this historical allowance, as with other local
  worker state. No production migration or deployment was performed.
- Verification: 532 Python tests pass, including transport failures, repeated
  scopes, corrupted state, failed writes, repeated pipeline passes, timestamp
  stability and changed-source renewal. Typecheck and lint pass. All provider
  transport in these regressions is fake; no live provider claims are made.
- Next: end-to-end review, retirement and publication/delivery retry verification.
  Five-state assessment and authentic scanned-notice quality comparison remain
  open. Preparation AI collection and frontend display remain deferred.

### Retirement during delivery retry — 11 November 2026

- Small verification slice: existing recovery and publication tests already cover
  missing-review recovery/backoff, immutable approvals, exact-byte retirement,
  delivery backoff and receipt reuse. No production bug was established here.
- Extended the existing publication tests: a connection failure schedules delivery
  retry, then an operator retires those exact bytes before retry becomes due.
  Publication refuses the retry, makes no second send, preserves draft bytes and
  approval, and creates no receipt. Existing guards pass without code changes.
- All 533 Python tests, typecheck and lint pass. This is offline Python pipeline
  and publication-boundary evidence using fake delivery, not a live database,
  provider or deployment test. It does not prove server-side ingestion deduplication
  after an actual database commit followed by a lost response.
- Next small slice: inspect existing ingestion integration coverage for that
  committed-but-response-lost scenario before adding any duplicate tests.
  Five-state assessment and authentic scanned-notice comparison remain open;
  preparation AI collection and frontend display remain deferred.

### PostgreSQL committed-delivery replay — 11 November 2026

- Analysis found existing accepted-notice replay coverage used an in-memory DB.
  Added one case to the existing ingestion test file, using the guarded disposable
  loopback PostgreSQL database. No production bug was demonstrated or code changed.
- The test commits an accepted payload, discards its response, then submits the
  identical payload again. It verifies the same record/job IDs, unchanged job
  rows and exactly one Source, ExtractionCandidate and AutomatedNoticeRecord.
  Cleanup removes only the fixture's records. Existing fixture records cause an
  assertion failure before writes rather than being reused or deleted.
- All seven ingestion tests pass with no skips, including two real PostgreSQL
  cases. Typecheck, lint and diff checks pass. The disposable cluster was stopped.
  This proves sequential replay at the ingestion function/DB boundary; it does
  not simulate a dropped HTTP connection or simultaneous deliveries. Python
  delivery backoff and receipt reuse remain covered separately.
- Next: five-state HTML-first evidence assessment, starting with inspection of
  existing assessment validation/tests. Authentic scanned-notice quality remains
  open. Preparation AI collection and frontend display remain deferred.

### Five-state evidence planning, first slice — 11 November 2026

- Confirmed implementation gap: assessment parsing only routed missing/conflicting
  fields; an unreadable_fields response alone did not request research. Likelihood
  3, impact 4, risk 12 under that concrete response. No live occurrence established.
- Gemini now receives definitions for supported, missing, explicitly unstated,
  conflicting and unreadable fields. The planner validates all five optional
  arrays against existing field paths and rejects duplicates/overlapping states.
  missing_fields remains required for compatibility with the existing response.
  Legacy responses with only missing/conflicting fields remain accepted.
- Missing/conflicting/unreadable fields request bounded research. Supported and
  explicitly unstated fields do not. Labels never become candidate facts, clear
  values or bypass extraction/source validation/review. The prompt restricts
  explicitly unstated to optional facts established by the complete official
  source, never snippet absence. This restriction is model guidance, not a new
  deterministic proof that absence was established; evidence-backed absence
  validation and live classification accuracy remain follow-ups.
- Successful old checkpoints remain unchanged and are not invalidated to repeat
  paid work. Their reports need not contain the new labels. No schema, matching,
  database or public API contract changed.
- All 536 Python tests, typecheck, lint and diff checks pass offline. Tests cover
  five-way routing, optional unstated fields, invalid paths/types, duplicate and
  overlapping classifications. No paid provider, push or deployment performed.
- Next: inspect how to ground explicitly-unstated classifications in complete
  captured sources before treating that distinction as verified. Authentic
  scanned-notice comparison remains open; preparation AI/UI remain deferred.

### Official public destinations and portal-title cleanup — 11 November 2026

- Confirmed path: public detail rendering used source.url as a notice fallback
  and Source listing link; match responses also exposed that collection URL.
  Aggregator discovery URLs therefore became user destinations. Likelihood 8,
  impact 4, risk 32 when a published source URL belongs to a discovery portal.
- Added one shared read-only presentation helper used by catalogue/detail reads,
  saved jobs and match results. It filters Source URL/link slots and reviewed
  official_site_url/apply_url before serialization/rendering. Stored Source,
  ExtractionCandidate, original title and internal review provenance are untouched.
  No migration or paid worker re-extraction is needed for existing records.
- Public destinations currently require a government/academic host suffix
  (.gov.in/.nic.in/.ac.in/.edu.in/.res.in) or IBPS's registered official host,
  with HTTP(S), no credentials and standard ports. Unknown destinations are
  hidden, never replaced with invented URLs. source.url remains a string (empty
  when withheld); nullable link fields become null. Existing renderers reject
  empty URLs. This is a conservative destination policy, not proof that a URL's
  content, redirect target or notice identity was independently checked live.
- Known limitation: legitimate custom application hosts and shortened forms.gle
  links are withheld too. Allowing all Google Forms would not prove issuer
  ownership. Supporting those requires exact issuer/notice-bound destination
  evidence or a reviewed allowlist; no blanket short-link exception was added.
  An official notice/site link remains available when stored on a recognized host.
- Title cleanup removes delimited edge branding for Sarkari Result,
  MySarkariNaukri and FreeJobAlert, preserving authentic names including JKSSB,
  UPSC, IES and JRF. It does not globally rewrite titles or delete arbitrary words.
- Verification: 21 focused API/presentation/rendering/match/metadata tests pass,
  including rendered HTML without aggregator links, unchanged stored objects,
  lookalike hosts, credentials, unsafe protocols, unverified short links and real
  organization/exam names. Contract checks/consumer audit, typecheck, lint,
  formatting and diff checks pass. No live browser/provider/deployment claims.
- No other worker task advanced. Explicitly-unstated source verification,
  authentic scanned-notice comparison and custom application-host verification
  remain open; preparation AI collection and frontend display remain deferred.
