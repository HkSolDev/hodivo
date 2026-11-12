# Typing practice implementation review

Date: 12 November 2026. Scope: plan slices 0–1, practice only. Local implementation; not deployed.

## Team and source of truth

- Coordinator: this session, owns frozen behavior, independent tests, review fixes and integration.
- Implementer: OpenCode `opencode/glm-5.3-flash-free`, session `ses_e30bc459effehLsUlNVWskRDqW`.
- Independent reviewer: OpenCode `opencode/deepseek-v4.1-flash-free`, session `ses_e30bc31daffeNHFmRTJPeSWvHB`.
- [Plan and stage status](TYPING_APPLICATION_PLAN.md), [frozen batch and baselines](AGENT_COORDINATION_2026-11-12-typing.md), [GLM rationale](agent-progress/typing-glm.md), [DeepSeek findings](agent-progress/typing-deepseek-review.md).
- Original HTML project remains untouched. Its practice formulas were ported; its unverified official qualification labels were excluded.

## What exists

`/typing` is a public Next server page with a focused React client workspace and one footer entry. It inherits the existing shell and light/dark tokens. There are no typing API calls, database tables, dependencies, auth requirements, telemetry, attempt uploads or browser storage.

The visitor selects 50 common English words or a custom passage, chooses 15/30/60/custom seconds, types into a labeled native textarea, pauses on focus loss, resumes, completes and restarts. Custom passage whitespace normalizes like the source; printable English ASCII plus whitespace is supported, maximum 10000 normalized characters; custom duration is a whole number 1..3600 seconds. Unsupported typing is visibly rejected.

Pure functions under `lib/typing` own the active-time clock, positional feedback, validation and attempt-based scores. `components/typing` owns UI and native input metadata. Final visible text and insertion totals are separate. A corrected mistake remains in attempt statistics; deletions do not add attempts. Gross/net WPM retain the source formulas, with unavailable speed at zero elapsed and no official qualification claim.

## Why the review changed the first implementation

1. A final-string diff cannot identify identical replacements, shared-prefix replacements or repeated-character caret positions. `beforeinput` captures actual insertion text/position, and one `onInput` handler scores each insertion once, including unchanged final values. Metadata is authoritative when available; the diff remains the fallback for deletion/no-event engine calls. This avoids global key logging.
2. The clock checks the monotonic deadline before edits and before pausing. A delayed display tick cannot grant extra time or freeze an expired attempt. Scored elapsed time is capped at the chosen duration.
3. Composition rejection uses event state and committed text, not a timing window or a lingering cancellation flag. A canceled composition does not eat the next ordinary key. Unsupported IME is not advertised as supported.
4. Paste/drop and undo/redo are confined to the typing field and visibly rejected; history input types are guarded as well as shortcuts. Ordinary site navigation remains native.
5. Long unbroken passages wrap; validation errors are linked to their fields and announced. The final summary is inline, avoiding a new dialog/focus trap.
6. The frontend image now copies `lib/typing`; compiling locally alone would not establish that Docker receives imported source. No worker/API image changes are needed for this stage.

## Observed verification

| Check | Result and boundary |
| --- | --- |
| Original source suite, run by DeepSeek |30 passed; source pure functions only |
| Combined production-function/SSR/regression/job-card/page-design tests |27 passed; includes existing isolated browser design-review regression |
| Expanded independent typing browser suite |8 passed in isolated headless Chrome/Node24 against local fixture API |
| Input/browser cases |Corrected typo75% accuracy; identical replacement; native partial replacement; unsupported direct input; CDP Chromium composition commit and simulated cancel; pause/resume; duration finish; restart; literal markup; validation |
| Responsive/theme |390/834/1440 in both schemes with200-character unbroken passage;10000-character passage at390; screenshots inspected at390 light and1440 dark |
| Navigation/no-JS |Footer round-trip, fresh input after navigation, visible no-JS explanation and existing footer link |
| Scoped lint |Passes on all typing files and footer |
| Next route type generation |Passes in isolated integration workspace |
| Next TypeScript check |Blocked only by pre-existing recommendations-preview.tsx:144 nullable-string error |
| Standard webpack production build |Compiles successfully; then stops on the same existing nullable-string type error |
| Root pnpm typecheck baseline |Existing frontend/profile-api.ts:6 missing .js import extension; not changed here |

