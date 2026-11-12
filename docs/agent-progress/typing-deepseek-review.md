> Coordinator note: this file preserves the agent’s dated review/handoff stages. For the final source changes, observed test results and unresolved build limits, see [the implementation review](../TYPING_IMPLEMENTATION_REVIEW.md). Later coordinator fixes supersede earlier draft descriptions.

# Typing practice — independent correctness and accessibility review

Date: 12 November 2026
Reviewer: DeepSeek (independent read-only reviewer)
Status: source/contract review complete; no implementation or browser acceptance run

## Acknowledgement

- Baseline: `e861bdd47a0c7c5897ce6471b84bac1c295d55b7` in `/private/tmp/aptus-typing-review`.
- Branch/worktree: `codex/typing-review-20261112`; this worktree only.
- Frozen contract: `typing-practice-v1` in `docs/AGENT_COORDINATION_2026-11-12-typing.md`.
- Owned output: `docs/agent-progress/typing-deepseek-review.md` only. I did not edit application, test, config, contract, dependency or coordinator files. I did not commit, push, merge, deploy, install packages, call providers, use credentials or production, or run other agents.
- Source authority: `reference-typing/` is the read-only copy of `/Users/mrblackghost/Work/Practice/Keyboard_Typing_test`. `docs/TYPING_INTEGRATION_PLAN.md` was used as context only; source code was checked directly.
- Scope: practice mode only. Exam mode and official examination rules are excluded. No official-rule claim is made here.

At the start of this review there were no `app/typing`, `components/typing`, `lib/typing` or typing test files in the worktree. This document is therefore a source/contract review plus an independent browser-check plan, not acceptance of a GLM implementation. Untracked `lib/typing`, `tests/typing-practice-*.ts` and a `next-env.d.ts` change appeared later from concurrent work; they are outside my ownership, were not read as part of this review, and were not modified by me. If they are the GLM handoff, reviewing them is the separate follow-up step.

## Evidence inspected

- Source: `reference-typing/app.js`, `index.html`, `style.css`, `scratch/{evaluate,clock,calculateStats,scoringEngine,stats,words}.js`, `scratch/framework-free.mjs`, and the source tests.
- Aptus: `app/layout.tsx`, `components/layout/footer.tsx`, `public/css/{tokens,base,layout,components}.css`, `package.json`, `next.config.ts`, `tests/css-module-hook.mjs`, `tests/next-navigation.test.ts`, `tests/page-design.test.ts`, and the installed Next guide `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`.
- Contract and rules: `Agents.md`, `.cursor/rules/aptus-coding-safety.mdc`, `docs/CODING_STANDARD.md`, `docs/AGENT_CONTRACT_PROTOCOL.md`, `docs/contracts/README.md`, and the typing batch record.

Commands actually run:

```text
git rev-parse HEAD
node --test reference-typing/scratch/*.test.js reference-typing/scratch/*.test.mjs
node --input-type=module -e '<calculateStats/evaluate probes>'
node -e '<WCAG relative-luminance contrast calculations>'
```

Results:

- Source suite: 30 passed, 0 failed. These tests exercise pure modules, not `app.js`, keyboard/selection behavior, deadline enforcement, hydration or layout.
- Correction probe: `calculateStats('cat', [c,x,a,t], 6000, 'cat')` produces `gwpm: 8`, `nwpm: 0`, `accuracy: 75`, `errorPercentage: 125`, and an official `Disqualified...` status string. This matches the frozen acceptance arithmetic but also shows source UI text that must not be carried into practice.
- Zero-elapsed probe: source scoring returns `null` speeds but source `finishTest` converts them to `0` for display. The contract requires speed to be unavailable.
- Unicode probe: `evaluate('a😀b', 'a😀b')` reports `correct: 4` while marking the emoji and following character incorrect. This confirms the code-unit/index mismatch described in the integration audit.
- Contrast probe (sRGB relative luminance, not a full audit): source untyped/current `#3a3a3c` on `#000000` is `1.85:1`; Aptus light `--muted` is `6.26:1` on `--surface` and `5.75:1` on `--page`; dark `--muted` is `7.79:1` on `--surface` and `8.87:1` on `--page`. Source untyped text fails even the 3:1 large-text threshold.

Not run: any browser check against a typing implementation (none exists at baseline), native IME/clipboard/visibility probes, the GLM test suite/diff, implementation typecheck/lint/build, database tests, production, or network-facing checks.

## Aptus integration facts that constrain the port

| Fact | Evidence | Consequence |
| --- | --- | --- |
| `/typing` inherits the root shell | `app/layout.tsx:31-61` always renders Header, `<main className="page-width">`, Footer, SkipLink and WorkspaceProvider | The page must fit the existing width/gutters and must not add a second navigation or global CSS |
| The design system is OS-driven light/dark tokens | `public/css/tokens.css:1-75`; dark values under `prefers-color-scheme` at line 49 | Typing CSS must consume tokens, not the source black palette; both schemes need checking |
| Footer currently has one link | `components/layout/footer.tsx:3-9` | The allowed footer edit is exactly one `/typing` link; mobile navigation remains three links |
| Existing no-JS/footer regression | `tests/next-navigation.test.ts:218-238` checks the footer above the fixed mobile navigation with JavaScript disabled | Adding a link must not break the footer/mobile-nav spacing or existing link name |
| Next 16 App Router separates server/client | Installed Next server/client-components guide | `app/typing/page.tsx` should stay a server page for metadata/no-JS, with a focused client child for the session |
| Tests import CSS modules through a proxy hook | `tests/css-module-hook.mjs:1-12` | Pure/SSR logic must not require a browser DOM at import time |
| Baseline has no typing route | directory inspection at `e861bdd...` | Every browser check below is proposed, not executed |

