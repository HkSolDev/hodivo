# Database-backed practice contract

Batch: typing-practice-catalogue-20261112. Revision: practice-catalogue-v1.
User-authorized behavior: reuse exam passages for practice, automatically select
one randomly, ignore all exam restrictions, retain existing practice scoring.
Base PR46 commit: 021f5fad432d5277c6d279a98986ef1fd5bb6f4a.

## Public read boundary

GET /api/typing/practice-passage. No auth, body, query parameters or user typing.
200: {"passage":{"id":"...","title":"...","text":"..."}} or {"passage":null}.
Only these three passage keys; never rules, sources, statuses or parent records.
400 unknown query: {"error":"This endpoint does not accept query parameters."}.
503 DB failure: {"error":"Practice passages are temporarily unavailable. Please try again."}.
All responses Cache-Control: no-store. Unsupported HTTP methods must not write.

Eligible: TypingPassage.status=PUBLISHED, parent TypingExamVersion.status=PUBLISHED
and language=en. Any sourceKind may qualify; NOT a separate practice collection.
Existing English practice engine supports printable ASCII and whitespace; this
first API selects exact canonical text containing only printable ASCII, LF/TAB,
1–50000 characters with at least one non-whitespace character. Unsupported
Unicode content remains in catalogue for later supported engines, not altered.
No dependence on exam duration, scoringMethod, editingPolicy, backspacePolicy,
reviewedAt or cutoff fields. Publication is the existing visibility boundary.
No publication operation or seed added. No eligible records is normal empty state.

DB randomly selects one eligible row; returns at most one row, no whole-catalogue
read in Node/browser. Repeated requests MAY return the same row. No promise of
no repeats, weighting or cryptographic randomness. No text normalization in API
or frontend; preserve exact stored LF/TAB/spaces. SQL parameterized, read-only.

## Frontend boundary

Automatically GET on mount with no-store and AbortSignal. Validate unknown JSON
shape/keys/id/title/text and supported text before use. Loading, ready, empty,
error states; never use local generated text as a fallback. Native textarea
remains mounted (disabled unless ready) so its beforeinput listener survives.
No Words/Custom text/passage picker. Show selected title. Restart resets SAME
passage; Next passage fetches another random row and resets state. Ignore stale
responses; abort on replacement/unmount. On failure/empty no stale text enabled.
Timer starts at first input. Existing practice duration controls, ordinary
Backspace/Delete/selection editing, scoring, pause/resume and input privacy stay.
No copying rules from catalogue into practice. Next passage allowed idle/finished
only; Restart may discard current attempt. Disable controls while loading.

## Proof and ownership

Manager: src/lib/typing-catalogue.ts, src/app.ts registration, DB acceptance tests,
browser tests, docs/contract and integration. GLM ONLY src/routes/typing-practice.ts,
scripts/typing-practice-route.test.ts, docs/agent-progress/typing-practice-api-glm.md.
AGY ONLY components/typing/typing-practice.tsx, optional its CSS module,
lib/typing/practice-api.ts, app/typing/page.tsx,
docs/agent-progress/typing-practice-catalogue-agy.md. No agent owns schema/CI/
package/lock/env/protected contracts or another lane's tests. No commits/push/
deploy/live DB/official rules. Acknowledge baseline, revision and paths in report.
GPT5.6Terra: read-only independent review, sole report
docs/agent-progress/typing-practice-catalogue-terra.md.

Manager verifies actual DB publication/language/text filtering, exact text, null
rules and DISABLED backspace versions still eligible, sanitized failures, one-row
response and actual client/API compatibility. Browser tests cover loading/empty/
retry/races, same-passage Restart, Next passage, editing and responsive matrix.
Typecheck/lint/production build, existing storage and relevant practice tests.
Steps4–6 (exam APIs/UI/content) are separate next batch after this vertical slice.
