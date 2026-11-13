# Exam mode: staged execution, ownership and full agent prompts

Date: 13 November 2026. Batch: `typing-exam-execution-20261113`.
Coordinator: main conversation. Product authority: Hemant.
Status: staged assignments prepared; implementation gates are not yet satisfied.
Related: [implementation plan](TYPING_EXAM_IMPLEMENTATION_PLAN.md),
[rule research](TYPING_EXAM_RULE_RESEARCH.md),
[independent review](agent-progress/typing-exam-architecture-terra.md).

## 1. Coordinator master prompt — assigned to this conversation

> Act as the responsible full-stack lead for integrating the user's HTML exam
> application into the existing Next.js/React frontend and Fastify/Prisma backend.
> Preserve the original exam visual design and verified exam-specific behavior.
> Keep practice independent and unchanged: random published catalogue passage,
> ordinary editing and its existing practice scoring. Reuse the existing
> TypingExam/TypingExamVersion/TypingPassage schema and operator import.
>
> Start with the actual branch, working tree and current tests, not old status
> claims. Finish the pending practice verification and freeze that accepted
> baseline before launching exam writers. Use official cycle/post/language
> instructions first; commercial mocks are secondary evidence or explicitly
> labelled practice fallbacks. Never convert an unknown rule to a default.
>
> Own the rule/API contract, shared fixture definitions, schema/import changes,
> route registration, navigation, worktree creation, integration and final PR.
> Give each agent an exact SHA, contract revision, worktree, paths and acceptance
> cases. Require acknowledgement before edits. Sequence shared-file changes;
> backend, domain and UI must not independently invent rule semantics.
>
> Review every handoff against its actual diff and reproduce relevant behavior.
> Send concrete defects to the owning implementer; keep Terra independent from
> implementation. Stop dependent work on an unresolved rule, while allowing
> independent work to continue. Complete local work without repeated permission
> questions. Ask Hemant only for unresolved product semantics, not routine code
> choices. Do not claim reports, tests, CI or deployment that did not occur.
>
> Deliver small commits and a reviewed PR with reproducible checks and explicit
> remaining limits. No new dependencies, provider fallback charges, typed-text
> upload, attempt history, live migration, publication, merge or deployment are
> implied. Record unavailable agents honestly; do not bypass their permissions.

## 2. Shared worker prompt — prepend to every stage prompt

> Read AGENTS.md, docs/CODING_STANDARD.md, docs/AGENT_CONTRACT_PROTOCOL.md,
> docs/contracts/README.md, this batch and the named frozen exam contract.
> Use Graphify for relationship lookup and verify the actual source. Use the
> smallest change that fully satisfies the agreed behavior; reuse existing
> helpers/tests. No dependency, CI, environment, shared schema or contract edits
> outside your ownership. Do not read secret environment files or use live DBs.
>
> Acknowledge task ID, assigned worktree/branch, exact baseline SHA, contract
> revision, owned paths and required cases before editing. An unfilled baseline
> or unfrozen relevant contract means analysis only, not permission to write code.
> Report contradictions to the coordinator with a minimal example. Do not use
> casts, suppressed checks, guessed defaults or weaker tests to conceal them.
>
> Handoff one report: requirement, actual changed paths, why this approach,
> alternatives rejected, exact commit/diff, commands/results, failures, unrun
> checks, risks and dependencies. Distinguish proposed, implemented, independently
> verified, integrated and deployed. Do not merge/push/deploy or publish data.

## 3. Execution order

`S0 -> S1 -> S2 -> (S3 API || S4 domain || S5A UI shell) -> (S5B UI integration || S6 content/DB proof) -> S7 independent acceptance and PR`

S5A may start only when its UI rules/API fixtures are frozen; it does not need
finished backend code. S5B needs S3/S4 handoffs and manager integration. Content
source preparation may occur during S3/S4, but applying the import waits for S2.
No worker receives a new implementation assignment while an old writer owns
those paths. Future worktree paths below are planned, not already created.

| Stage | Owner | Starts after | Completion evidence |
| --- | --- | --- | --- |
| S0 baseline | Coordinator + existing practice reviewer | now | accepted practice SHA, preserved dirty index |
| S1 rule matrix | Coordinator + DeepSeek Free; Terra review | research exists | sourced rules, explicit unresolved items |
| S2 contract/storage boundary | Coordinator; Terra review | S0/S1 | exact contract/fixtures and validated importer |
| S3 read APIs | OpenCode GLM Free | S2 | public projections, API + disposable DB tests |
| S4 input/timer/scoring | OpenCode DeepSeek Free | S2 | pure transitions/input/scoring fixture checks |
| S5A/S5B frontend | AGY 3.8 Flash High | S2, then S3/S4 | faithful UI, API integration, browser checks |
| S6 first content | Coordinator | S2, integrated S3/S4 | source record, dry-run, isolated read-back |
| S7 acceptance/PR | Terra + coordinator | S3–S6 | exact-commit review, checks, accurate PR |

