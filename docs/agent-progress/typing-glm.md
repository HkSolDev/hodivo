> Coordinator note: this file preserves the agent’s dated review/handoff stages. For the final source changes, observed test results and unresolved build limits, see [the implementation review](../TYPING_IMPLEMENTATION_REVIEW.md). Later coordinator fixes supersede earlier draft descriptions.

# GLM handoff — typing practice slice (typing-practice-v1)

Date: 12 November 2026. Agent: GLM (senior React/Next.js implementer lane).
Batch: docs/AGENT_COORDINATION_2026-11-12-typing.md. Contract: typing-practice-v1 (frozen).
Status: initial slice handed off, then coordinator review fixes applied
(second pass, same owned paths). See "Coordinator review fixes" below.

## Coordinator review fixes (second pass)

Coordinator findings from /private/tmp/typing-glm-fixes.md, all addressed in
owned paths; no contract changes, existing tests kept.

1. **Identical-character selection replacement now counts.** Finding: typing
   c, selecting it, retyping c, then ab on target `cab` scored 3 attempts
   instead of 4, because React suppresses a change event when the textarea
   value is unchanged. Fix: the field now has native element-level
   `beforeinput`/`input` listeners (added/removed in one Strict Mode-safe
   effect). `beforeinput` captures the real insertion (`event.data`) and its
   original selected position (`selectionStart` while the pre-edit selection
   is still active); the element-level `input` handler applies it through a
   new engine parameter `applyEdit(nextText, actualInsertion?)` whenever the
   value alone is unchanged. Changed values still flow through the existing
   React onChange diff, which runs after the native listener and finds
   nothing left to score; logging stays on input events, not keydown, and no
   selection edit is dropped. Regression tests: the cab sequence (4 correct),
   plus a guard that unchanged text with no insertion metadata still adds no
   attempts.
2. **Deadline is now checked before pausing.** `pause()` in the engine
   finishes the session (`duration`, elapsed capped) when the clock already
   passed the deadline, instead of freezing a finished session as paused.
   Regression test: duration 1000 ms, insert at 0, pause at 1100 →
   finished/duration/elapsed 1000 and later edits rejected.
3. **Long unbroken custom words wrap.** `.word` gained `overflow-wrap:
anywhere; max-width: 100%` (and `.passage` gained `overflow-wrap:
anywhere`), so a 200+ character custom word breaks inside its word span
   instead of pushing the page wide; word-boundary wrapping for normal text
   is unchanged. Source-level regression guard asserts the rule exists; the
   real 390 px rendering remains the coordinator's browser check.
4. **Unsupported characters can no longer be scored.** The engine now rejects
   any edit whose inserted text leaves the English-printable-ASCII-plus-
   whitespace charset (`rejection: 'unsupported'`), for both the diff path
   and the native insertion-metadata path; the field shows a visible note and
   the input is reverted without scoring. Composition remains fully rejected
   (never scored). Composition lifecycle reworked: the post-composition
   latch is now a 50 ms timestamp window instead of a sticky boolean, set at
   `compositionend` whether or not text was committed, and consumed by the
   first change event inside the window — so a canceled composition cannot
   swallow the next plain keystroke. All flags (composition active, trail
   timestamp, pending insertion) are cleared on every restart through a new
   single `restartSession()` helper, which also resets the field content.
5. **Validation errors are announced to screen readers.** Custom-duration and
   custom-passage error messages now have stable `useId` ids with
   `role="alert"`, and their inputs carry `aria-describedby` plus
   `aria-invalid` when a rejection is visible. The session note/status line
   keeps `role="status"`.

Also in this pass: the passage renderer moved to
`components/typing/passage-view.tsx` (same markup, focused module), and the
type-level gap where `EditResult.rejection` could be null at call sites is
handled by explicit narrowing (no casts or suppressions).

## Acknowledgement record

- Baseline: 5a49dc683b772547a61fcebbd12766c5549dc075, worktree
  /private/tmp/aptus-typing-glm, branch codex/typing-glm-20261112.