## Confirmed source findings

These are confirmed by reading and probing the source. They are not claims about the GLM implementation. The right-hand column explains why the frozen practice contract makes each one a likely porting hazard.

### Input, editing and scoring

| ID | Confirmed source behavior | Contract requirement | Risk if copied |
| --- | --- | --- | --- |
| S1 | `app.js:238-281` attaches a window keydown handler. It treats any `e.key.length === 1` as typing, with no `ctrlKey`, `metaKey`, `altKey`, `isComposing` or repeat guard. It only exempts events whose target is `INPUT`/`TEXTAREA` (`238-245`). | Real labeled textarea; confined handlers; standard editing; Ctrl/Cmd shortcuts never count; composition rejected visibly. | Ctrl/Cmd+letter, Alt shortcuts, Space on a button and IME input can become scored characters. Space can also activate a control and scroll the page. |
| S2 | Practice has no text input. `index.html:44` is a focusable `<div>`; `typed` is a string, Backspace does `slice(0, -1)` (`app.js:262-266`), and Delete/selection/caret movement are not handled. | Standard typing, Backspace, Delete and selection correction in a real textarea. | A port that keeps "append at end" cannot edit in the middle; selection replacement will corrupt text or attempts. |
| S3 | Correctness is decided at the end position: `app.js:276` compares `e.key` with `target[typed.length]`. | Correctness at insertion compares the character actually inserted at its real position. | Middle insertions and selection replacements would be scored against the wrong target character even if final text looks right. |
| S4 | The paste guard (`app.js:51-56`) explicitly allows paste into `TEXTAREA`/`INPUT`. | Paste and drop in the typing field are blocked with an explanation. | If the typing field is a textarea and this guard is reused, paste is allowed and can bypass attempt accounting. |
| S5 | The deadline is checked only by the 100 ms display interval (`app.js:59-87`, finish at `84-85`); the keydown handler accepts edits without checking elapsed time. | Check the deadline before accepting each edit/submit; the interval only refreshes display. | A delayed timer callback (busy tab, throttling) can allow an insertion after expiry. |
| S6 | Pause is triggered only by window blur/visibility (`app.js:36-39`). Any key while the overlay is visible calls resume and then continues into the same keydown handler (`app.js:42-47`, `238-281`). | Running -> paused on textarea blur/window blur/hidden; explicit Resume returns focus without adding pause time; idle blur does not start. | The resume key can also be scored, and Tab/clicking a control can leave the timer running or create a confusing overlay state. |
| S7 | Duration and source buttons reset the session at any time (`app.js:208-235`); the custom duration uses `prompt` and `parseInt` and activates the button before validation. | Replace the prompt with a labeled inline field; reject invalid values visibly; freeze settings during a session. | Mid-session clicks can wipe the run; `3.5`, `45abc`, `0` or cancel are silently coerced or ignored. |
| S8 | The target is randomized at module load (`app.js:8`); reset randomizes again (`app.js:146-151`). | Initial render deterministic; randomize only after hydration/user action. | A client component using this module-level random value will server-render one passage and hydrate another, causing mismatch or a visible target swap. |
| S9 | Source attempt scoring is correct for gross/net/accuracy, but the UI also surfaces `Qualified`/`Disqualified`, error percentage and a 35 WPM/5% threshold (`app.js:123-133`; `scoringEngine.js:57-69`). `finishTest` turns null speed into `0` (`app.js:100-104`), and elapsed time is not capped at the selected duration. | Preserve gross/net/accuracy; zero elapsed means speed unavailable; no official qualification claim; cap active elapsed at duration. | Practice could imply an official result, show `0` as a real speed, or compute scores from an overrun. |
| S10 | `evaluate` iterates `typed` by code units but expands `target` with `[...target]` (`evaluate.js:6-24`). | Custom text is English printable ASCII plus whitespace; unsupported text is rejected visibly. | If validation misses a non-ASCII character, character states and correctness drift. The contract's ASCII rule is what keeps one code unit per character. |
| S11 | Custom text only trims and collapses whitespace (`app.js:190-196`). It accepts Unicode, arbitrary length and literal HTML; rendering uses `textContent` (`app.js:294-297`). | Whitespace normalized like source; nonempty; maximum 10000 characters; ASCII printable plus whitespace; reject unsupported visibly; render as text, never HTML. | A direct port accepts 10001 characters, emoji or curly quotes and silently scores them. The `textContent` behavior is correct and should be preserved for valid literal HTML. |
| S12 | No real labeled input exists; the focus overlay, custom sheet and results card are plain `<div>`s (`index.html:44-105`). No `<noscript>` explanation exists. | Real labeled textarea; no-JS message; inline final summary; explicit Resume focus. | Copying the markup leaves keyboard/screen-reader users without an input or an accessible resume/summary. |
| S13 | Character state is mostly color. Untyped and current are both `#3a3a3c` on black (`style.css:9`, `180-198`), giving `1.85:1`; current adds only a blinking left border. | Aptus tokens; sufficient untyped contrast; visible focus and keyboard labels. | Low-contrast untyped text and color-only state make the exercise hard to use; the blinking infinite caret needs reduced-motion handling. |
| S14 | Reset clears the interval and creates a new clock (`app.js:139-165`), but does not hide the focus overlay. Global listeners are attached once at module scope. | Restart discards state safely; no timer/listener leak on restart/unmount/Strict Mode. | A React port needs explicit effect cleanup; a direct event/interval port can double-handle keys or leave stale updates. |
| S15 | The 30 source tests pass, but they do not exercise `app.js`, caret/selection behavior, deadline-at-edit, hydration or CSS. The audit also notes duplicate pure implementations (`framework-free.mjs` vs `evaluate.js`). | Independent behavior checks, not implementation-owned assertions alone. | Green source tests do not prove the integrated page or the frozen acceptance cases. |

