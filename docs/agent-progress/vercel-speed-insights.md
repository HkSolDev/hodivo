# Vercel Speed Insights

Local branch `codex/vercel-speed-insights`, based on `c3853ed` (merged Web Analytics PR #67).

1. Keep the current root layout integration and render Speed Insights beside Web Analytics. The official Next.js SDK (`@vercel/speed-insights@2.1.0`) supplies browser Web Vitals and route grouping.
2. Use the existing public route allowlist for both collectors. Strip query strings and fragments before sending URLs. Web Analytics still accepts only page views. No backend or cache changes are needed for this telemetry.
3. Verify the filter with `node --import tsx --test tests/web-analytics.test.ts`. All three checks passed. Production build, `pnpm typecheck`, `pnpm lint`, formatting, and the production dependency audit passed.

`pnpm test:web` passed with 189 tests and two opt-in skips. The job-correction skip was covered by the separate run below. The production file tool opt-in was left off.

## Job correction regression

The branch contains `bfff270`. The existing public correction goes through autonomous ingestion and notifies after commit. Saving an admin review draft does not update a published job. See [targeted revalidation](targeted-cache-revalidation.md) for the path and retry details.

Ran `node --import tsx --test tests/jobs-cache-production.test.ts` with `APTUS_TEST_JOB_EDIT_CACHE=1` against the production Next build and disposable PostgreSQL and Redis. All eight checks passed. The test covers detail-only scope, listing-affecting corrections, rollback, and failed notification. Both containers were removed.

Vercel dashboard activation, deployment, and live metric collection are pending.
