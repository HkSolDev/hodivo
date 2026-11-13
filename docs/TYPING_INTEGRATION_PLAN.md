# Typing practice and exam integration: analysis and plan

Date: 12 November 2026. Branch: `codex/typing-practice-plan`.
Status: analysis only; no typing feature implemented or deployed.

**Planning update:** [Typing application full-stack plan](TYPING_APPLICATION_PLAN.md)
is the current implementation proposal following the later Next.js/React and
database discussions. It supersedes this document's standalone HTML integration
recommendation. Keep this document as the original source audit and findings.

## Confirmed direction

- Bring the existing HTML/JavaScript typing project into Aptus.
- **Practice only:** match Aptus's clean light/dark visual style.
- **Exam:** preserve the dedicated exam appearance and keep it as close to the
  real assessment interface as possible. Do not apply the Aptus visual redesign
  to this screen.
- Preserve the developer's work and framework-free logic. Review correctness
  issues separately from styling; do not silently change scoring semantics.

The current request authorizes understanding, a branch, and a plan. The product
checkpoint describes other active work; this plan does not change its priority
or claim the typing feature is already part of a completed product stage.

## Evidence and limits

Source project: `/Users/mrblackghost/Work/Practice/Keyboard_Typing_test`.
Source HEAD: `a3278163dc4ee7ea3ec15d5f000de4a8f2a6eba4`.
Aptus base HEAD: `d930a69e0093a440ef5ad99c92a6ab19326cec17`.
Analysis uses working files, including Aptus's substantial pre-existing staged
and unstaged changes, rather than assuming those commits describe the whole tree.
Creating the branch preserved those changes; they are not isolated new work.

Read the typing entry pages, controllers, styles, shared logic, passage profiles,
tests and scratch experiments. Traced the Aptus frontend shell, routes, catalogue,
session/workspace, profile, results, saved jobs, CSS tokens, static serving,
frontend build and relevant test structure. Used Graphify for navigation and
checked returned relationships against source.

Ran `node --test scratch/*.test.js scratch/*.test.mjs`: **30 passed, 0 failed**.
Ran direct module probes for passage lengths, corrected-typo scoring, Unicode
evaluation and the legacy WPM function. No source files were changed by probes.

Browser inspection was attempted against the existing typing server, whose
working directory was verified. The browser access host was unavailable.
Visual layout, real keyboard interaction and mobile behavior are therefore
source-inspected, not browser-verified. Real examination rules and passage
provenance were not independently researched in this pass.

## How the typing project works

| Responsibility       | Current files and behavior                                                                                                                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Practice page        | `index.html`, `style.css`: black theme, segmented duration/source controls, live statistics, character display, focus overlay, custom passage and results overlays                                               |
| Practice controller  | `app.js`: creates 50 random words; records printable key events; changes final text on Backspace; starts clock on first printable key; updates every 100ms; finishes on duration or target length; Escape resets |
| Character evaluation | `scratch/evaluate.js`: compares final text positionally and returns character states, counts and completion                                                                                                      |
| Clock                | `scratch/clock.js`: injectable monotonic time, start/stop and pause/resume; practice excludes time away                                                                                                          |
| Practice statistics  | `scratch/calculateStats.js`: combines final-text evaluation with lifetime keystroke counts and the shared exam scorer                                                                                            |
| Shared scoring       | `scratch/scoringEngine.js`: gross speed, error penalty, net speed, accuracy, error percentage and threshold status                                                                                               |
| Word source          | `scratch/words.js`: samples a small English dictionary with replacement                                                                                                                                          |
| Exam document        | `exam-mode/index.html`, `exam.css`: navy header, placeholder candidate card, countdown, passage selection, font controls, vertically split passage/input, action bar and confirmation/results dialogs            |
| Exam controller      | `exam-mode/exam.js`: separate state, first-key start, non-pausing deadline, textarea input, three Backspace policies, clipboard guards, submit and reset                                                         |
| Profiles/passages    | `exam-mode/passages.js`: four presets, one passage per preset, thresholds and policy data                                                                                                                        |
| Learning experiments | `scratch/framework-free.mjs`, `stats.js`, `wpm.js`, probe scripts and tests: includes older alternative implementations; do not copy the whole scratch directory into public assets                              |

Practice flow: keydown -> `typed` plus keystroke `log` -> `evaluate` -> character
spans; clock tick -> `calculateStats` -> live statistics; completion -> results.
Backspace changes final text but leaves the keystroke log intact.

Exam flow: select profile/passage -> textarea keydown -> start deadline/log/policy
checks -> browser edits textarea -> input event updates counters -> manual or
timed submission -> shared scorer -> scorecard. Scoring primarily uses the log,
not a final submitted-text comparison.

## Aptus frontend integration map