### UI and integration

| ID | Confirmed source behavior | Contract consequence |
| --- | --- | --- |
| S16 | Source styles reset `*` margin/padding and make `body` a black flex container with `overflow-x: hidden` (`style.css:20-44`). | These cannot be imported globally into Aptus. The typing page must use scoped CSS Modules and tokens. |
| S17 | Source page metadata is only the original `<title>Type. — Minimalist Typing</title>`; there is no no-JS explanation (`index.html:1-115`). | The Next page needs server metadata and a no-JS message, with the existing site shell intact. |
| S18 | Results are shown in a modal and the status pill claims qualification (`index.html:67-105`). | The frozen contract asks for an inline final summary and no official qualification claim. |
| S19 | Source starts the clock on the first printable key (`app.js:269-270`) but also accepts Space/Enter-like native behavior from any focus target, including buttons. | A "real input" port must start only on an accepted insertion and must not turn control activation into text. |

## High-probability integration risks

These are predictions about a source-derived React port, not confirmed defects in an unseen GLM diff. They are ordered by the chance of a user-visible failure.

| Risk | Why it is likely | First thing to inspect in the GLM diff |
| --- | --- | --- |
| R1 Scoped input becomes dual-update | A controlled textarea plus a keydown-to-state port can apply the same character twice or force the caret to the end. | Which event owns text state (`onChange`/`beforeinput` vs keydown), whether keydown calls `preventDefault`, and whether `value` is controlled. |
| R2 No caret/selection model | Source only has append/slice; adding a textarea does not by itself define insertion positions or attempt logging. | Diff calculation between prior and next text, selectionStart/selectionEnd, and where correctness is evaluated. |
| R3 Accurate final text, wrong stats | It is easy to compute accuracy from final text or to discard corrected errors from history. | Attempt log shape and whether `incorrectAttempts` survives deletion; accepted example 1 must remain 4/3/1. |
| R4 Deadline and pause copied as listeners | Source's timer-centric design and "any key resumes" behavior are easy to translate literally. | `performance.now` use, deadline check inside the edit path, cap at duration, blur/visibility transitions, and resume focus. |
| R5 Hydration mismatch | `getRandomWords` at module scope is a direct SSR landmine. | Any `Math.random`/`Date`/`window` at module scope or in state initializers; server HTML vs hydrated text. |
| R6 Source CSS leaks or dark-only styling | Copying `style.css` or hard-coded colors breaks the Aptus shell and light mode. | CSS module boundaries, use of `var(--...)`, absence of global selectors, and computed colors in both schemes. |
| R7 Accessibility regressions | Source has no label, overlay dialog semantics or focus management, and color-only states. | Label/`aria-describedby`, resume control, focus return, summary placement, focus-visible styles and reduced-motion CSS. |
| R8 Weak custom validation | The source prompt/`parseInt` and trim-only custom text do not meet the frozen bounds. | Inline field labels, error rendering, ASCII/max/empty checks, normalized target, and no native `prompt`. |
| R9 Paste/IME/shortcut leakage | Source's guards are global and allow textarea paste; composition and modifiers are unchecked. | `isComposing`, modifier guards, `onPaste`/`onDrop` prevention, and `beforeinput` inputType handling. |
| R10 Official-result copy | Source results card includes qualification/error-percentage concepts. | Any `Qualified`, threshold, error percentage or official-sounding copy in the practice UI. |
| R11 Settings change mid-session | Source control handlers always call reset. | Disabled/frozen controls while running; no target or duration change without an intentional restart. |
| R12 Cleanup and Strict Mode | A React port can add a second interval or window listener in development. | Effect cleanup, refs used by the interval, restart reset, and one-char-after-remount evidence. |
| R13 Footer/nav regressions | The footer is covered by an existing no-JS mobile test; a broad layout change could break it. | Only one `/typing` link added; no root layout/navigation edit; existing tests unchanged. |
| R14 Server/client boundary mistake | A page-level `'use client'` cannot export metadata and may hide the no-JS message. | Server page + focused client child, metadata export, and HTML response before hydration. |

## Proposed independent browser checks

These checks are independent of GLM's own tests. Use the exact handoff build, an isolated port, and local auth fixture responses; do not use `.env`, a database, paid providers or production. Capture `pageerror` and console errors/warnings for every check. Where a check needs a controlled clock, use Playwright's clock API after the page is hydrated; if that cannot control `performance.now` reliably, treat the exact value as not run and use the relational checks rather than claiming a pass.

### B1 — Server HTML, metadata, no-JS and hydration

