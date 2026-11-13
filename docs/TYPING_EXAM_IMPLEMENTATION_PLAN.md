# Exam mode implementation plan and team batch

Date: 13 November 2026. Batch: `typing-exam-plan-20261113`.
Status: design review in progress; proposed exam semantics are not frozen.
Coordinator owns decisions, integration and review. Hemant owns disputed product
semantics and release authorization. This extends the existing typing plans;
it does not restart the completed practice/storage work.

## Verified baseline and scope

Integration: `/private/tmp/aptus-typing-pr-20261112`, branch
`codex/typing-practice-storage`, HEAD `d33f555`. PR #46 is draft.
Practice API/frontend changes are uncommitted and protected. Original checkout
has unrelated staged/unstaged work; do not reset, stage all or overwrite it.
Reference HTML: `/Users/mrblackghost/Work/Practice/Keyboard_Typing_test/exam-mode`.
Read `docs/AGENT_CONTRACT_PROTOCOL.md`, `docs/contracts/README.md` and
`docs/CODING_STANDARD.md` before implementation assignments.

Already present: draft catalogue schema/import, practice UI and database-backed
practice slice. Exam catalogue APIs and exam React UI are not implemented.
Do not rebuild practice or the catalogue schema as a new feature.

## Data ownership decision

Keep `TypingExam -> TypingExamVersion -> TypingPassage`.
The operator prepares one version's rules and any number of passage revisions.
Duration, editing, scoring and qualification belong to the version, not duplicated
on every passage. A passage references its version. Different rules require a
new version, not mutation of a running session's configuration. Content status
and supported rule readiness are separate checks.

An exam version is not a candidate attempt. The first delivery is a browser
simulation with a configuration snapshot held for its lifetime. No attempt table,
leaderboard, candidate text upload or authenticated administration is required.
If persisted/verified results become a requirement, design server-owned attempt
identity, configuration revision, timing and scoring separately before claiming
that client restrictions establish exam integrity.

Existing unknown fields remain null. Do not infer default Backspace, duration,
scoring, thresholds or completion behavior. Current import accepts only null for
editingPolicy/scoringMethod; expanding it requires a separately reviewed contract
and focused validation tests. Avoid an arbitrary JSON rules blob or executable
rules from the database. Use explicit supported identifiers and deterministic code.

## Original HTML behavior and limits

Preserve exam header, timer, rule badge, master passage, typing pane, font zoom,
counters, confirmation dialog and completed state. Match its exam appearance;
practice keeps the current site style. The source starts on the first printable
key, keeps a deadline, offers manual submit and expires automatically. Its
WORD_LOCKED label maps to schema CURRENT_WORD_ONLY only after exact deletion
semantics are defined and tested.

Do not copy global shortcut/Tab blocking, mutable defaults or keydown-only guards.
The source logs keydown separately from native edits and uses generic scoring
cutoffs; neither is evidence of an official exam method. Error counting,
insertions/deletions, elapsed-time denominator and rounding need worked examples.

## Sequence and completion gates

1. Close the current practice slice: preserve changes, complete disposable-DB
   verification, freeze its commit, obtain independent review and update PR #46.
   No repeated browser matrix unless code changes invalidate existing evidence.
2. Parallel read-only design reviews below. Coordinator resolves conflicts and
   records exact API payloads and supported lifecycle/rule matrix before writers.
3. Freeze `docs/TYPING_EXAM_CONTRACT.md`: exact request/response fields, bounds,
   status visibility, rule meanings, readiness reasons and valid/invalid fixtures.
   Confirm unresolved product semantics with Hemant; silence is not approval.
4. Implement one API slice: bounded published exam/version lists, version detail
   and one selected-version passage read. Server validates identifiers, filters
   drafts/retired content and refuses unsupported/incomplete start configurations.
   No catalogue-wide passage download, invented defaults or DB writes from GET.
5. Implement framework-free exam state/input functions against frozen cases.
   Then port the HTML into isolated React exam components and connect the API.
   Practice state/scoring must remain separate. Read installed Next.js guides.