| Area                    | Existing path and implication                                                                                                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared shell            | `app/layout.tsx` always adds Header, width-constrained main, Footer and WorkspaceProvider. A nested exam page would inherit this shell.                                                                                               |
| Main navigation         | `components/layout/primary-navigation.tsx`: Home, Saved, Profile/Sign in; mobile CSS fixes a three-column bar to the bottom. Adding a destination requires both navigation and CSS/test changes.                                      |
| Theme                   | `public/css/tokens.css`: system sans, neutral surfaces, spacing/radii, focus and danger tokens; OS-driven dark mode already exists. Reuse these values for practice.                                                                  |
| Global CSS              | Root imports base/layout/navigation/components/catalogue/sign-in/home CSS. Importing either typing stylesheet globally would collide with body, header, brand, button and layout styles.                                              |
| Home                    | `app/page.tsx` validates filters and page; `CatalogueGrid` fetches public jobs from the internal API with no-store; controls preserve search/sort/view in URLs.                                                                       |
| Job detail              | `app/jobs/[id]/page.tsx` fetches the job and renders `JobDetailContent`; current detail fetch uses a 60-second revalidation hint.                                                                                                     |
| Accounts/private data   | AuthBar checks sessions; WorkspaceProvider owns account/profile/results/saved state and stale-request protection. Profile page verifies the session server-side; ProfileAccess also gates client rendering.                           |
| Saved/results           | Saved jobs fetch through validated client API helpers; results are held in workspace memory. Typing needs neither applicant fields nor those APIs.                                                                                    |
| Review fixtures         | Local review providers and sample recommendation/profile views are development-only. Do not treat them as production data.                                                                                                            |
| Two web implementations | Next App Router serves the current frontend; `frontend/app.ts` and Fastify public HTML/static routes also exist. The Fastify static allowlist currently does not serve nested typing assets. Target the Next frontend explicitly.     |
| Container build         | `deployment/frontend.Dockerfile` copies only `public/css` into the build stage, then copies build-stage public assets into runtime. A local-only public folder addition would be missing from the image unless build COPY is updated. |
| Regression coverage     | `tests/next-navigation.test.ts`, `next-frontend.test.ts`, `page-design.test.ts`, public browsing and frontend contract tests already cover parts of navigation, responsive layouts and data boundaries. Extend relevant coverage.     |

## Recommended smallest integration

Keep both modes as separate HTML documents served from `public/typing/` by the
Next frontend. This keeps the existing ES modules and naturally isolates each
document's CSS and window event handlers. No React rewrite or iframe is needed.
Use a regular anchor for entering/leaving these HTML pages so a full document
navigation occurs and old listeners disappear.

Proposed production assets:

```text
public/typing/
  index.html                 practice document, Aptus visual style
  app.js                     existing practice controller, focused fixes only
  style.css                  practice-specific styling using Aptus tokens
  core/                      only live shared modules, no tests/probes/docs
  exam-mode/
    index.html               preserved exam document
    exam.css                 preserved exam styling
    exam.js                  preserved controller, explicit correctness fixes
    passages.js
```

Link Aptus to `/typing/index.html` initially and the practice exam link to
`/typing/exam-mode/index.html`. Do not assume Next serves directory indexes.
If clean URLs are wanted, add explicit redirects/rewrites and verify relative
asset resolution; that is optional, not necessary for the first slice.

Practice can load `/css/tokens.css` and use a small local stylesheet, avoiding
the complete Aptus global CSS bundle. Retain an Aptus home link and an obvious
Exam mode link. Start with one discoverable Typing practice link in Aptus's
existing footer; a fourth primary/mobile tab is a separate navigation decision.

Update the frontend Dockerfile to include `public/typing` at build time. Check
the built image's HTML, JavaScript, CSS and module imports, not just local dev.
Do not expose the source repository or scratch directory through a broad file
server. Keep passage/custom text rendering through textContent.

## Practice visual and interaction brief

- Match Aptus page/surface/ink/muted/focus/danger tokens and light/dark behavior.
- Use Aptus identity and system UI typography; remove the Apple glyph and
  separate Type branding. Use a system monospace stack for passage text/numbers.
- Keep one quiet typing workspace, duration and source controls, and compact
  time/speed/accuracy statistics. Keep the passage visually dominant.
- Preserve 15/30/60/custom durations, Words/Custom text, pause/resume, restart
  and results. Replace browser prompt with a labeled inline duration field.
- Separate idle, running, paused and finished states. Explain when the timer
  starts. Focus belongs to the typing area, not every key pressed on the page.
- Use labeled controls, visible focus, modal focus containment/return, usable
  touch targets, sufficient untyped-text contrast and reduced-motion behavior.
- Wrap controls on narrow screens; avoid forcing a desktop-width header into a
  mobile viewport. A real input is needed for reliable soft-keyboard support.
- Discuss removing practice's Qualified/Disqualified badge: ordinary practice
  should not imply an official examination result. This is a proposed copy and
  behavior decision, not an approved scoring change.

## Exam preservation brief