- Fetch `/typing` directly: expect HTTP 200, a server-rendered heading/description, title/description metadata, and a visible explanation when JavaScript is disabled.
- Load the built page twice in fresh contexts. The initial passage must be the same deterministic text in both loads and must equal the text present in the server HTML. Under the frozen wording, randomization should follow a user action, not module evaluation.
- Open the page with JavaScript enabled: no hydration error, no `pageerror`, no Server/Client boundary warning, and no target swap before a user action.
- Use a `javaScriptEnabled: false` context and confirm the footer `/typing` link works and the no-JS message is readable. Do not require the typing session to work without JavaScript.
- Record whether an effect immediately randomizes after hydration. The contract wording ("after hydration/user action") is ambiguous; report the observed behavior and ask the coordinator rather than deciding it here.

### B2 — Shell, footer and responsive regression

- At 390, 834 and 1440 widths, verify the Header, SkipLink, main width and Footer remain intact; no horizontal overflow (`scrollWidth <= innerWidth`) in idle, running, paused, finished and custom-error states.
- Verify the footer contains exactly one new `/typing` link with a usable accessible name and that Home/Saved/Profile behavior and the three-link mobile navigation are unchanged. Check the footer still clears the fixed mobile navigation, matching `tests/next-navigation.test.ts:218-238`.
- Visit `/` and `/how-it-works` after `/typing`; computed body/header/footer styles must be unchanged. Any global `*`, body, header or button override is a finding.

### B3 — Real input, labels and keyboard reachability

- Locate a real textbox (`getByRole('textbox', { name: ... })`) inside the typing workspace; it must be visible, labeled and focusable. Focus must not be trapped in the document.
- Tab from the skip link through the page: every control and the typing field must be reachable in logical order with a visible focus indicator. Check the typing field is not `readOnly`/`disabled` while idle or running.
- With the typing field focused, type one target character: the field value contains it exactly once, the target state updates, and the timer starts. Clicking outside the field must not enter text.
- With a control button focused, press Space and Enter while idle: the control activates, but no space/letter attempt is added and no session starts. This directly tests the source's global-handler hazard.
- Verify the summary is inline (not a modal/dialog) and remains in reading order; verify an explicit Resume control is reachable and returns focus.

### B4 — Corrections, selection, Delete and attempt history

Use a custom target `cat` (custom text mode) and a controlled clock only where exact arithmetic is needed. Keep character feedback and summary stats separate.

1. Correction example: type `c`, `x`, Backspace, `a`, `t`, advancing fake active time to exactly 6000 ms at the final `t`. Expected: textarea value `cat`; passage characters all correct; four inserted attempts (three correct, one incorrect); gross `8`, net `0`, accuracy `75%`; no official qualification text. This is the frozen acceptance example and catches final-text-only scoring, deletion-as-attempt, and wrong gross denominators.
2. Middle insertion: fresh target `cat`; type `c`, `t`; press Home then ArrowRight (caret at index 1); type `a`. Expected final value `cat`; the `a` is scored at position 1; attempts are three (two correct, one incorrect); accuracy is `66.67%` (displayed `67%` if rounded). A naive append produces `cta` or mis-scores the insertion.
3. Selection replacement: fresh target `cat`; type `c`, `x`, `t`; move Home, ArrowRight, then Shift+ArrowRight to select `x`; type `a`. Expected final value `cat`; attempts are four (three correct, one incorrect); accuracy `75%`; the deleted `x` remains in history but is not an extra attempt. This distinguishes protected attempt history from final-text scoring.
4. Boundary editing: type `c`, Backspace; the field empties and attempts remain one (deletion adds none). Type `c` again; attempts become two, accuracy remains 100%. Move Home, press Delete; the `c` is removed with no new attempt. Movement/Delete at the end must not add attempts.
5. Finish boundary: type exactly the target; the summary appears once. Press another printable key and Backspace; value, attempts and summary must not change. Right after restart, one key must produce exactly one attempt (Strict Mode/listener check).

### B5 — Shortcuts, navigation keys and native control behavior

- Idle and running: pressing Control/Meta/Alt/Shift alone, Arrow keys, Home/End, PageUp/PageDown and Tab must not add attempts or insert characters. Tab must move focus (subject to the pause rule), not be globally trapped.
- Focus the typing field and press Ctrl/Cmd+A, C, V, X and Z. None may be counted as a letter or start a session; clipboard paste is checked separately in B6. If undo/redo changes text, record the behavior and check that it does not corrupt attempt history; undo semantics are not frozen.
- With the typing field focused, press Space; it must insert a space if the target expects one, not scroll the page or activate a distant button. With a button focused, Space must activate only the button (B3).
- Record Escape behavior. If Escape restarts, it must fully reset; if it does nothing, it must not leave a paused/stale state. The contract does not freeze Escape, so do not fail the build for either deliberate behavior without coordinator guidance.

### B6 — Paste, drop, composition and literal HTML

- With clipboard permissions, write `zzz` to the clipboard, focus the typing field and press Ctrl/Cmd+V. The value and attempts must not change, and a visible explanation must say paste is not scored. Also dispatch a real `paste` event with `clipboardData` to cover implementations that only guard keydown.
- Drag text over the typing field and drop it (or dispatch a `drop` with `DataTransfer`). The value and attempts must not change; the explanation must be visible. Note that synthetic drop is weaker evidence than a headed-browser drag.
- Use CDP `Input.imeSetComposition`/`Input.insertText` (or a headed browser) to compose `é` or an emoji while focused. The value and attempts must not change and a visible unsupported-composition message must appear. A synthetic `compositionstart/update/end` check is a fallback, not equivalent to native IME; if native IME is unavailable, mark it not run.
- In custom text mode, apply literal `<b>cat</b>` (all printable ASCII). The passage must show the angle brackets as text, no `<b>` element may be created in the passage, and no image/script request may be triggered. If `<`/`>` are rejected as unsupported, that contradicts the frozen "literal HTML stays text" acceptance example and is a finding.

