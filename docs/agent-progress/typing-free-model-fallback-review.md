# Free-model fallback trial — 13 November 2026

Coordinator assigned two read-only, self-contained reviews from PR worktree
`/private/tmp/aptus-typing-pr-20261112`, baseline `4ed4622`. Neither worker
had file ownership or permission to change contracts, code, tests, or content.
These were prompt-level acceptance reviews, not source or browser inspections.

## Observed execution

- OpenCode `opencode/minimax-m3.1-flash-free`, session
  `ses_e2d852c4effePh2i7bEckJLHlV`: completed UI acceptance proposal; exit 0,
  reported cost 0.
- OpenCode `opencode/deepseek-v4.1-flash-free`, session
  `ses_e2d849766ffeeOxdJzAzw4wJ3y`: completed independent acceptance proposal;
  exit 0, reported cost 0. It reviewed the same supplied requirements, not
  MiniMax's output or implementation.

## Coordinator review

Retain checks for keyboard-open reachability, zoom reflow, dialog focus return,
distinct non-ready states, stale-response rejection during an active session,
one terminal transition, and no typed-text network transmission. Existing
S5/S7 acceptance already covers much of this; no duplicate test suite is added.

Reject MiniMax's server-clock authority, submit response, final typed-text
upload, mandatory persistent draft storage, and server-offset assumptions.
They expand or contradict the local-only session scope. No unconditional
focus move on error/retry: announce errors without unnecessary focus theft.
200 percent zoom is not universally equivalent to 640 CSS pixels. Do not
prescribe a viewport API or CSS unit without reproducing a layout problem.

DeepSeek also overreached on snapshot persistence across reload/navigation:
the accepted invariant concerns an active running session, not an invented
durable attempt. Its expiry and submit outcomes remain proposals until S2
freezes lifecycle semantics. UI may display results from the approved local
domain evaluator; it must not invent its own scoring or official verdict.

## Assignment decision

Use GLM Free for bounded API implementation after S2, DeepSeek Free for pure
domain work and separate reviews, and MiniMax Free as AGY's fallback for small
UI tasks. Give every writer exact paths and frozen inputs. MiniMax's trial
supports supervised use only: plausible output contained material scope drift.
Coordinator retains contract decisions, diff review, integration and checks.

No runtime change, browser check, new exam contract, migration or publication
was performed by this trial. S2 remains the implementation dependency.
