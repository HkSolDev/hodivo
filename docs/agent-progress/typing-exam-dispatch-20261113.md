# Exam implementation dispatch — 13 November 2026

Baseline: e5876be. Contract: exam-v1. Hemant approved initial simulation and requested AGY participation.

| Worker             | Lane   | Execution session |
| ------------------ | ------ | ----------------- |
| GLM Free           | api    | 17945             |
| DeepSeek Free      | domain | 3658              |
| MiniMax Free       | ui     | 97936             |
| AGY 3.8 Flash High | review | 73708             |

Writers return proposed file artifacts only, without tools or shared-file mutations. Coordinator installs only reviewed owned paths in the assigned worktree, runs tests and integrates sequentially. Prompts include the frozen contract/types/fixtures and relevant actual source. No agent completion or passing test is inferred from dispatch.

Worktrees: /private/tmp/aptus-typing-exam-{api,domain,ui}-20261113. API owns catalogue/route/route tests; domain owns session/input/pure tests; UI owns exam page/component/CSS/client/client tests. AGY is read-only: original HTML/CSS fidelity and responsive hazards, then implementation review. Coordinator owns importer, app registration, navigation, shared contract/fixtures, DB proof and integration.

Execution prompts and raw outputs are retained under /private/tmp/typing-exam-{lane}-prompt.txt and corresponding output/artifact files. AGY prompt: /private/tmp/typing-exam-agy-review-prompt.txt. No permission-bypass mode is used.

Coordinator importer change accepts only null or native-correction-v1 editingPolicy; scoringMethod remains null-only. Existing importer/storage acceptance tests: 26/26 passed, zero skips. No live DB or publication change.

## Revised UI ownership

MiniMax first full-UI call ended with reason length and no code; exit 0 was not accepted as success. Retry session 75399 handles only exam-api.ts and client tests. AGY independent static reference review succeeded; AGY now owns only exam page/component/CSS (implementation execution session 82447), supplied the original HTML/CSS, frozen contract/types and installed Next guide. It cannot independently approve its own UI; coordinator and a separate free-model reviewer handle implementation acceptance. No worker writes shared files directly.

## Observed handoffs and manager checks

GLM API and DeepSeek domain generation ended reason length with no code; neither accepted. MiniMax full UI generation also produced no code. MiniMax client retry used scratch tools despite the no-tools instruction and did not return the requested artifact JSON. Its scratch client/tests were recovered from /private/var/folders/td/j1hpygvj2hd4vtbh_g2slst80000gn/T/opencode/examcheck, inspected, and copied by the coordinator only. Scope compliance was not accepted by assertion. Coordinator corrected version/parent binding, page bounds, field limits, scoring/profile validation, and HTTP error-code consistency, adding regressions. No tool-produced test claim was used as acceptance.

AGY reference review succeeded (18faf1bb-acd9-428e-bb5e-41c606996940). AGY implementation request timed out after 180 seconds with no code (1b6391d6-dfce-4abd-a2a5-afd38d91394a); no UI implementation is accepted. Its remote turn may outlive print timeout, but it has no assigned repository writes. No further large generation retry launched. A GLM #low trial was rejected as model-not-found; that variant is not usable here.

Coordinator implemented the pure session/input modules and six tests, retaining exact frozen signatures. Independent bounded DeepSeek review (execution session 94415) timed out at 240 seconds with no accepted findings; subprocess capture was not saved on timeout. No independent code acceptance is claimed.

Verification: affected importer/practice/client/session/input suite 59/59 passed, zero skips. pnpm typecheck passed for importer; explicit strict TypeScript check including all new lib/test files passed; Next tsconfig check passed; changed-file ESLint passed. No exam backend exists yet; no exam page exists yet; no browser, real DB, build, CI, deployment or publication proof is claimed. Graphify refreshed: missing tree_sitter_sql leaves SQL unindexed; source/tests remain required evidence.

Saved local commits: e5876be contract/fixtures, d310259 importer, 163d8b3 session/input, cc11273 API client. These do not make exam mode runnable. All implementation CLI calls have returned or timed out; no active implementation lane is claimed. Next bounded implementation is the exam catalogue backend; preserve the accepted local foundation and obtain independent code review before final acceptance.
