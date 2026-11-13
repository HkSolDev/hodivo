# Typing practice team batch — 12 November 2026

## Scope and authority

User authorized implementation with OpenCode free GLM/DeepSeek agents; coordinator reviews and integrates. Execute slices 0–1 of TYPING_APPLICATION_PLAN.md only: practice mode. Database/API/exam mode remain later slices, with rules decided when content is entered. No production, push, merge, dependencies, paid models or credentials.

## Baseline and isolation

Original branch codex/typing-practice-plan at d930a69e0093a440ef5ad99c92a6ab19326cec17 has substantial unrelated staged/unstaged work. Preserved unchanged. Current source files were copied into isolated worktrees, excluding secrets/build output. Snapshot manifest: /private/tmp/typing-baseline-manifest.json. No remote fetch; local snapshot only.
GLM worktree /private/tmp/aptus-typing-glm, branch codex/typing-glm-20261112, baseline 5a49dc683b772547a61fcebbd12766c5549dc075.
DeepSeek worktree /private/tmp/aptus-typing-review, branch codex/typing-review-20261112, baseline e861bdd47a0c7c5897ce6471b84bac1c295d55b7. Identical source bytes; separate commits.
Integration: coordinator takes ownership of GLM worktree after handoff, independently checks there, copies only accepted owned paths back to original branch; no unrelated commits cherry-picked. Separate dependency copies, no writable symlinks. Port 18912 if needed; no database or provider calls.

## Frozen practice contract typing-practice-v1

- GET /typing is public native Next page under existing site shell; footer adds Typing practice link. No root layout/route-group changes needed for practice.
- Server page metadata and no-JS message, focused client session, CSS Modules using current Aptus light/dark tokens. No new packages, storage or API.
- Words (50 random common English words) and Custom text modes; initial render deterministic, randomize only after hydration/user action. Preserve 15/30/60/custom duration seconds. Custom integer duration range 1..3600, reject empty/fractional/NaN/outside range visibly. Custom passage whitespace normalized like source, nonempty, max10000 chars and English printable ASCII plus whitespace; reject unsupported text visibly rather than silently scoring it.
- Real labeled textarea, confined handlers. Standard typing/backspace/delete/selection correction supported. Attempt history retains inserted characters (including corrected errors), deletion does not add attempts. Clipboard paste/drop not scored; block them in typing field with explanation. Ctrl/Cmd shortcuts never count as letters. Composition unsupported: reject visibly, no silent scored composition.
- idle -> running on first accepted insertion; running -> paused on textarea blur/window blur/hidden; explicit Resume returns focus without adding pause time; finish at duration or target length. Restart discards state safely; no timer/listener leak on restart/unmount/Strict Mode. No global navigation key suppression.
- Arithmetic uses performance.now monotonic active elapsed time, capped at duration; check deadline before accepting each edit/submit; interval only refreshes display. Freeze settings during session. Score finishes once, final summary inline (avoid new dialog complexity).
- Preserve source practice formulas: grossWpm=(insertedAttempts/5)/(activeElapsedMs/60000); netWpm=max(0,grossWpm-incorrectAttempts/(activeElapsedMs/60000)); accuracy=correctAttempts/insertedAttempts*100 (100 if zero). Correctness at insertion compares actual position in target. Zero elapsed => speed unavailable; no official qualification claim. Character feedback reflects current final text, distinct from attempt stats. English ASCII counting one char per code unit.
- Input remains only in memory, no telemetry/uploads/localStorage. Render strings as text nodes, never HTML.
- Preserve existing Home/Saved/Profile/auth/footer navigation behavior; fourth mobile tab excluded.

## Frozen acceptance examples