6. Implement only confirmed scoring identifiers with worked examples. Until
   confirmed, show factual counts and explicitly unavailable official scoring;
   do not label any score/qualification official. Readiness policy must state
   whether a rules-only simulation is separately offered; it is not implied.
7. Import one source-grounded real version using dry-run first. Preserve passage
   text and source evidence. Keep drafts until reviewed. No shared/live migration
   or publication without release authorization.
8. Independent exact-commit review, integrated browser/DB checks, then PR update.
   Keep draft if content, semantics or required checks remain unresolved.

## Proposed API outline (not frozen yet)

- GET `/api/typing/exams?limit=20&cursor=...`: bounded exam metadata only.
- GET `/api/typing/exams/:examId/versions?limit=20&cursor=...`: published version
  summaries, supported/readiness status and explicit reasons; no passage text.
- GET `/api/typing/exam-versions/:versionId`: published version identity,
  instructions, rule identifiers/nullable values and readiness; no fabricated rules.
- GET `/api/typing/exam-versions/:versionId/passage`: one eligible passage bound
  to that version; successful start response must use a coherent rules snapshot.
  Define selection policy, empty/not-ready status and revision binding in contract.
- Practice GET remains unchanged and does not apply exam readiness restrictions.

Contract must fix stable ordering/cursors, maximum limit, unknown query handling,
exact public field projections, 400 invalid input, 404 invisible/missing identity,
503 sanitized database failure, and the chosen empty/not-ready response. Frontend
has loading, empty, unavailable, unsupported and retry states with disabled Start.
Reject stale responses when selection changes and abort replaced requests.

## Non-overlapping assignments and prompts

All four tasks initially return design reports only. No shared code writes,
schema changes, migrations, environment reads, commits, pushes or deployments.
A completed report records evidence, why, alternatives, tests and uncertainties.

### OpenCode GLM 5.3 Flash Free — catalogue API

Prompt: Be the backend catalogue specialist. Read this batch, current schema,
import validation and Fastify patterns. Propose bounded published exam/version
and passage read APIs, exact response/error examples and readiness validation.
Keep text out of list responses. Preserve unknowns and practice behavior. Report
why each decision is needed and tests that prove it. Do not edit runtime files.
Report: `docs/agent-progress/typing-exam-api-glm.md` (manager transcribes output).
Future exclusive paths: `src/routes/typing-exams.ts`,
`src/lib/typing-exam-catalogue.ts`, `scripts/typing-exams-route.test.ts`.

### OpenCode DeepSeek V4.1 Flash Free — input and lifecycle

Prompt: Be the typing domain specialist. Inspect original exam.js and scoring
engine. Define risks and proposed cases for Backspace, Delete, selection,
beforeinput, undo, paste/drop, composition, first accepted input, deadline expiry,
background tabs, manual submit and reset. Map WORD_LOCKED explicitly. Do not
invent official scoring or modify shared schemas/API. Report sources and why.
Report: `docs/agent-progress/typing-exam-domain-deepseek.md`.
Future exclusive paths after freeze: `lib/typing/exam-session.ts`,
`lib/typing/exam-input.ts`, `tests/typing-exam-session.test.ts`.

### AGY Gemini 3.8 Flash High — faithful responsive frontend

Prompt: Be the exam UI/UX specialist. Compare original index.html/exam.css with
the Next app. Plan faithful exam-only React components, responsive panes,
accessible controls/dialogs and loading/error states. Keep practice unchanged.
No global shortcut blocking or keyboard traps. Consume the frozen API later;
do not change database, rule semantics or scoring. Explain tradeoffs and checks.
Report: `docs/agent-progress/typing-exam-ui-agy.md`.
Future exclusive paths after freeze: `app/typing/exam/page.tsx`,
`components/typing/exam-mode.tsx`, `components/typing/exam-mode.module.css`,
`lib/typing/exam-api.ts`. Coordinator owns navigation integration/browser tests.

### GPT-5.6 Terra — independent architecture and integration reviewer