### B7 — Custom duration and custom passage validation

- Clicking Custom must open a labeled inline field, not a native `prompt`. Assert no browser dialog event occurs.
- Attempt `''`, whitespace-only, `3.5`, `0`, `-1`, `3601`, `abc`, `1e2`, `Infinity` and `NaN`. Each must be visibly rejected and must not start a session or silently reuse a different duration. Verify `1` and `3600` are accepted and displayed as the initial duration.
- Custom passage: empty/whitespace-only is visibly rejected; `é`, emoji, curly quotes, em dash and zero-width characters are visibly rejected; 10000 printable ASCII characters are accepted and 10001 are rejected. Confirm whitespace normalization matches source: leading/trailing whitespace removed and internal runs (including newlines/tabs) collapse to one space.
- The 10000 limit is ambiguous for text that shrinks or grows after whitespace normalization. Record whether the implementation checks before or after normalization; ask the coordinator to confirm rather than changing the contract.
- Applying a custom passage while idle updates the target without starting the timer. While running, settings must be frozen: duration/source/custom changes must not alter the active session without an intentional restart.

### B8 — Frozen scoring examples and zero elapsed

- Example 1: use the exact correction sequence in B4.1 with 6000 ms active time; assert gross 8, net 0, accuracy 75, attempts 4/3/1. Also assert no `Qualified`/`Disqualified`, no 35 WPM/5% threshold and no official-result claim.
- Example 2: use a 100-character printable custom target; type the first 50 target characters correctly while advancing active time to 60000 ms, then let the duration finish. Assert gross 10, net 10, accuracy 100 and attempts 50/50/0.
- Zero elapsed: with a frozen clock, use a one-character target; insert that character so the session finishes at active elapsed 0. The speed must be shown as unavailable (text/dash), not `0`, `Infinity` or `NaN`; accuracy must be 100%.
- Character feedback must reflect final text. In example 1 the passage must show `cat` as correct while the summary still reports the one incorrect insertion.

### B9 — Deadline at edit, finish-once and duration cap

- Start a one-second session and advance the fake clock past one second. The timer must finish at the selected duration, show elapsed time no greater than the duration, and never show negative time. Further insertions must do nothing and the summary must not update again.
- Deadline-at-edit cannot be fully proven from a normal timer run because the interval finishes first. Independently, inspect the handoff code for an elapsed/deadline check in the edit path before state mutation. If a controlled harness can advance active time without firing the interval, send a key after expiry and verify no mutation. Mark this not run if the harness cannot do it; do not claim it from a normal expiry test.
- If the implementation exposes a manual Finish/Submit control, activate it after expiry and verify one finish, capped elapsed and no extra attempt. If no such control exists, record that the contract's "submit" wording has no matching UI operation.

### B10 — Pause, resume, idle blur and frozen settings

- Exact pause accounting: use a 10-character custom target (`aaaaaaaaaa`) and a 60-second duration. Type five characters while advancing active time to 3000 ms; blur the field/window; advance 10000 ms while paused; activate Resume; type the remaining five characters over 2000 ms active. Expected final summary: active duration 5 s, gross 24, net 24, accuracy 100. If the pause was charged, the duration/scores will be visibly wrong.
- While paused, the countdown display must freeze. Activating Resume must return focus to the typing field, add no attempt, and not charge paused time. A letter key while paused must not silently resume-and-score if the contract requires explicit Resume; record the actual behavior and flag a mismatch.
- Idle blur must not start the clock. Blur before the first insertion, advance time, Resume, then type; the summary/remaining time must count only active typing time.
- Start a session, then try each duration/source/custom control. The active target/duration must not change mid-session; controls may be disabled or visibly explain that a restart is required.
- Test window blur and document hidden with a headed browser or CDP if available. Verify paused time is not charged and Resume restores focus. Mark this not run if visibility cannot be simulated faithfully.

### B11 — Restart, unmount and listener/timer cleanup

- Start a session, type a few characters, then Restart. Expect empty text, cleared attempt history, reset timer display, no visible summary and a new session that starts only on the next accepted insertion. Record whether a custom passage persists or a new random word set appears; the contract does not freeze that target choice, but stale state must not survive.
- Finish a session, restart, and verify the old summary/stat updates cannot reappear after waiting.
- Start, navigate away using a normal header/footer link, then return. The link must not be suppressed; no console/page error or stale timer may remain; the first insertion in the new session must count once.
- If a development build with Strict Mode is available, type one character after mount and verify exactly one attempt, then restart and repeat. Do not claim Strict Mode coverage from a production build.

### B12 — Theme, contrast, focus and responsive accessibility

- At 390/834/1440 in both light and dark (`emulateMedia({ colorScheme })`), check no horizontal overflow in idle, running, paused, finished and error states. Include a 10000-character unbroken custom target and verify wrapping rather than overflow.
- Verify the page uses Aptus tokens: light body/page colors must match the token values, dark must switch, and the source black theme must not persist. Measure contrast of correct, incorrect, untyped and current states against their actual backgrounds; use WCAG AA (4.5:1 normal, 3:1 large) as the review criterion. The confirmed source untyped ratio (1.85:1) must not survive the port.
- Current insertion point must be visible at middle positions and during selection, not only at the end. State must not rely on color alone: check a non-color cue for current/error states, and verify the caret/current indicator is static or harmless with `prefers-reduced-motion: reduce`.
- Check accessible names for duration, source, custom text, restart/resume and the typing field; errors must be visible and programmatically associated (`aria-describedby`, `role="alert"` or an existing status pattern). Do not accept a timer/stat region that announces every 100 ms; live announcements should be limited to meaningful pause/finish/error events.
- Check computed touch targets. Aptus uses `--target: 2.75rem`; interactive controls should not inherit the source's very small pill buttons without review.
- Verify summary is inline, has a heading/status, is not focus-trapped, and does not rely on a modal. Check the footer link and typing page at 390 with keyboard focus.