1. target cat: insert c, x, delete x, insert a,t; final cat; four attempts/three correct/one incorrect at6000ms => gross8/net0/accuracy75. Deletion retains error history.
2. 50 correct insertions in60000ms => gross10/net10/accuracy100. elapsed0 => unavailable speed, no infinity/NaN.
3. expired before edit => input not accepted and timer finishes; paused duration not charged; idle blur does not start; restart clears text/history/timer.
4. Empty/whitespace-only custom, noninteger/out-of-range duration, unsupported characters rejected. Literal HTML stays text. Native shortcuts/navigation do not add attempts. Cursor/selection edits compare inserted text at correct positions.
5. Whole lifecycle, restart, pause/resume, custom submission, timer finish, unmount cleanup; light/dark at390/834/1440, keyboard labels/focus, no horizontal overflow; no-JS explanation.

## Ownership and gates

GLM sole writer: app/typing/page.tsx, components/typing/**, lib/typing/**, tests/typing-practice.test.ts (pure/SSR test), components/layout/footer.tsx (one link only), docs/agent-progress/typing-glm.md. Do not edit any other existing file, CI/test runner/config/dependency/contracts/schema/migrations. May add focused files only inside these paths. No commits until coordinator handoff.
DeepSeek initial read-only source/contract review; sole output docs/agent-progress/typing-deepseek-review.md in reviewer worktree. Later independently review GLM diff and run tests, no implementation changes. Coordinator owns independent browser acceptance tests and integration fixes. Agents acknowledge exact baseline/revision/paths before edits and record rationale, alternatives rejected, commands/results, not-run checks and risks. No contract changes without coordinator resolution; user approves disputed product semantics.

## Verification

Existing package test scripts inspected. Pure/SSR: node --import ./tests/css-module-hook.mjs --import tsx --test tests/typing-practice.test.ts. Typecheck pnpm typecheck and pnpm exec tsc -p tsconfig.next.json --noEmit. Lint pnpm lint. Next build pnpm next:build (webpack fallback documented if needed). Coordinator browser harness uses local fixture API only; no .env, credentials or production. Screenshots/actual browser checks separate from code review. Graphify update after integration. All results pending until recorded. Required failures block acceptance; unrelated baseline failures are distinguished with evidence.

## State

Contract frozen; implementation starting. Release not authorized. Handoff, review, integration checks and residual risks recorded below as they occur.

### Coordinator baseline evidence

- Both requested OpenCode free model IDs listed by the installed CLI; sessions GLM `ses_e30bc459effehLsUlNVWskRDqW`, DeepSeek `ses_e30bc31daffeNHFmRTJPeSWvHB`. Initial attachment syntax and external-directory denials resolved using local read-only reference copies and explicit scoped continuation. No paid provider fallback.
- Copied existing generated Prisma output into each isolated worktree before baseline checks; no generation/database calls required.
- Baseline `pnpm typecheck`: fails in existing frontend/profile-api.ts:6 (missing .js import extension).
- Baseline `pnpm exec tsc -p tsconfig.next.json --noEmit`: fails in existing components/results/recommendations-preview.tsx:144 (nullable string passed to string parameter).
- Baseline `pnpm lint`: passes before reference copies (reference code is excluded from final integration).
- Isolated headless Chrome launch works outside the filesystem sandbox. Browser tests will use a temporary profile and local fixtures.
- Frontend Docker build currently omits root lib/; coordinator owns adding COPY for lib/typing if the implementation imports it. This is a build reachability fix, with no API/database semantics change.

### First handoff and independent review

- GLM handed off 15 passing pure/SSR tests and rationale; no code yet integrated into original branch. DeepSeek wrote independent source review and then was assigned focused review of the actual draft.
- Coordinator browser test first failed at /typing404 (expected missing route); draft browser run passed corrected-error history, pause/resume/timer and custom validation/literal HTML. Confirmed failures: selected same-letter replacement drops attempt (3 vs4), 200-character unbroken passage causes390px horizontal overflow. Pure coordinator regression confirms pause-after-deadline remains paused instead of finished.
- GLM re-assigned concrete fixes plus typing-character validation/composition cancellation and accessible validation errors; no scoring-contract change. Coordinator tests remain independently owned.
- Browser test infra uses explicit Node24; unrestricted shell default Node26 caused a stalled test loader. Next one-time upgrade notice required immediate retry; no dependency upgrades performed.
- Test harness corrected to query the visible paragraph inside noscript because Playwright text matching skips noscript elements; the requirement for visible no-JS explanation remains unchanged.
- Review questions resolved from frozen contract: deterministic server/first-client text with immediate post-hydration randomization allowed; normalized custom passage limit10000; summary exposes gross/net/attempt breakdown; Escape behavior not promised. Undo/redo is visibly blocked in typing field, ordinary navigation unaffected. Cut allowed as deletion with no new attempts.

### Second handoff review

GLM completed its assigned fixes and handed off; DeepSeek completed source plus draft implementation review. Coordinator takes ownership of /private/tmp/aptus-typing-review for final integration. User reiterated continuation with both free agents and asked to review plan status; plan section 10 now distinguishes implemented, under review and not started.
Second pure run:21/22 pass. Deadline regression now passes. Additional frozen-behavior regression still fails: replacing ab with aB must count2 inserted characters; the engine still trusts the diff whenever any visible substring changed. Coordinator will fix actual insertion metadata as authoritative and simplify duplicate native/React input paths after reproducing browser results. No scoring semantic revision.
DeepSeek independently flagged the same partial-replacement problem and lingering composition state, as well as keyboard-only undo protection. Coordinator will guard history input types at the input boundary. Enter remains a whitespace attempt (supported ASCII whitespace), not a command to submit; no new exam behavior implied.

### Final verification and reviewer disposition

- Coordinator fixed partial-replacement metadata and replaced duplicate native/React change paths with one onInput path. Removed the 50 ms composition workaround; cancel/commit handled by event data/state. Input types historyUndo/historyRedo rejected.
- GLM’s 20 production/SSR tests plus coordinator 3 regressions pass; combined with existing job-card and isolated page-design browser suite:27/27 pass. Expanded typing browser suite:8/8 pass. Includes same-character and native shared-prefix replacements, corrected typo75%, unsupported direct input, Chromium CDP composition commit, simulated cancel followed by plain key, pause/resume/timer, restart, custom validation/literal HTML, footer round-trip/no-JS,6 theme/width combinations and10000-character passage at390.
- Scoped lint passes. Next typegen passes. Next typecheck reports only unchanged recommendations-preview.tsx:144 nullable error. Final standard webpack build compiles, then fails on that same baseline error. No checks weakened, no unrelated type fix included.
- DeepSeek final static disposition: targeted fixes accepted for practice-only handoff; no app/test/config edits by reviewer. Real OS IME and mobile keyboards remain unrun; coordinator CDP/browser results are separate evidence.
- Screenshots reviewed:390 light and1440 dark. Artifacts stored temporarily under the path printed by browser suite; no generated images added to app.
- Coordinator evidence/decisions: docs/TYPING_IMPLEMENTATION_REVIEW.md. Full release gate remains blocked by existing type errors; no image execution/deployment/DB changes.
- Preserve concurrent unrelated operational-doc edits observed in original checkout. Only accepted owned files will be copied; no snapshot commit from agents is merged into user's branch.

### Integrated local state

Frozen source commit: `d2145375e762f7bdbe51952660c14d4e7af52653` on isolated branch codex/typing-review-20261112. Final sequential combined check against it:35/35 pass.20 accepted files copied into original codex/typing-practice-plan checkout after checking for concurrent conflicts; every copied byte matched frozen source. No original-index staging, reset, branch switch, push or deployment.
Full pnpm lint passes in original checkout; pnpm typecheck still fails at the exact baseline frontend/profile-api.ts:6 extension error. Graphify update completed AST-only,3353nodes/5850edges; optional SQL parser absent, no install attempted. Scoped diff whitespace check passes; global check reports original worker sources.json whitespace, preserved.
Status: practice integrated and locally verified with explicit pre-existing clean-build blocker. Storage/API/exam/release unstarted. Post-freeze changes are documentation-only final evidence, no application-code changes. Remaining limitations are in TYPING_IMPLEMENTATION_REVIEW.md.
