# Typing practice and draft storage PR

Branch: codex/typing-practice-storage, isolated in
/private/tmp/aptus-typing-pr-20261112 from unrelated local work.

Implemented: /typing automatically loads one random published English passage
from the exam catalogue through GET /api/typing/practice-passage. No separate
practice collection or passage picker. Practice ignores exam restrictions,
preserves normal editing, timers, pause/resume and existing attempt scoring.
Restart resets the same passage; Next passage requests another random row
(repeats allowed). Typed text stays in the browser.

Loading, empty, error/retry and stale-response states are handled. Public reads
exclude drafts/retired content, return only identity/title/text, preserve exact
supported text and sanitize database failures. Existing draft exam/version/
passage storage and atomic operator import remain unchanged.

## Observed verification

13 November: 76/76 combined typing storage, import, API, disposable PostgreSQL,
client and practice checks passed, with zero skips. Command:

```sh
DOTENV_CONFIG_PATH=/dev/null TEST_DATABASE_URL=postgresql://typing_test@127.0.0.1:18931/postgres node --import ./tests/css-module-hook.mjs --import tsx --test --test-concurrency=1 scripts/typing*.test.ts tests/typing-practice-api.test.ts tests/typing-practice.test.ts
```

Log: /private/tmp/typing-s0-verification-20261113.log.
Prior checks on this unchanged implementation: typecheck, lint, production Next
build and 11/11 browser checks passed. Browser matrix:
320/390/568/834/1440/1920, light/dark, keyboard/touch emulation.
Terra accepted final code commit 15e50a72bb1c0c8368cafd3b02bd06ff23f242ef
after the cache-header correction. Final combined rerun: 76/76, zero skips;
log /private/tmp/typing-s0-final-verification-20261113.log. Reviewer independently
inspected source/diff and read the suite log; browser checks were not rerun by reviewer.

## Remaining scope

Exam catalogue APIs, exam input/timer/scoring/UI and real content are the next
staged batch, not completed by practice. See TYPING_EXAM_TEAM_EXECUTION.md.
No shared/live migration, content publication, deployment or merge performed.
Real Safari/mobile hardware and frontend Docker image were not exercised.

## Integrated simulation checkpoint — 13 November

Supersedes the earlier queued/not-implemented status: exam-v1 backend catalogue and four public APIs, responsive /typing/exam page, supported local timer/editor behavior and actual API/client validation are now implemented. Manager integrated AGY artifacts and implemented backend after free-model generation timeouts. Independent GPT reviews found and verified fixes; Gemini4Hydrogen, OpenCodeGLM and DeepSeek static suggestions were adjudicated against the frozen contract; AGY3.8 final review timed out and GPT5.6Terra failed authentication. Native6.1Terra reviewed the final UI lifecycle fixes.

Local checks:61affected unit/API/import/domain/client tests;3disposable PostgreSQL checks;11exam browser checks;11existing practice browser checks, all zero failures/skips. TypeScript and lint passed. See agent-progress/typing-exam-remaining-implementation.md for commands, review limits and final build result. Content import material is prepared as hidden draft practice text with honest provenance; no official scorer, content publication, migration, deployment or merge.