- Owned paths only: app/typing/page.tsx, components/typing/**,
  lib/typing/**, tests/typing-practice.test.ts, components/layout/footer.tsx
  (one link), docs/agent-progress/typing-glm.md.
- No commits made. No contract/test-config/CI/dependency changes. No paid
  calls, credentials, .env, production, push/merge/deploy. Source project read
  only via coordinator copy reference-typing/ (never modified).
- Read before work: AGENTS.md, .cursor/rules/aptus-coding-safety.mdc,
  docs/CODING_STANDARD.md, docs/AGENT_CONTRACT_PROTOCOL.md,
  docs/contracts/README.md, the batch record, docs/TYPING_INTEGRATION_PLAN.md,
  node_modules/next/dist/docs/01-app/01-getting-started/
  05-server-and-client-components.md, and the reference sources listed below.

## Changed files and why

| File                                         | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| lib/typing/words.ts                          | Word dictionary and with-replacement sampler ported verbatim from reference-typing/scratch/words.js so practice content is unchanged. Adds WORDS_PER_SESSION and a fixed INITIAL_WORDS_PASSAGE for deterministic prerender.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| lib/typing/evaluate.ts                       | Port of reference-typing/scratch/evaluate.js (positional final-text evaluation, code-unit counting) with TypeScript types.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| lib/typing/clock.ts                          | Port of reference-typing/scratch/clock.js: monotonic performance.now clock that excludes paused time; injectable time source for tests.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| lib/typing/scoring.ts                        | The frozen formulas isolated as one pure function: grossWpm=(inserted/5)/minutes, netWpm=max(0,gross−incorrect/minutes), accuracy=correct/inserted*100 (100 when zero attempts), null speeds when elapsed ≤ 0.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| lib/typing/custom-input.ts                   | validateCustomPassage (ASCII-printable + whitespace charset, trim/collapse whitespace like the original, nonempty, ≤10000 chars) and parseCustomDuration (whole seconds 1..3600 only). Returns rejection reasons so the UI explains visibly.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| lib/typing/session.ts                        | The session engine: idle→running on first accepted insertion; deadline checked before every edit; finish at duration or target length (once, guarded); pause/resume that charges no paused time; restart clears text/history/clock; attempt history records inserted characters with correctness judged against the target position at insertion time, deletions never add attempts. Edit detection walks shared prefix/suffix (single changed region), which uniformly covers typing, Backspace/Delete, caret moves and selection replacement.                                                                                                                                                                                                                                                                                                                                                                              |
| components/typing/typing-practice.tsx        | 'use client' session UI. All input handlers are confined to the labeled textarea (no window keydown capture, no navigation suppression). Paste/drop blocked with explanation; Ctrl/Cmd undo/redo blocked with explanation (they rewrite text outside the attempt log; copy/cut/select-all are left native and add no attempts); IME composition rejected visibly via composition events plus event.nativeEvent.isComposing, covering both browser event orders without casts. Interval (100 ms, source behavior) only refreshes the display and finishes on expiry; the engine enforces the deadline synchronously at each edit. Window blur / document hidden / textarea blur pause a running session (idle is untouched); Resume re-focuses the field. Settings (duration, source) freeze while running/paused via disabled fieldsets. Result summary is inline (no dialog). Passage and all strings render as text nodes. |
| components/typing/typing-practice.module.css | Aptus tokens only (light/dark already OS-driven via tokens.css), system mono stack for the passage, wrapping word groups, focus-visible outlines, responsive wrap at small widths, no transitions (reduced-motion safe).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| app/typing/page.tsx                          | Public server page with metadata ("Typing practice                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Aptus" via template), intro copy, noscript explanation, and the client component; inherits the existing shell/layout untouched. |
| components/layout/footer.tsx                 | Added exactly one link: `<Link href="/typing">Typing practice</Link>`. No other change.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| tests/typing-practice.test.ts                | Pure/SSR behavioral tests (15) derived from the frozen acceptance examples, following the existing job-card.test.ts tsImport pattern for tsx components.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

## Key decisions and rejected alternatives

1. **Engine owns all truth; React state is a snapshot only.** Every handler
   calls the engine then `setSnapshot(engine.snapshot())`. Alternative: split
   state across useState hooks — rejected because the deadline check and the
   attempt log must be consistent at event time, and ref/state drift is the
   classic failure this avoids; acceptance case 3 depends on it.
2. **onChange diff instead of per-keydown logging.** The textarea is real and
   native; each change is diffed against the previous value. Alternative:
   keydown listeners — rejected because they miss Delete/selection edits,
   soft-keyboard behavior and IME ordering, which the source project's plan
   explicitly lists as defects to fix.
3. **Attempt correctness is frozen at insertion position, never recomputed.**
   Acceptance example 1 requires `c x Backspace a t` → 4 attempts / 3 correct /
   1 incorrect. Final-text feedback (colors) is computed separately by
   evaluate() so display and stats stay distinct, as the contract requires.
4. **Randomize after hydration only.** Server and first client render use the
   fixed INITIAL_WORDS_PASSAGE; a mount effect (Strict Mode-safe) redraws 50
   random words. Alternative: seeding — rejected as unnecessary complexity for
   v1. Restart keeps the same target so a passage can be retried; re-rolling
   happens on mode re-selection or reload (the contract fixes restart
   semantics, not reroll-on-restart; source behavior differed, noted as a
   deliberate, visible choice).
5. **Undo/redo blocked inside the typing field only.** Native undo would
   rewrite text without matching attempt history and would fake corrections.
   Alternative: silently accept — rejected as hidden scoring corruption.
   This is confined to the field; no global key suppression exists.
6. **Overflow insertions beyond target length are scored incorrect and
   finish the session** (positions past the target have no correct answer).
   Alternative: truncating input — rejected as silent data loss.
7. **Live Net WPM/Accuracy display waits for ≥1000 ms of active time**, as in
   the original controller, to avoid sub-second spikes; the inline final
   summary shows whatever the arithmetic honestly produced, and `—` when
   speed is unavailable (zero elapsed), never Infinity/NaN.

## Commands run and results (exact, this worktree)

Second pass (after review fixes):

- `node --import ./tests/css-module-hook.mjs --import tsx --test
tests/typing-practice.test.ts` → **20 pass / 0 fail** (15 original tests
  kept unweakened + 5 new regression tests for the review findings: cab
  identical-replacement sequence, unchanged-no-metadata guard, deadline
  before pause, unsupported-character rejection on both edit paths, CSS wrap
  guard).
- `pnpm exec tsc -p tsconfig.next.json --noEmit` → only the pre-existing
  `components/results/recommendations-preview.tsx(144,45)` error remains
  (reproduced with my changes stashed in the first pass); my files
  typecheck clean, no `any`/casts/suppressions.
- `pnpm exec eslint <all owned paths>` → clean (same scoped-lint situation as
  the first pass; repo-wide `pnpm lint` still trips on the coordinator-
  provided `reference-typing/` copy, not an owned path).
- `pnpm exec next build --webpack` → compiled successfully; type-check phase
  still blocked by the same pre-existing baseline error (unchanged by me).

First pass (unchanged from the original handoff):

- `node --import ./tests/css-module-hook.mjs --import tsx --test
tests/typing-practice.test.ts` → **15 pass / 0 fail** (final run after all
  edits). Covers acceptance examples 1–4 at the engine/SSR level.
- `pnpm exec tsc -p tsconfig.next.json --noEmit` → only
  `components/results/recommendations-preview.tsx(144,45)` remains; **verified
  pre-existing** by re-running with my changes stashed (identical error).
  My files typecheck clean, no `any`/suppressions.
- `pnpm typecheck` → fails at `frontend/profile-api.ts(6,8)` TS2835 —
  **pre-existing baseline failure**, unrelated paths, reproduced with changes
  stashed; my files are not in that project.
- `pnpm lint` → fails only in `reference-typing/scratch/framework-free.test.mjs`
  (`'calculateStats' is defined but never used`) — the coordinator-provided
  reference copy is untracked but inside the lint glob; not an owned path, so
  I did not touch it. Scoped lint of all owned paths passes clean
  (`pnpm exec eslint app/typing components/typing lib/typing
tests/typing-practice.test.ts components/layout/footer.tsx` → OK).
- `pnpm next:build` (Turbopack) → fails on pnpm symlink resolution in this
  isolated snapshot worktree (`Can't resolve 'scheduler'`,
  `node_modules/node_modules symlink`), an environment artifact, not source.
- `pnpm exec next build --webpack` → **Compiled successfully**; then stopped
  at the type-check phase on the same pre-existing recommendations-preview
  error. No typing-related build failure.
- Integration test config (`pnpm test`, `pnpm test:web` globs, CI) untouched.
  tests/typing-practice.test.ts will be picked up by `pnpm test:web`'s
  existing `tests/*.test.ts` glob with the same flags it already uses.

## Acceptance mapping (frozen examples)

Engine/SSR-level coverage only; per the coordinator: do not treat acceptance
as fully proved until the coordinator's browser checks pass.

1. cat / 6000 ms → engine test asserts 4 attempts, 3 correct, 1 incorrect,
   gross 8, net 0, accuracy 75; deletion retained the error in history.
   Covered by test.
2. 50 in 60000 ms → gross 10, net 10, accuracy 100; elapsed 0 → null speeds,
   no Infinity/NaN. Covered by test.
3. Expired-before-edit rejection with timer finish; paused time not charged;
   idle blur never starts; pause after the deadline finishes instead of
   pausing; restart clears text/history/clock. Covered by tests.
4. Empty/whitespace custom, fractional/out-of-range/NaN/empty durations,
   unsupported characters (custom validation and typing input) all rejected
   with visible reasons; identical-selection replacement counted via native
   insertion metadata; shortcuts/identical edits add no attempts; selection
   edits compare positions in the target; SSR markup shows literal text (no
   `<script`). Covered by tests except the real-browser wiring.
5. Full lifecycle/restart/pause/resume/cleanup/viewport/theme/browser checks
   are the coordinator's browser acceptance harness; not run here (no browser
   execution authorized for this lane). SSR-level rendering, focus-visible
   styling and wrap-responsive CSS were implemented and statically reviewed.

## Honest limits and risks

Second-pass additions:

- The native-listener design assumes the element-level `input` listener runs
  before React's delegated change listener and that React suppresses
  change events for unchanged values. Both match observed React/DOM
  behavior, but only a real browser can confirm the ordering; the
  unchanged-value insertion path degrades safely if assumptions change
  (worst case: the replacement is not counted, never double-counted — the
  second handler sees no diff).
- The 50 ms composition-trail window is a timing heuristic. It covers the
  synchronous trailing input browsers emit after `compositionend`; an
  engine delivering the committed-text input later than 50 ms would slip
  through to the engine, whose unsupported-character check then still
  blocks non-ASCII composition output. Needs real-IME browser verification.
- aria-describedby/aria-invalid/role="alert" wiring is markup-verified in
  SSR output shape but not announced by an actual screen reader here.
- The CSS wrap fix is asserted at source level; 390 px overflow with a
  10000-char unbroken passage still needs the coordinator's browser check.

Carried over from the first pass:

- Not browser-run by me: real keyboard events, IME timing across browsers,
  mobile soft keyboards, visual layout at 390/834/1440 in both themes, and
  Strict Mode double-effect behavior in a real browser remain for the
  coordinator's browser harness. The engine/handler design was chosen to make
  those cases boring, not to prove them.
- Composition rejection relies on composition events plus `isComposing`; if a
  browser emits a final input after `compositionend` with `isComposing=false`,
  the `compositionEndedRef` latch still rejects it once; a hypothetical
  second unscored input after that latch is cleared could slip through on
  exotic engines. Untestable without a real IME here; flagged for browser
  verification.
- Alt-key dead-key compositions on macOS route through composition events
  (rejected); plain Alt-grapheme inserts (e.g. Option+2 → ™) would count as
  incorrect attempts — consistent with "Ctrl/Cmd shortcuts never count as
  letters" being the frozen scope, but worth a browser look.
- A 10000-char custom passage renders one span per character; performance at
  that extreme was not measured.
- Restart keeps the same passage (reroll on mode change/reload instead of the
  original controller's reroll-on-escape). If reviewers want reroll-on-
  restart, it is a one-line change in handleRestart.
- The lint failure inside reference-typing/ and the two pre-existing
  typecheck/build failures are environment/baseline artifacts; integrating
  lanes will need to either exclude reference-typing from lint or accept the
  baseline failures as known.
- Graphify `graphify update .` was intentionally not run from this worktree
  (graphify-out/ is not an owned path); it belongs to the coordinator's
  post-integration step per the batch.

## Handoff state

Second pass complete: all five coordinator review findings addressed in
owned paths, focused tests green (20/20), typecheck/lint clean for owned
paths, existing tests kept unweakened. No commits. Dockerfile untouched
(coordinator-owned). Coordinator may take ownership of this worktree for
independent review and integration per the batch record.
