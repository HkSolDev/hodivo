# Popular Jobs

Branch `feat/popular-jobs` starts from `988630d` on main. The existing listing cache checkpoint and Vercel Web Analytics integration are in its history. The initial refresh draft remains in its original checkout.

1. The refresh command requests seven days of Vercel visitors grouped by job path. One Redis Lua operation replaces changed counts and removes missing fields. An unchanged snapshot keeps its ranking revision. An invalid or failed query leaves the snapshot alone. The developer verified the manual Vercel query. A request using the scheduled server credential remains a live rollout check.
2. Fastify uses the existing open-job and search filters, sorts matching scored jobs before pagination, and fills with Newest. The first unfiltered page at the standard page sizes uses its own cache entry keyed by the listing revision, visitor revision and IST day. Next asks Fastify on each Popular request so an independent frontend cache cannot hide a newer snapshot. Newest and the deadline sorts remain available. Cards use the existing compact layout and Popular uses visitor counts internally.
3. `pnpm next:build`, `pnpm typecheck`, `pnpm lint`, and Prettier passed. Applied the existing migrations with `pnpm exec prisma migrate deploy --config prisma7.config.ts` to disposable PostgreSQL. Ran `APTUS_TEST_POPULAR_JOBS=1 node --import tsx --test tests/jobs-cache-production.test.ts` with loopback fixture services. Eight tests passed, with the separate job-correction opt-in skipped. The run covered snapshot updates, failure and overlap, ranked pagination, listing changes, IST expiry, stale and missing snapshots, and the rendered Popular page. The final Fastify samples were 14.8 ms cold and 1.5 ms warm. The warm read issued only the listing revision lookup, with zero ranking or card queries.

## Scheduler handoff

Run `node --import tsx scripts/refresh-job-visitors.ts` from the API image. Configure one dedicated stopped one-shot container on the backend host using the API image, the API's private Redis network, and the four variables below via secret runtime configuration.

- `JOBS_REDIS_URL`
- `VERCEL_ANALYTICS_TOKEN`
- `VERCEL_PROJECT_ID`
- `VERCEL_TEAM_ID`

Following the existing host-cron deployment pattern, schedule a single entry once the manual run is verified.

```cron
*/15 * * * * flock -n /tmp/hodivo-job-visitors.lock docker start --attach hodivo-job-visitors
```

Use a container named `hodivo-job-visitors` with the refresh command as its command and restart policy disabled. The API processes do not schedule refreshes. Capture exit status in the host's existing cron logs. HTTP 429 leaves the existing snapshot in place and the next scheduled invocation is the next attempt. Verify the server secret can query the intended project, compare Redis results to Vercel, and check exactly one run per interval. Production installation and activation require approval.