### B13 — Privacy, storage and text injection

- After typing illustrative text, inspect `localStorage`, `sessionStorage`, cookies and IndexedDB: no typed passage or attempt data may be stored.
- Record network requests made after a session starts; no request body/URL may contain the typed text, and no telemetry/upload request may be introduced.
- Apply literal HTML as in B6 and confirm no element execution, no attacker-controlled image/script request, and no HTML injection. The expected representation is text nodes.

### B14 — Non-browser handoff gate

- `git diff --name-status <baseline>..<handoff>` may contain only the GLM-owned paths plus this review file: `app/typing/page.tsx`, `components/typing/**`, `lib/typing/**`, `tests/typing-practice.test.ts`, `components/layout/footer.tsx` (one link only), `docs/agent-progress/typing-glm.md`.
- No changes to root layout/navigation, contract artifacts, lock files, CI, test runner, existing tests, dependencies, Prisma/generated files, `.env` or deployment files. No `any`, `@ts-ignore`, `eslint-disable`, unsafe casts or weakened assertions.
- Verify the server page/client split and that the pure logic module has no browser globals at import time. Then run the coordinator's frozen build/type/lint/test commands against the exact handoff commit; browser checks are separate evidence.

## Contract interpretation questions for the coordinator

I did not revise the contract. These are observable ambiguities that should be resolved before a pass/fail decision:

1. "Initial render deterministic, randomize only after hydration/user action": does this require the same initial passage across fresh loads, or only server/client equality with randomization allowed immediately after hydration? B1 records both.
2. Is the 10000-character custom-text limit applied before or after whitespace normalization? A 10001-character input with collapsing whitespace can pass one interpretation and fail the other.
3. Must gross/net/attempt breakdown be displayed in the inline summary, or only computed with accuracy/time visible? B8 assumes the frozen examples are observable in the UI.
4. Escape, undo/redo and cut are not explicitly frozen. B5 records them; the coordinator should decide whether any behavior is required rather than inferring it from the source.

## Honest limits

- No typing implementation existed at the reviewed baseline, so none of the proposed browser checks were executed. Source probes are Node-level evidence, not browser evidence.
- The source project was read from `reference-typing/` only; I did not modify it. I did not run its browser UI or a real IME.
- Native composition, clipboard, drag/drop and page-visibility behavior can be simulated only approximately in headless Chromium. CDP/headed-browser checks are stronger; if unavailable, they must be reported as not run.
- Exact clock values depend on the test harness controlling `performance.now` and timers. If it cannot, exact arithmetic should be verified independently against the production pure functions and the browser check should assert only robust relations (attempt/correct counts, net 0, accuracy 75).
- Green source tests prove only the pure modules they import. They do not prove React state, DOM editing, deadline enforcement, hydration, or accessibility.
- No production, database, provider, credential, dependency-install or deployment path was used.

## Decision and handoff record

- Decision: write only this review file and stop. Implementing browser tests or app changes now would exceed the read-only assignment and could not target an implementation that does not exist.
- Rejected alternatives: copying source unit tests into the Aptus tree (would not test integration), editing source issues in the worktree (not authorized), treating the integration plan as current code evidence (source is authority), and relying on GLM's tests as independent evidence (they are implementer-owned).
- Exact file changed: `docs/agent-progress/typing-deepseek-review.md`.
- Checks completed: baseline/worktree inspection, source code audit, 30 source tests, direct scoring/Unicode probes, contrast calculations, Aptus/Next inspection.
- Checks not run: all browser acceptance checks above, implementation checks, native IME/visibility checks, the concurrently added `lib/typing`/typing tests, and any production/deployment check.
- Next step: coordinator sends the GLM diff. I will independently review the exact handoff against this risk list and the frozen acceptance examples, without changing the implementation or protected artifacts.

## Implementation review addendum — current draft

Scope: static review of the current untracked draft and its tests on 2026-11-12. I did not run the browser, a build, or the test suite, per the workspace restriction. The source review above remains the baseline for product limits; this addendum records integration blockers found in the draft.

### Release blockers (confirmed by static trace)

1. **A cancelled composition loses the next normal keystroke.** `handleCompositionEnd` sets `compositionEndedRef.current = true` unconditionally (`components/typing/typing-practice.tsx:202-208`). If composition ends without a following change event, the flag remains set; the next ordinary change is rejected and cleared in `handleTypingChange` (`typing-practice.tsx:162-180`), so that key is not inserted and no attempt is recorded. The new browser case at `tests/typing-practice-browser.test.ts:137-151` cannot pass with this path. Clear the flag when composition ends/cancels or make the rejection depend on the actual event, not a lingering one-shot flag.

