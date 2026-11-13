# Remaining exam implementation: team stages

Coordinator: this conversation. Date: 13 November 2026.
Implementation baseline: `5844eb665581b6359a0ca83c1fb0a439812a278d` in
`/private/tmp/aptus-typing-pr-20261112`, branch `codex/typing-practice-storage`.
This plan does not change the frozen `exam-v1` contract in that worktree.
The original checkout contains unrelated dirty work; preserve it.

## Agreed behavior and current state

The approved SSC CHSL 2025 LDC/JSA English simulation uses 600 seconds,
normal corrections, first accepted insertion to start, blocked paste/drop,
and a clock that continues through submission confirmation. Official scoring
and pass/fail are unavailable. Do not ask for this approval again.

Shared contract/fixtures, importer editor support, local session/input functions
and validated API client exist. Backend exam APIs and the exam React page do not.
The earlier 59 passing tests concern those foundations and practice regressions;
they do not establish database integration or responsive exam behavior.

Store passages in the existing catalogue and bind rules to the exam version.
Return a coherent passage-and-rules snapshot. The browser applies only supported
rules. Practice reuses catalogue text while ignoring exam restrictions.
Do not duplicate rule objects onto every passage or introduce a new collection.

## Ownership and dispatch

| Member                    | Assignment                                                                      | Boundary                                                            |
| ------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Coordinator / GPT         | Review, integrate, route registration, database proof, browser verification, PR | Shared files and integration only                                   |
| OpenCode GLM Free         | Backend catalogue, then HTTP routes                                             | Backend paths below; one deliverable per call                       |
| OpenCode DeepSeek Free    | Independent domain/input checks, then backend review                            | Read-only review; assigned tests only after approval by coordinator |
| AGY Gemini 3.8 Flash High | Exam layout/CSS, then interaction wiring                                        | Frontend paths below; sequential ownership                          |
| OpenCode MiniMax Free     | Small test/fixture task if GLM or AGY stalls                                    | Explicit reassignment only; never concurrent ownership              |
| GPT 6.1 Terra             | Independent integration review and final findings                               | Read-only; never accepts its own implementation                     |

AGY and OpenCode free identifiers were listed locally. OpenCode also lists
`openai/gpt-6.1-terra`; listing alone does not prove a successful model call.
Native GLM/DeepSeek workers failed with a credits error; do not label them as
OpenCode Free or as completed reviews. Bounded CLI planning reviews are dispatched
separately; results must be inspected before acceptance.

Every dispatch includes: exact baseline, contract revision, task, allowed files,
protected files, acceptance examples and expected return format. Require the
worker to acknowledge ownership before edits. Existing API/domain/UI worktrees
are still at older baselines; do not reuse them without explicitly reconciling
their status and coordinator-approved baseline. No resetting dirty worktrees.

Worker handoff: changed files or exact commit, why each change was made, checks
actually run, failures and limitations. No progress inferred from exit code zero.
For generated artifacts, the coordinator installs only reviewed owned paths.
One bounded retry; then shrink or reassign the task rather than repeat a large call.

## Stage 1 — Backend catalogue (GLM Free)

First deliverable: catalogue reads/readiness. Second: coherent start snapshot.
Own `src/lib/typing-exam-catalogue.ts` and focused catalogue tests. No HTTP,
schema, importer, shared types or frontend edits. Coordinator approves exact
test path before dispatch, reusing existing coverage where possible.

**Prompt**

> Implement only the assigned catalogue slice against exam-v1 at the supplied
> baseline. Read the actual Prisma schema, existing typing catalogue/content
> helpers and contract. Reuse parameterized database access. Return published
> English exams/versions with bounded ID pagination; preserve nullable stored
> rules and apply the frozen readiness reasons without defaults. In the second
> slice, retrieve one eligible random passage and its selected version's rules
> within a coherent read transaction. Preserve exact text and verify its hash,
> provenance and publication eligibility. No whole-catalogue browser payload.
> Add focused tests for the slice, document decisions, and report ambiguities.
> Do not change the contract or mark unsupported versions ready.

Gate: pagination boundaries/cursors, draft/retired exclusion, missing rules,
unsupported rules, empty eligible passages and snapshot consistency are proved.

## Stage 2 — HTTP routes (GLM Free; DeepSeek reviews)

Depends on Stage 1. Own `src/routes/typing-exams.ts` and
`scripts/typing-exams-route.test.ts`. Coordinator alone owns `src/app.ts`.

**Prompt**

> Add the four exam-v1 GET routes using the accepted catalogue functions and
> existing Fastify patterns. Match the frozen wrappers and error envelopes.
> Validate IDs, pagination and unknown/repeated query keys. Keep passage text
> out of listings/detail; exclude unpublished content even for guessed IDs.
> Send no-store on successes, errors and method rejection. Sanitize database
> failures as 503, distinguish 400/404/409, and test using Fastify injection.
> Export registration without changing app.ts. Report exact checks and paths.

Gate: actual emitted responses pass the existing client validators. Coordinator
registers routes only after review. DeepSeek checks exact diff and reports
reproduction steps; it must not weaken tests or silently fix its findings.

## Stage 3 — Exam visual shell (AGY 3.8 Flash High)

Can run alongside Stage 1. First deliverable: component markup using the existing
contract fixture. Second: scoped responsive CSS. Own
`components/typing/exam-mode.tsx`, `components/typing/exam-mode.module.css`,
and `app/typing/exam/page.tsx`. Do not expose a fixture as a real public exam.

**Prompt**