## S0 — preserve and finish the current baseline

Owner: coordinator. Scope: existing practice slice only; do not rebuild it.

> Inspect /private/tmp/aptus-typing-pr-20261112 on
> codex/typing-practice-storage. Current recorded HEAD is
> d33f5552aca192880b22a2b4f1962081a2606946; practice changes remain uncommitted.
> Verify current state before acting. Preserve unrelated staged/unstaged work in
> the original checkout. Complete the pending disposable PostgreSQL verification,
> retain valid browser/build/lint evidence unless new code invalidates it, freeze
> the accepted practice commit and obtain the existing independent review.
> Update the handoff to distinguish practice completion from missing exam mode.
> Record the exact integration SHA and use it for all subsequent worker branches.

Done when: practice is reviewable on an exact SHA and the exam batch cannot
silently overwrite it. No exam implementation writer starts from dirty files.

## S1 — translate official rules into a supported-version matrix

Owner: coordinator; DeepSeek Free supplies domain analysis; Terra reviews.
Owned deliverable: `docs/agent-progress/typing-exam-rule-matrix-deepseek.md`.
Coordinator owns `docs/TYPING_EXAM_RULE_MATRIX.md` and evidence decisions.

> Be the exam-rule/domain specialist. Read the original exam-mode/exam.js,
> passages.js and scoringEngine.js, the existing schema/importer, official-first
> research and independent findings. For each exact exam cycle/post/language,
> map duration, timer start, warm-up/break, editing, repeat/completion, submit,
> error unit, full/half mistakes, denominator, rounding and qualification.
> Attach the source URL and section/page for each known rule; identify indexed
> evidence versus directly inspected PDFs and distinguish source statements
> from our browser-policy interpretation. Do not generalize CHSL2020 editing
> to CHSL2025 or transplant a commercial RRB toggle into official simulation.
> Produce a finite supported/unknown matrix and worked-example requirements.
> Recommend the first evidence-complete English version; do not silently choose
> or publish one. No runtime/schema/contract changes. Return findings to manager.

Acceptance: no guessed Backspace/scorer/cutoff; each unsupported rule is named;
RRB penalty, SSC mistake classes and CPCT word counts remain separate methods.

## S2 — freeze contracts and extend storage only where required

Owner: coordinator; reviewer: Terra. Sequential shared-file stage.
Owned paths: `docs/TYPING_EXAM_CONTRACT.md`, `lib/typing/exam-contract.ts` if
actually shared by consumers, `tests/fixtures/typing-exam/`, existing typing
import validator and its existing tests. Schema/migration only if a confirmed
requirement cannot be represented by existing fields.

> Define exact public JSON and runtime meanings from the accepted rule matrix.
> Freeze list bounds/order/cursor encoding; path ID validation; 400 invalid
> request, 404 missing/draft/retired, 503 sanitized DB failure and the chosen
> public-not-ready response. Bind the start snapshot to version and passage
> identity/revision/hash, exact text and all required policies. Define supported
> combinations and an explicit readiness truth table, including passage text
> compatibility. Freeze timer start, completion/repeat, submit/reset and input
> semantics; no frontend-created defaults. Record numeric bounds and missing
> versus null behavior. Do not make ordinary publication imply runnable.
>
> Extend the current null-only editingPolicy/scoringMethod importer only after
> the semantic change is recorded and approved. Validate named, code-owned
> methods; never load executable formulas from DB. Preserve legacy draft import,
> atomicity, conflict rejection and exact canonical text. Freeze valid/invalid
> fixtures for all consumers; confirm disputed product choices with Hemant.

Acceptance: both backend/domain can implement without guessing; Terra identifies
no unresolved required contradiction. Record the contract revision and baseline
SHA before launching writers. Readiness and qualification are separate outcomes.

## S3 — bounded public exam catalogue and start snapshot API

Owner: OpenCode GLM 5.3 Flash Free.
Future worktree/branch: `/private/tmp/aptus-typing-exam-api-20261113`,
`codex/typing-exam-api`. Coordinator creates it from S2's accepted SHA.
Owned paths: `src/routes/typing-exams.ts`, `src/lib/typing-exam-catalogue.ts`,
`scripts/typing-exams-route.test.ts`,
`docs/agent-progress/typing-exam-api-glm.md`.