2. **Unsupported direct input is accepted and scored.** The change handler only checks composition refs; `session.applyEdit` accepts any string (`lib/typing/session.ts:106-156`). The custom-passage validator is not applied to typed input (`lib/typing/custom-input.ts:12-30`). `insertText('é')`, an emoji picker, voice/autofill, or another non-key insertion can therefore add attempts, change the rendered text, and potentially finish the session. The test at `tests/typing-practice-browser.test.ts:141-143` correctly expects `é` to be rejected, but the current code cannot satisfy it. Validate the inserted text for each edit (and prevent `maxLength` surprises) without relying on keyboard events.

3. **Blur after the deadline pauses instead of finishing.** `handleTypingBlur` calls `session.pause()` (`typing-practice.tsx:240-245`), but `pause()` does not evaluate the deadline (`lib/typing/session.ts:158-162`); deadline handling exists only in `applyEdit` and `tick` (`session.ts:93-104`). After a delayed tick or hidden tab, a blur can leave `status === 'paused'` with `elapsedMs` capped at `durationMs` instead of finishing with `finishedReason === 'duration'`. `tests/typing-practice-regression.test.ts:5-16` exposes this and cannot pass as written.

4. **Selection replacement is still ambiguous beyond the known identical-character case.** `diffEdit` walks the common prefix and suffix and returns only `next.slice(start, nextEnd)` (`lib/typing/session.ts:198-215`); an empty `inserted` string is treated as deletion-only (`session.ts:119-129`). The known case is replacing `c` with `c`. The same bug also affects replacements that share a prefix/suffix: for example, previous `abc`, select `bc`, type `b`, final `ab` is indistinguishable from deleting `c`, so the replacement insertion is not counted. A special case for identical replacement alone will not fix this. The test at `tests/typing-practice-browser.test.ts:97-105` should be extended with shared-prefix and suffix cases; consider tracking the edit intent at the input boundary instead of inferring it only from final text.

5. **Long unbroken passages still overflow.** `.word` is `display:inline-block` and `.space` uses `white-space:pre` (`components/typing/typing-practice.module.css:89-96`) with no `overflow-wrap`/`word-break`; the 200-character case at `tests/typing-practice-browser.test.ts:153-166` therefore cannot guarantee no horizontal page overflow at 390px. This matches the coordinator-reproduced failure. Verify a 10000-character unbroken custom passage at 390/834/1440 in both themes after the fix.

### Additional confirmed code risks

- **Enter/newline is accepted and scored.** `handleTypingKeyDown` only guards undo/redo (`typing-practice.tsx:210-224`), and `applyEdit` counts every inserted code unit (`session.ts:139-154`). A textarea Enter changes the final text and can count as an incorrect attempt. The contract does not freeze this explicitly, so the coordinator should decide: block Enter or document it; either way add a regression test.
- **Undo/redo protection is keyboard-only.** The handler blocks Ctrl/Cmd+Z/Y (`typing-practice.tsx:210-224`), but context-menu/browser-menu undo/redo and `historyUndo`/`historyRedo` input types are not intercepted. `onChange` cannot distinguish them, so attempt history can be rewritten. It also returns early while composition is active. Add a test at minimum; use an input-boundary guard if score integrity is required.
- **Multi-character insertion can overshoot the target.** Because `applyEdit` accepts arbitrary `nextText`, a direct insertion longer than the remaining target is logged and can finish the session; `evaluate` then compares beyond the target (`lib/typing/evaluate.ts:17-27`). This overlaps blocker 2 but should be covered explicitly.
- **Post-hydration randomization still needs a contract decision.** The effect at `typing-practice.tsx:110-117` replaces the deterministic initial passage immediately after hydration without a user action. This is the ambiguity already recorded in question 1, not a newly frozen violation.
- **No privacy/storage/network leak found in typing files.** A static search of `app/typing`, `components/typing` and `lib/typing` found no `localStorage`, `sessionStorage`, `indexedDB`, cookies, `fetch`, `sendBeacon`, logging, or HTML-injection sink. This is code inspection only; the browser checks for storage, requests and literal markup still need to be run.

### Test review

`tests/typing-practice-browser.test.ts` is now 186 lines and adds useful cases for direct unsupported input and composition cancellation, plus the existing replacement, overflow, no-JS and navigation checks. By static trace, the current draft cannot pass the composition-cancellation, direct-input, replacement and overflow expectations; the regression test cannot pass the blur-deadline expectation. These tests are coordinator/GLM-owned and were not edited.

Remaining coverage gaps: shared-prefix/suffix replacement; Enter/newline; context-menu and browser-menu undo/redo; cut; composition commit vs cancel with a real IME; `visibilitychange` (only blur is tested); zero elapsed; exact 6000ms and deadline-at-edit; exact gross/net formulas; target completion vs duration completion; storage/network privacy; console errors (only `pageerror` is collected); and accessibility/contrast/current-indicator checks. The layout test uses 200 unbroken characters, not the 10000-character custom limit.

### Independent verification checklist for the fixes

- Composition: cancel a composition (including Escape/blur if reachable), then type one normal key; it must insert once, count once, and leave no lingering rejection. Also test committed composition and a dead key.
- Direct input: `insertText('é')`, emoji picker, paste, drop, autofill/voice and multi-character insertion must leave the session unchanged, add zero attempts, and show one stable explanatory note.
- Selection: identical and shared-prefix/suffix replacements must each count exactly one insertion while preserving corrected-error history.
- Deadline: blur at exactly and after the deadline must finish as `duration`, cap elapsed at the duration, show the summary, and reject later edits; resume must not reopen a finished session.
- Layout: 10000 unbroken characters, 390/834/1440, light/dark; no page-level horizontal scroll and the current character remains visible.
- Shortcuts: keyboard and context-menu undo/redo/cut; verify attempt history and final text remain consistent with the chosen contract.
- Privacy/accessibility: no storage or typed-text network request; no document-level error; visible focus, accessible names and non-color current/error cues.