Exact commands were run in `/private/tmp/aptus-typing-review` with independent dependency copies, no `.env`, credentials or production access. Browser tests launch local fixture servers and a temporary Chrome profile. They use a framework test-only terminal flag to avoid interactive upgrade prompts; dependency versions and application production settings are unchanged.

```sh
node --import ./tests/css-module-hook.mjs --import tsx --test tests/typing-practice.test.ts tests/typing-practice-regression.test.ts tests/job-card.test.ts tests/page-design.test.ts
node --import tsx --test tests/typing-practice-browser.test.ts
pnpm exec next typegen
pnpm exec tsc -p tsconfig.next.json --noEmit
pnpm exec eslint app/typing components/typing lib/typing tests/typing-practice.test.ts tests/typing-practice-regression.test.ts tests/typing-practice-browser.test.ts components/layout/footer.tsx
pnpm next:build --webpack
```

The browser commands require unrestricted local listening/browser permissions and use explicit Node24 on this machine. Root commands may have a different default Node version outside the sandbox. Baseline and iteration failures remain documented in the batch; assertions were not weakened to obtain a pass.

## Limits and next stage

A clean standard build is still blocked by unrelated existing code. Docker image execution, production, real OS/mobile keyboards and IMEs, actual hidden-tab transitions, screen-reader hardware and full manual contrast/zoom audits were not run. Chromium CDP composition is stronger than a synthetic event alone but is not an OS IME test. Client-side results remain practice estimates, not trusted certification or anti-cheat evidence.

Database/API and exam mode remain unimplemented. Next is the storage slice: review the first exam's exact settings and passage provenance when entering it, then implement the bounded read API/import/migration and test against a disposable database. Do not publish guessed official presets or silently redesign the exam interface.

The frozen implementation source is `d2145375e762f7bdbe51952660c14d4e7af52653`
on isolated local branch `codex/typing-review-20261112`. The final sequential suite
against that revision passed **35/35**. Accepted files were copied to the original
`codex/typing-practice-plan` checkout and their SHA-256 hashes matched the frozen
revision. Your original staged work was not committed or reset. Subsequent edits
to these review/status documents record verification only; application source is
unchanged.

Full `pnpm lint` passes in the original checkout. Its `pnpm typecheck` still fails
only on the previously recorded `frontend/profile-api.ts:6` extension error.
Graphify AST update completed (3353 nodes/5850 edges); SQL extraction reported its
existing missing optional parser. No dependency was installed. Scoped whitespace
checks pass; the global diff check flags pre-existing worker sources.json
whitespace, which was preserved.

Final reviewer disposition is recorded in the team batch. No push, merge, deployment, production migration or source-project modification is included.

## Responsive follow-up

Hemant requested AGY Gemini 3.8 Flash High for responsive review.
[Static review and disposition](agent-progress/typing-agy-responsive-review.md).
Expanded the existing browser test to widths 320/390/568/834/1440/1920 in both
themes, typing and restarting at every width. It exposed a blur-induced click
cancellation on Restart. Moving button order still failed in the browser;
preserving pointer focus before the native click resolves it. Native keyboard
activation remains supported. All 9 browser checks pass, including emulated
320px touch/keyboard restart and no-JS/navigation checks. Screenshots inspected
at 320px in both themes. Existing 23 pure/SSR/regression checks pass.
Physical mobile keyboards and Safari were not tested. Draft catalogue storage
is now a separate implemented slice; the frontend still does not fetch it.