> Implement the frozen exam API with existing Fastify/Prisma patterns. Return
> bounded published exam and version summaries without passage text. Version
> detail returns the exact public rule/readiness projection. The passage/start
> read returns one coherent configuration and eligible passage bound to the
> selected version, following the frozen selection/revision policy. Query the
> database with explicit projections and bounds; never download the catalogue
> into Node or the browser. Prevent guessed IDs from revealing draft/retired
> content. Unknown or unsupported required configuration must not start.
> Reject invalid query/cursor/ID input exactly as contracted and sanitize DB
> errors. Use no-store where required. No writes or typed-text payloads.
> Extend relevant injection tests; coordinator owns route registration and
> independent real-DB fixtures. Report schema/contract mismatches rather than
> editing those files. Hand off diff, exact checks and response examples.

Acceptance: published visibility, bounded pages, cross-version rejection,
empty/unready/failure paths and actual serialized snapshot preserve the contract.

## S4 — deterministic input, timer and exam-specific evaluators

Owner: OpenCode DeepSeek V4.1 Flash Free.
Future worktree/branch: `/private/tmp/aptus-typing-exam-domain-20261113`,
`codex/typing-exam-domain`.
Owned paths: `lib/typing/exam-session.ts`, `lib/typing/exam-input.ts`,
`lib/typing/exam-scoring.ts` only when a confirmed scorer is implemented,
`tests/typing-exam-session.test.ts`, `tests/typing-exam-input.test.ts`,
`tests/typing-exam-scoring.test.ts`,
`docs/agent-progress/typing-exam-domain-deepseek.md`.

> Implement framework-free functions consuming the frozen start snapshot. Keep
> practice functions unchanged. Use an injectable monotonic clock/deadline and
> explicit ready/running/finished transitions (including warm-up/break only if
> required by the supported profile). Enforce expiry on edits and submit, not
> just timer ticks. Handle no input, delayed ticks, blur/background, reset and
> repeated completion deterministically. Model allowed editing outcomes for
> Backspace/Delete, selection replacement, caret movement, undo/redo, paste,
> drop, mobile and composition using the accepted policy, not keydown alone.
> Implement CURRENT_WORD_ONLY only if exact separators/deletion semantics are
> supported; otherwise reject that configuration as unsupported.
>
> Implement only source-confirmed scoring methods and threshold applicability.
> Preserve final-text versus attempt-log distinctions. Match official worked
> examples and classification fixtures; no universal penalty or invented zero
> thresholds. Avoid insertion/deletion shifts causing cascades contrary to the
> scoring contract. Test observables with Node's existing runner. No DOM, React,
> database, HTTP, shared fixture edits or qualification claims for unknown rules.

Acceptance: deterministic race/input examples pass; results remain unavailable
where required evidence/configuration is missing; practice regressions unchanged.

## S5 — original exam appearance in responsive React

Owner: AGY Gemini 3.8 Flash High, effort high.
Future worktree/branch: `/private/tmp/aptus-typing-exam-ui-20261113`,
`codex/typing-exam-ui`.
Owned paths: `app/typing/exam/page.tsx`, `components/typing/exam-mode.tsx`,
`components/typing/exam-mode.module.css`, `lib/typing/exam-api.ts`,
`tests/typing-exam-api.test.ts`,
`docs/agent-progress/typing-exam-ui-agy.md`.

> Read the installed Next.js docs and original HTML/CSS. Build the smallest
> isolated React exam view that preserves candidate-style header, timer, rule
> badges, passage/input panes, font zoom, counters, submit confirmation and
> result flow. S5A may consume frozen fixture responses; mark it a shell until
> real API/domain integration. In S5B, use the actual S3 API and S4 functions,
> validate unknown JSON, abort stale requests and keep one immutable running
> snapshot. Show loading/empty/error/unready states with Start disabled as
> appropriate. Rules are fixed for exam mode: no user Backspace/duration toggles
> that alter the selected official configuration.
>
> Attach native input/beforeinput behavior to the controlled textarea, reconcile
> rejected changes using S4, and do not implement your own scorer/readiness rules.
> Keep ordinary keyboard navigation, visible focus and accessible dialogs with
> correct focus restoration. Avoid global shortcut suppression. Match the exam
> look on desktop and stack panes sensibly at small widths; scope all styles so
> practice remains unchanged. Handle long passages, zoom and on-screen keyboard.
> Never upload typed text. Report exact UI checks, limitations and remaining work.

Acceptance: 320/390/568/834/1440/1920 layouts, keyboard/touch controls, no horizontal
page overflow, stale-response protection and exact configuration display.
AGY is currently blocked by a headless command-permission denial. This assignment
is queued, not running. Do not use permission-bypass flags. Coordinator may take
over only after recording the handoff; any replacement must be identified.