### Addendum status

- Exact file changed by this addendum: `docs/agent-progress/typing-deepseek-review.md`.
- No app, test, config, contract, dependency or production change was made.
- Checks run: static file review and focused line-level tracing only.
- Checks not run: browser, build, typecheck, lint and test execution; therefore all failure statements above are code-level predictions, not observed test output.
- Next step: GLM/coordinator fixes and reruns the owned tests; I can independently verify the exact handoff once browser/build execution and the frozen handoff commit are provided.

## Final focused review — coordinator revision

Scope: re-read only the current `lib/typing/session.ts`, `components/typing/typing-practice.tsx`, `tests/typing-practice-regression.test.ts`, and the input/composition sections of `tests/typing-practice-browser.test.ts`. No browser, build, or test execution was performed, and no app/test/config file was changed. This is practice-only review; DB/exam scope was not considered.

### Confirmed by static trace

- **Selected same/partial insertion counts are fixed.** `applyEdit` now overrides the value diff with `actualInsertion.text` at `actualInsertion.position` whenever supplied (`lib/typing/session.ts:115-137`). Both a same-character replacement and a partial shared-prefix replacement therefore count every inserted code unit, even when final text is unchanged or still shares a suffix. `tests/typing-practice-regression.test.ts:21-32` covers the partial case with expected `4` attempts, `3` correct, `1` incorrect. The browser cases at `tests/typing-practice-browser.test.ts:128-152` cover identical and partial selection replacement with expected `4 correct / 0 incorrect` and `6 correct / 1 incorrect`; both are unrun.
- **One scoring path, no duplicate native input scoring.** The native `beforeinput` listener (`typing-practice.tsx:136-171`) only captures insertion metadata or rejects history/composition input; scoring happens once in the single React `onInput` handler (`typing-practice.tsx:194-242`). There is no second `onChange`/`onInput` scoring path.
- **A cancelled composition no longer drops the next normal key.** `compositionend` maps empty data to `null` rather than arming a rejection (`typing-practice.tsx:250-258`); the browser test dispatches an empty `compositionend` and then types `cat` (`tests/typing-practice-browser.test.ts:195-198`). A non-composing keydown also clears any pending commit marker (`typing-practice.tsx:261-263`), so the next normal key is not rejected by a lingering one-shot flag.
- **A real composition commit is rejected by both boundary paths.** A commit input is rejected when it is tagged as composition input or when its input `data` matches the nonempty `compositionCommitRef` (`typing-practice.tsx:212-222`). The field is reverted at composition end (`typing-practice.tsx:250-258`). Statically, this rejects the commit while leaving the following normal key accepted.
- **History undo/redo is rejected at the input boundary.** Both `historyUndo`/`historyRedo` `beforeinput` events and their input fallback are blocked/reverted (`typing-practice.tsx:143-152`, `206-211`), in addition to the keyboard shortcut guard.
- **Unsupported direct insertion is rejected without scoring.** Direct input with unsupported text reaches `applyEdit`, which checks `isSupportedTypingText` before starting the clock or recording attempts (`lib/typing/session.ts:151-159`); the field is then restored. The `insertText('é')` browser case is consistent with this path.
- **Blur after the deadline now finishes.** `pause()` checks elapsed time before pausing and calls `finish('duration')` at or after the deadline (`lib/typing/session.ts:188-199`); the regression test’s expected finished/duration/capped-elapsed state is consistent with this code.

### Remaining verification gaps and risk

- **No real-IME/browser verification of a real composition commit.** The only browser composition case is cancellation with empty data. The implementation’s rejection depends on the commit input being tagged as composition, or on `compositionend.data` matching the commit input `data`, and on the next keydown clearing the marker. Two ordering/data edges remain unrun: a real commit with empty `compositionend.data` arriving as non-composition `insertText`, and a non-composing keydown occurring between `compositionend` and the commit input. Either could score the commit or consume the marker before the next key. I found no confirmed code failure for these paths, but they are not evidenced.
- **Selected same/partial insertion is confirmed only statically and by unrun tests.** The session logic is clear; the browser tests depend on the browser firing an input event for identical selected-text replacement and on `beforeinput` metadata being present. Neither was executed here.
- **Out-of-scope residual behavior not re-reviewed:** Enter/newline scoring and post-hydration target randomization remain from the previous addendum; they are outside this focused input/composition change and were not revalidated.

### Judgment

**Accepted for practice-only static handoff.** The targeted coordinator revision structurally fixes the prior cancellation flag, duplicate-input risk, same/partial selection diff loss, history undo/redo boundary, unsupported direct insertion, and blur-deadline pause. **Fix-needed is limited to verification:** run the existing same/partial browser cases and add a real-IME commit-then-normal-key case. Only if that run exposes one of the ordering/data edges above is an app-side fix indicated; static review alone is not a browser acceptance result.

- Files reviewed: `lib/typing/session.ts`; `components/typing/typing-practice.tsx`; `tests/typing-practice-regression.test.ts`; `tests/typing-practice-browser.test.ts` (input/composition sections).
- Checks not run: browser, build, typecheck, lint, tests, real IME/CDP, and any production/deployment check.
- File changed by this final review: `docs/agent-progress/typing-deepseek-review.md` only.