Prompt: Be the independent reviewer, not an implementer. Inspect this plan,
source HTML and current schema/import. Challenge compatibility, readiness,
publication visibility, rule bypasses, scoring evidence, immutable session
configuration and file ownership. Report concrete conflicts and acceptance cases.
Review exact combined commits after implementation. Do not fix implementation
or approve your own code; coordinator assigns fixes back to the responsible lane.
Report: `docs/agent-progress/typing-exam-architecture-terra.md` only.

Coordinator alone owns frozen contract, schema/import evolution, src/app.ts,
shared fixtures, navigation and integration browser/DB checks. Implementation
agents get separate worktrees from one recorded integration SHA after freeze.
If a CLI times out, record failure rather than claiming work completed. Reassign
only after its writer is stopped; do not retry indefinitely or overlap files.

## Acceptance matrix before saying exam mode is done

- Published parent/child visibility; drafts/retired unavailable by guessed IDs.
- Bounded reads and exact projections; one passage belongs to selected version.
- Null/unknown policy cannot silently enable Start or a qualification result.
- Instructions precede Start; selection is frozen for a running attempt.
- Policy-specific editing across keyboard, beforeinput, selection and mobile.
- Timer starts only on accepted input, continues off-focus, expires once, and
  rejects late input; submit/cancel/reset have deterministic transitions.
- Exact source text including LF/TAB/spaces preserved; no unsafe HTML rendering.
- Confirmed scoring examples, zero-input result, corrected errors, denominator
  and rounding tested separately; practice scoring is unchanged.
- Responsive 320/390/568/834/1440/1920, keyboard-only dialogs, visible focus,
  touch input, long passage and zoom; Safari/real hardware reported separately.
- API failure/empty/unready and stale-response recovery; no typed-text upload.
- Typecheck/lint/build, focused pure/API tests and disposable real DB tests pass.
- No live DB, release, deployment or official-certification claim from local tests.

## Rule decisions to settle before implementation freeze

1. First supported real exam/version and its evidence. Original preset labels
   and cutoffs are examples until source-confirmed, not official configuration.
2. Timer start trigger (original first accepted input versus explicit Start);
   no pause on blur; deadline wins over delayed UI callbacks and late input.
3. Passage completion: stay until deadline, submit at target length, or allow
   extra text. Do not reuse practice completion behavior implicitly.
4. Exact editingPolicy: cursor/selection/replacement/Delete/undo/redo; Backspace
   policy alone does not describe all editing. Define current word separators,
   boundary whitespace, Ctrl/Option deletion and selection crossing boundaries.
5. LF/TAB passage handling and input language. Do not publish text that the
   selected engine cannot reproduce, or silently normalize it while scoring.
6. Manual submit, submit before first input, reset confirmation, and route exit.
7. Error unit, corrected mistakes, omissions/insertions, time denominator,
   threshold inclusivity and display rounding with numeric worked examples.
8. Version/passage publication and update policy. Published does not mean ready;
   keep unsupported configurations unavailable to start. Publication tooling is
   a separate authorized operation, not a public create-exam endpoint.

## Observed checks and task launch

Manager reran original framework-free tests on 13 November: 30/30 pass. These
prove current functions against their examples, not official scoring or native
editing restrictions. Current HTML/schema/import paths were read directly.

Launched non-overlapping read-only planning tasks: OpenCode GLM 5.3 Flash Free
(API), OpenCode DeepSeek V4.1 Flash Free (domain), AGY Gemini 3.8 Flash High
(UI; bounded 60-second request), and GPT-5.6 Terra independent review task
`01a1d251-b9c1-7942-b0ba-501d4ece3c50`. Prompt/output artifacts are local under
`/private/tmp/typing-exam-plan-20261113`. Launched is not completed or accepted.

## Official-first rule research — 13 November

See [rule evidence and design decisions](TYPING_EXAM_RULE_RESEARCH.md). Official
SSC/RRB/CPCT material was found; commercial mock settings are not authoritative.
RRB editing and CPCT duration differ from the supplied commercial defaults.
Separate exam evaluators and version-specific provenance are required. Unknown
UPSSSC/High Court details remain unresolved rather than guessed. Runtime and
schema are unchanged by this research.