> Read the supplied original exam-mode HTML/CSS and installed Next.js guidance.
> Reproduce its navy header, neutral panels, timer, toolbar/font controls, serif
> passage and input, stacked panes and confirmation appearance closely.
> Use neutral simulation identity, accessible labels and scoped styles. Keep
> the page a server wrapper with an interactive client component. Adapt at
> 320/390/568/834/1440/1920px and 200% zoom without page overflow or unreachable
> input/actions. Avoid fixed-height body/overflow traps. Do not implement a new
> timer, scorer, API client or keyboard engine. Return only this slice and
> explain visual decisions. Fixture rendering is development-only.

Gate: manager compares desktop screenshot with original and checks narrow/short
viewports. Original is a visual benchmark, not proof of official SSC branding.

## Stage 4 — Wire exam behavior (AGY; DeepSeek reviews)

Depends on accepted Stage 3; live integration requires Stage 2. Same component
owner; CSS changes only as necessary. Existing API client/domain stay protected.

**Prompt**

> Wire the accepted shell to existing loadExams/loadExamVersions/loadExamVersion/
> loadExamSnapshot and session/input exports. Provide bounded Load more,
> instructions, readiness, loading/empty/error/retry states and abort/stale-response
> protection. Start only a validated snapshot; prevent pending loads from
> replacing an active session. Start timing on accepted insertion, check expiry
> on input and submit, and complete once. Preserve ordinary editing and IME;
> block paste/drop and unsupported input paths. Confirmation does not pause.
> Keep Tab/browser shortcuts and provide paragraph indentation access consistent
> with the contract. Restart resets the same snapshot. Keep typed text local.
> Show official scoring unavailable. Use accessible dialog focus/restore and
> avoid per-second screen-reader announcements. Report mismatches for review.

Gate: deterministic input tests plus browser behavior prove IME, correction,
expiry races, submit/cancel, restart and stale-load protection. No practice changes.

## Stage 5 — Database proof and content (coordinator)

Can begin after Stage 2 while Stage 4 proceeds.

**Prompt to coordinator**

> In a verified disposable database, exercise the existing importer and real
> API path. Extend existing database tests for exact text/hash, rule/version
> binding, visibility, readiness, cursor validation and snapshot reads. Prepare
> real SSC content only with provenance and reviewed rules; preview imports and
> retain drafts. Synthetic published fixtures belong only in isolated tests.
> Never use an application ENV/shared database or publish real content here.
> Record database checks separately from mock route tests.

Gate: database → route → existing client compatibility proven. Runnable public
content remains a separate release/content authorization requirement.

## Stage 6 — Independent integration and responsive review

Coordinator runs checks; Terra reviews integrated exact SHA. AGY supplies visual
reference comparison but cannot independently approve its own UI implementation.

**Prompt to Terra 6.1**

> Review the supplied exact integrated diff against exam-v1 and original visual
> reference. Trace database rules through API validation to browser enforcement.
> Check privacy, draft exclusion, supported readiness, timer/input races, IME,
> dialog focus, stale requests and practice independence. Review observed browser
> evidence at the required widths/zoom. Give concrete findings with file/line,
> trigger, impact and reproduction. Separate observed from unverified. No edits,
> invented scoring, acceptance based on worker claims, merge or deployment.

Manager verifies relevant unit/API/DB/browser suites, both TypeScript projects
(including new libs), lint and production build. Browser checks cover portrait,
landscape/short heights, zoom, long passages, keyboard navigation, modal behavior,
background expiry and mobile keyboard reachability. State real-device/Safari
coverage limits; do not equate viewport emulation with hardware verification.
Return findings to their original owner, one small fix at a time; rerun affected
checks after fixes. Update Graphify after code changes.

## Stage 7 — Draft PR handoff (coordinator)

**Prompt to coordinator**

> Update draft PR #46 with implemented behavior, exact verification evidence,
> unresolved content/scoring issues and release requirements. Distinguish local,
> CI and deployed status. Review final diff for unrelated/generated changes.
> Do not merge, deploy, publish content or run shared/live migrations.

Completion means the integrated simulation works against the real backend and
passes the stated review gates. Assignment, static screenshots or unit tests
alone do not constitute completion.

## Planning review outcomes — current dispatch

- AGY `gemini-3.8-flash-high`: returned a static plan, conversation
  `d810a4a8-d084-4cf3-bb37-1b8609c7a7fd`. Accepted layout/wiring/viewport sequencing.
  Rejected first-keydown timing and new raw speed/accuracy calculations; use
  accepted insertion and the frozen completion behavior. No new disclaimer
  banner is required merely by the review; retain an honest simulation label.
- OpenCode GLM Free: returned a plan. Rejected notification-table reuse, offset
  pagination, fabricated response fields, POST/PATCH attempt endpoints and
  server-side typing-event upload. These violate exam-v1. Its proposed plan
  is not implementation approval; future tasks receive exact contract excerpts.
- OpenCode DeepSeek Free: returned a plan. Accepted focus on IME, expiry,
  confirmation and practice regression. Rejected a new undo stack and claims
  about persisted answers; input remains local with existing native editing.
  Expiry must finish once with reason expired, not create a new submission API.
- OpenCode GPT 6.1 Terra: attempted exact listed model `openai/gpt-6.1-terra`;
  failed `provider.auth: Request failed: 400`. No review accepted. Keep final
  reviewer assignment pending; coordinator continues review without claiming
  Terra approval or switching to an unrequested paid model.

Raw responses are `/private/tmp/typing-team-plan-{agy,glm,deepseek,terra}.json`.
These calls reviewed planning prompts, not the integrated code or browser.
Runtime implementation was not dispatched by this planning batch.