Preserve the navy header, compact rectangular controls, candidate panel,
manual-scrolling master passage, synchronized A-/A/A+ font sizing, textarea,
countdown urgency states, counters, Backspace policy indicator, submit
confirmation and scorecard. Keep the viewport-filling standalone document.
Do not load Aptus theme tokens or its navigation/footer into the exam document.
Maintain a return link outside the active typing area.

The supplied interface is the visual baseline. A claim of exact fidelity to a
particular examination requires a matching reference for that exam and year.
Preserving this baseline does not independently certify official rules.

## Findings to resolve before public release

| Finding                                                       | Evidence and practical consequence                                                                                                                                               | Proposed treatment                                                                                                                                         |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Passage counters are incorrect                                | Stored/actual chars: CGL 2042/914, CHSL 1765/791, RRB 1538/592, High Court 1890/607. Word counts also differ. UI reads stored charCount.                                         | Derive counts from actual text; separately obtain verified full-length passages.                                                                           |
| Exam rule/source claims are unsupported by supplied citations | Profiles state official cutoffs/policies; passages say previous-year paper without a source URL/document.                                                                        | Verify each named preset and passage before claiming official equivalence; otherwise describe it as a simulation.                                          |
| Scoring measures attempts, including corrected mistakes       | `c x Backspace a t` for `cat` in 6s produces gross 8, net 0, accuracy 75%, error percentage 125%. This follows the current formula.                                              | Decide whether practice should use this metric; freeze exam scoring only after checking its intended rules. Do not silently substitute final-text scoring. |
| Tests partly exercise duplicate code                          | Character-state tests import `framework-free.mjs`; live controllers import `evaluate.js`. WPM tests use stats.js, not the unused wpm.js.                                         | Point behavioral tests at production modules; retain useful experiments outside shipped assets.                                                            |
| Practice intercepts page-wide keys                            | Global keydown accepts `key.length === 1` without modifier/composition checks and does not prevent native Space behavior.                                                        | Scope input handling to the workspace; verify shortcuts, scrolling, focus and IME behavior.                                                                |
| Practice has no editable typing input                         | Focusable spans and global keydown do not reliably summon a mobile keyboard.                                                                                                     | Add a real labeled input/textarea while preserving character rendering.                                                                                    |
| Exam assumes append-only editing but uses a native textarea   | Correctness compares against value.length; cursor movement/selection/Delete/Enter can change text without equivalent logging. Word-lock tracks a buffer rather than caret state. | Decide permitted editing and make input/log/policy consistent; test all three policies without changing the exam appearance.                               |
| Deadline enforcement depends on scheduled callbacks           | Input handlers do not check the deadline themselves; busy/background tabs can delay the interval and scoring uses actual elapsed time.                                           | Test delayed expiry and enforce the chosen deadline at input/submission boundaries.                                                                        |
| Dialog/accessibility gaps                                     | Practice overlays lack dialog semantics/focus management; exam has dialog attributes but no focus trap/return; exam Tab is blocked in textarea.                                  | Fix focus behavior in a separate functional slice, retaining exam visual fidelity.                                                                         |
| Unicode and legacy-module defects                             | `evaluate('a😀b','a😀b')` reports correct total 4 but marks emoji/b incorrectly; unused wpm.js returns 1 for 50 chars/60s.                                                       | Define supported input and align character indexing. Exclude unused legacy code from integration.                                                          |

Clipboard/dev-key restrictions are browser interaction rules, not a secure
anti-cheat boundary. No account history, leaderboard, backend scoring or
collection of typed custom passages is needed for the requested initial feature.

## Implementation slices and acceptance

1. **Freeze baseline and decisions.** Capture desktop/mobile screenshots and
   keyboard behavior once browser access works; record the metric and editing
   rules. Preserve the original project. Verify official claims separately.
2. **Integrate existing HTML.** Copy only live assets, fix import/link paths,
   add an Aptus entry link and include assets in the frontend image. Acceptance:
   direct URLs, refresh, modules, practice/exam/return links work; existing Aptus
   pages retain their styles and behavior; exam matches its baseline.
3. **Style practice only.** Apply Aptus light/dark tokens, responsive controls
   and restrained results. Review the practice screen before broadening polish.
   Acceptance: idle/running/paused/custom/results states at 390/834/1440 widths,
   both themes, keyboard focus and reduced motion; exam visual baseline unchanged.
4. **Correct agreed functional issues.** Extend the relevant existing core tests
   and add focused browser coverage for input, policies, timer and dialogs.
   Acceptance: corrected counts, reproducible scores, no shortcut pollution,
   consistent editing, expiry, restart and navigation; no unrelated refactor.
5. **Verify release artifact.** Run typing tests, relevant frontend regressions,
   typecheck/lint and frontend build. Check the container's static assets and
   route responses. Deployment remains a separate authorized operation.

No implementation, dependency installation, source-project edits, commits,
pushes, server changes or deployment occurred in this analysis pass.