## S6 — first real content and actual database/API proof

Owner: coordinator; evidence review: Terra.
Owned paths: `docs/TYPING_EXAM_CONTENT_REVIEW.md`, an explicitly named first
exam import fixture once rights/source/edition are established, and
`scripts/typing-exams-database.test.ts`. No live records in this stage.

> Prepare the first exact exam version and canonical passage with source URL,
> edition/language, rules, score examples and unresolved items. Do not call a
> synthetic or reconstructed paragraph an official previous-year passage.
> Preview through the existing importer; keep content draft pending review.
> On a disposable PostgreSQL schema only, prove atomic import/read-back, draft
> exclusion, published fixtures, parent/child/version binding, rule preservation,
> readiness, exact text and actual API serialization. Include one conflicting
> configuration and an empty eligible catalogue. Do not use application .env,
> migrate shared DBs or publish records. Document the authorized future
> publication procedure separately from local test fixture setup.

Acceptance: exact source/content provenance and producer -> DB -> HTTP -> client
fixture compatibility, not merely matching handwritten mocks.

## S7 — independent acceptance and PR handoff

Owner: GPT-5.6 Terra reviewer; coordinator runs integration/fixes/PR update.
Terra owns only `docs/agent-progress/typing-exam-final-terra.md`.
Coordinator owns navigation, `src/app.ts`, browser tests and final handoff.

> Review the exact frozen integrated SHA against contract, source evidence and
> original exam UI. Do not edit implementation or approve your own fixes. Check
> public visibility, bounds, unsupported/null configuration, revision snapshot,
> keyboard/mobile editing bypasses, timer races, completion/repeat, scoring
> fixtures, safe failure states, privacy and practice separation. Report findings
> with severity, concrete trigger/reproduction, actual impact, paths and proposed
> correction; distinguish confirmed from speculative. Independently rerun focused
> checks where feasible and list missing checks. Re-review fixes on their SHA.
>
> Coordinator returns findings to the owning lane, integrates sequentially and
> runs typecheck, lint, production build, relevant contract/pure/API tests,
> disposable real DB tests and browser behavior. Browser matrix includes narrow
> desktop/mobile, zoom, long text, dialogs and background expiry. Record exact
> commands/environment/results. Update PR #46 only with observed outcomes;
> keep draft while required rules/content/checks are missing. No merge/deploy.

Acceptance: no unresolved material finding; all required supported-version
behavior demonstrated; missing Safari/real hardware checks stated explicitly.

## 4. Dispatch and progress ledger

- Coordinator master prompt: assigned to this conversation and active.
- S0: combined verification passed 76/76, zero skips. Practice commits cca038f and
  review fix 15e50a7; Terra accepted that exact code SHA with no material
  finding. Browser/suite evidence was supplied, not independently rerun by Terra.
- S1: Hemant selected SSC CHSL 2025 LDC/JSA English. GLM and DeepSeek
  returned bounded analysis; manager reviewed and recorded rejected proposals.
  Terra found revised official correction/completion guidance. See the
  coordinator rule matrix; exact official scoring/cutoff remains unresolved.
- S2: queued; unresolved exact scoring and lifecycle decisions remain visible
  in TYPING_EXAM_RULE_RESEARCH.md and Terra's review.
- S3/S4: prompts and ownership assigned, implementation NOT launched; S2 gate.
- S5: assigned but blocked by AGY headless permissions and S2 integration gate.
- S6: queued; first edition/content not yet finalized.
- S7: Terra architecture stage completed; final code review queued after integration.

Full worker prompts are prepared here. Exact future SHA/contract revision and
worktree acknowledgement are deliberately assigned at dispatch, not fabricated.
No successful code execution or agent completion is inferred from an assignment.

## Execution update — 13 November

User authorized stage execution. S0 combined verification passed 76/76 with no
skips against disposable PostgreSQL; coordinator is freezing the practice SHA.
Terra is independently preparing the S1 evidence-gap report. OpenCode GLM and
DeepSeek received reference text directly for bounded read-only analysis after
file-reading permission denials; no runtime ownership transferred. AGY remains
blocked. S3/S4/S5 implementation waits for the frozen S2 contract. Terra
sequencing finding accepted: S6 may run alongside S5B after S3/S4 integration.

S0 acceptance: Terra accepted 15e50a72bb1c0c8368cafd3b02bd06ff23f242ef;
70d82c0 adds only staged plans/research. Branch pushed to draft PR46. S1
additional evidence: manager fetched 2025 FRTA cutoff; evaluator implementation
remains unfrozen. No S3/S4/S5 runtime writer has been launched.
