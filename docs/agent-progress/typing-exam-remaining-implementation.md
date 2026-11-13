# Remaining exam implementation batch

Date: 13 November 2026. Baseline: 5844eb665581b6359a0ca83c1fb0a439812a278d.
Contract: exam-v1. Owner: coordinator. Explicit user authorization: implement the
remaining backend and responsive exam UI with the requested team.

Workers return artifacts for coordinator review; shared types, schema, existing
domain/client, app registration, database and browser tests remain protected.

| Worker                | Assigned paths                                                          | Invocation                               |
| --------------------- | ----------------------------------------------------------------------- | ---------------------------------------- |
| OpenCode GLM Free     | src/lib/typing-exam-catalogue.ts; scripts/typing-exam-catalogue.test.ts | typing-exam-stage-implement.py catalogue |
| OpenCode MiniMax Free | src/routes/typing-exams.ts; scripts/typing-exams-route.test.ts          | typing-exam-stage-implement.py routes    |
| AGY 3.8 Flash High    | components/typing/exam-mode.tsx; scoped CSS; app/typing/exam/page.tsx   | typing-exam-stage-implement.py ui        |
| Coordinator           | src/app.ts; database/browser tests; navigation; integration             | this conversation                        |

All prompts attach the frozen contract and actual related source. Backend shares
an explicit catalogue interface. Raw prompts/outputs retained under
/private/tmp/typing-stage-{catalogue,routes,ui}-*. Workers may not redefine rules,
add attempt endpoints, persist text, invent scoring, publish content or deploy.
Inspect every artifact before installation. No success inferred from assignment.

Terra 6.1 previously failed provider authentication (400); native GLM/DeepSeek
failed credits. These are unavailable review results, not accepted checks.
OpenCode DeepSeek Free remains available for bounded independent review.

Disposable PostgreSQL was stopped on entry. An initial start without explicit
port failed on occupied default5432; corrected startup targets only the existing
isolated instance at 127.0.0.1:18931. PostgreSQL14 built-in SHA256 was verified.
No shared/live database, ENV files, migration or content publication involved.

## Implementation and review outcome

AGY returned the three UI artifacts. Coordinator removed copied sample node/roll
identity and branding claims, replaced unsafe fetch/input lifecycle code, added
explicit loading/readiness/instructions, and retained the reference palette,
candidate header, stacked serif panels, font controls, timer and dialogs.
GLM and MiniMax generation timed out without usable backend files; coordinator
implemented their assigned catalogue/routes and regression tests. No worker
exit code was treated as implementation evidence.

Independent GPT backend review found method guards running after body parsing
and malformed numeric database projections. Both fixed and regression-tested.
Independent GPT UI review found timer updates overwriting IME preedit, inability
to reselect the same version, and missing textarea focus outline. All fixed.

At Hemant's follow-up request, AGY3.8, Gemini4HydrogenHigh, OpenCodeGLMFree,
DeepSeekFree and GPT5.6Terra were dispatched on bounded actual-source reviews.

- AGY3.8 review timed out (`a109c48e-0076-4472-9fcc-8db8b25883ee`); no accepted result.
- Hydrogen4 returned static review. Its proposed removal of numeric/closed-enum
  projection guards was rejected: it would allow NaN→null serialization and
  responses rejected by the strict client. Valid but unsupported rule values
  remain inspectable/unready; malformed wire projections fail safely with503.
- GLM returned static review. Rejected speculative unknown catalogue codes
  (class code is a closed union),405 substitution (contract explicitly404), and
  widening cursor format (contract explicitly uses opaque lowercase DB IDs).
- DeepSeek returned static domain-only review. Rejected new last-observed-time
  state/undo/clone requirements and ready-submit changes: UI uses performance.now,
  explicit composition state and controlled reconciliation; ready submit is
  disabled; frozen snapshot is not mutated. Actual browser composition and
  deadline tests provide the relevant integrated evidence.
- GPT5.6Terra request failed provider.auth400; no review accepted.
- Native GPT6.1Terra was available as the earlier-authorized fallback. It found
  missing warning/discard flow before changing a ready/running version and a
  stuck-loading flag after clearing a pending selection. Coordinator fixed both,
  plus same-ID selection guards, and added browser regression cases. Its next
  check found restart confirmation missing a synchronous expiry check; fixed
  with a test that advances the monotonic reading before a delayed timer tick.

Raw requested-model reviews are /private/tmp/typing-final-{agy38,hydrogen4,glm,
deepseek,terra56}.json. Review suggestions are not authoritative contract changes.

## Verification

- Affected unit/API/import/client/domain/practice suite:61passed,0failed,0skipped.
- Disposable PostgreSQL14 suite:3passed,0failed,0skipped, including actual API
  bodies consumed by the real client validators, text/hash/rules binding,
  unsupported/draft exclusion, corrupt numeric503 and prepared draft preview/apply.
- Existing practice browser suite:11passed,0failed,0skipped after integration.
- Exam browser covers unsupported readiness, canceled/stale detail response,
  editing/paste, Tab, continued modal clock, confirmed version discard,
  320/390/568/834/1440/1920 widths, short viewport, long passage, app font zoom,
  200%text zoom, expiry/restart, Chromium IME across ticks, manual submission,
  reselection, privacy and failure/empty/retry. Final post-review result:
  11passed,0failed,0skipped including synchronous restart deadline regression.
- Root/backend and Next TypeScript checks passed; full lint passed. Scoped
  checks rerun after review fixes. Production webpack build passed before the
  final selection/restart fixes and is rerun for the final tree.
- Graphify updated:4593nodes/8782edges. SQL parser dependency absent:21SQL files
  not indexed. Community names may be stale; generated graph files excluded.

Physical mobile keyboards, Safari, true browser UI zoom, frontend Docker image,
live deployment and CI are not established by these local checks. Text zoom and
viewport emulation do not establish hardware keyboard behavior. Prepared content
remains DRAFT/PRACTICE and official scoring remains unavailable.

Final production build passed after all selection and restart fixes; both
`/typing` and `/typing/exam` appear in its output. Terra6.1 confirmed the final
restart fix in source; it did not rerun the browser suite independently.

Reproduction commands (database URL refers only to the isolated test instance):

```sh
pnpm typecheck
pnpm exec tsc -p tsconfig.next.json --noEmit
pnpm lint
pnpm build:web
pnpm next:build
DOTENV_CONFIG_PATH=/dev/null TEST_DATABASE_URL=postgresql://typing_test@127.0.0.1:18931/postgres node --import tsx --test scripts/typing-catalogue-database.test.ts
DOTENV_CONFIG_PATH=/dev/null node --import tsx --test scripts/typing-exams-route.test.ts
DOTENV_CONFIG_PATH=/dev/null node --import ./tests/css-module-hook.mjs --import tsx --test tests/typing-exam-browser.test.ts
DOTENV_CONFIG_PATH=/dev/null node --import ./tests/css-module-hook.mjs --import tsx --test tests/typing-practice-browser.test.ts
```
