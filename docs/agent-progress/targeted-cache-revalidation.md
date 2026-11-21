# Targeted cache revalidation

## What a production review adds

1. Prove the invalidation boundary after a write. Warm two job details and the list, change upstream data, then check what the next request actually displays and which upstream endpoints it calls. Treat production rollout as a separate verification step with the running image revision recorded.
2. Start from transaction code, the notifier's actual callers, the installed Next.js documentation, the running Docker image tags, and the original tracker ticket. Architecture maps are guides to those sources.
3. Use Graphify for discovery, `git grep` for callers on the target branch, read-only SSH for image checks, and a production-mode Next standalone build with a controlled HTTP backend for reproducible cache assertions.
4. The acceptance evidence is rendered content and upstream request counts. A repeat invalidation must refresh job A on its next visit, preserve warmed job B and list data, and leave bulk revalidation able to refresh listings.

## Implementation brief

1. On `perf/public-jobs-cache`, confirm the branch and the deployed images. Inspect the job and typing writes and record their current cache effects. Read the actual [Notion ticket](https://app.notion.com/p/41b354a1ec59818caf99d93ea500b6a9) and the installed Next documentation for route-handler revalidation. Run the existing standalone checks as the baseline.
2. Extend `POST /api/revalidate-jobs` with one optional `jobId` query parameter. Keep the Bearer gate and validate the decoded ID against the detail page's ID rules. Reject duplicates, empty or malformed IDs, and unknown parameters before invalidating anything. For a valid ID, mark only `/jobs/<id>` stale. An omitted ID takes the existing list and sitemap path.
3. Test changed detail content, an untouched sibling detail, an untouched shared list, invalid and unauthorized requests, repeated invalidation, and bulk list freshness. Build Next in production mode and check rendered responses and upstream calls. Confirm next-visit freshness in the deployed frontend when this revision is released with an approved fixture.
4. In the next job-write slice, classify the committed changes by whether they affect cards, filters, order, deadlines, or visibility. Changes that affect both detail and list must request both operations after commit. Use the existing shared list invalidator because a single edit can change multiple filter and pagination results. Verify the actual committed write path, including failed writes and retries.
5. In the Redis passage slice, first identify the authoritative passage and exam-version writers. Give published catalogue and exact passage text their own invalidation and expiry rules. Fall back to PostgreSQL on Redis errors. Test publish, edit, unpublish via both catalogue and direct URLs, and use a controlled in-flight read to verify that a stale result cannot refill the cache. Expand to other datasets only with a verified writer and read scope. Keep private attempt progress user-scoped and update leaderboard data only when the incremental personal best changes.

## Baseline from source and runtime

The branch started from `936c3f2`. Read-only SSH found healthy Coolify frontend image `4d5ef9a` and API image `bbb963e`. The standalone baseline exercised existing list caching and bulk notification against a controlled HTTP backend. The November 1 cache release notes describe historical behavior, including upstream call counting and bulk warming.

| Committed write or read path                            | Cache effect at the baseline                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reviewed job publication through `src/routes/ingest.ts` | Best-effort Next notification after the reviewed write returns. Bulk notification clears the in-process catalogue, marks sitemap stale and warms common first pages. Detail reads use a separate 60-second Next fetch cache.                                                                                                          |
| Legacy source replacement in `src/routes/ingest.ts`     | Deletes old posts and inserts replacement rows in one transaction, then sends the same bulk notification. This includes removed posts. Old detail URLs have no explicit invalidation on that path.                                                                                                                                    |
| Autonomous job publication or correction                | The autonomous ingest branch returns from its own committed write path. It does not call the existing frontend notifier. Its updates can affect listing fields such as education and pay.                                                                                                                                             |
| Reviewed publication CLI                                | Calls the publication helper directly. The HTTP route owns the notifier. A direct CLI invocation bypasses it.                                                                                                                                                                                                                         |
| Typing passage import and publication lifecycle         | The tracked importer creates draft data. The tracked baseline has no passage publish/edit/unpublish handler to attach invalidation to. The random practice pool holds published text in Fastify memory for five minutes and can serve its previous pool while refreshing. Exam selection queries published rows through its own path. |
| Saved typing attempts                                   | The tracked baseline has no attempt persistence route. Draft files outside the branch and older Graphify nodes cannot establish a committed write path.                                                                                                                                                                               |

## Why this implementation is small

1. Keep auth first so invalid requests do not change cache state. Reject whitespace rather than normalizing it into a different URL. Reject unknown parameters so a misspelled detail request cannot fall through to a bulk refresh.
2. Call the installed framework's `revalidatePath` with a concrete detail URL. A route handler marks the path for revalidation on its next visit. The detail branch returns before list invalidation, sitemap invalidation, or warming.
3. Keep the existing bulk response and warming contract. A caller that changes both a detail and the list can invoke both operations. The first slice adds the operation and proves its boundary. Automatic write-path wiring and Redis require their own verification.

The standalone test warms two detail pages and a list, changes the fixture versions, then checks rendered content and backend request counts. This exercises the actual Next server and cache. PostgreSQL mutation, write-path retries, overlapping detail fetches and deployed freshness require separate checks. No production data, configuration, or deployments were changed.

The baseline suite passed six checks. After the change, the production-mode Next build, all seven standalone checks, focused ESLint, and `git diff --check` passed. Repository-wide typechecking reported errors in existing untracked typing test files.

## Connecting the existing published-job edit

1. The admin candidate screen posts to `/api/admin/review-drafts/:id/revisions`. That transaction saves a new review revision and updates the review item. It does not update a public Post, so a draft save sends no invalidation.
2. The existing in-place public edit is a corrected autonomous notice through `POST /api/internal/ingest`. Its transaction updates matching Posts and persists the publication record. This branch previously bypassed the notifier. Its post-commit path now sends an exact detail refresh and sends one bulk refresh if the committed write adds a job, changes a public list field or employment type, or renames the shared source. A shared source rename also invalidates the details of sibling jobs on that source.
3. A successful correction response includes `cache_refresh: "ok"` when the frontend accepted the notifications or `cache_refresh: "failed"` if delivery failed or was unconfigured. The database edit remains committed. Each operation uses the existing two attempts. Bulk delivery allows 15 seconds per attempt because it waits for three warming reads. The receipt reports notification delivery. An ingest replay does not replay invalidations after the two attempts are exhausted.
4. Reviewed HTTP publication and legacy source replacement, including removal during replacement, already send the bulk notification after commit. Those triggers remain bulk-only. The direct publication CLI bypasses HTTP notification. No separate published-job admin edit or removal endpoint was found.

The opt-in PostgreSQL case in `tests/jobs-cache-production.test.ts` requires a fresh migrated loopback `aptus_preparation_test` database, matching `DATABASE_URL` and `TEST_DATABASE_URL`, `APTUS_TEST_JOB_EDIT_CACHE=1`, the Python test environment, and a production-mode Next build. It submits validated corrections through the live local Fastify route and checks the next rendered response and upstream read counts. A PostgreSQL trigger forces rollback for one attempt, and a notification relay returns 503 for the delivery-failure case.

Read-only SSH found healthy frontend `4d5ef9a` and API `bbb963e`. Release this API change with the frontend endpoint that accepts `jobId`. Deployment, production edits, and Redis are pending separate authorization and work.

Final local rerun against a freshly migrated disposable database passed all eight cache checks. After the detail-only edit, the API saw one read for job A and none for job B or the listing. After the listing edit, it saw one read each for the filtered listing and job A and none for job B. The failed write emitted no requests to the notifier, and the failed notification emitted two attempts while leaving the corrected row committed.

## Redis for public job details

Worktree `/private/tmp/hodivo-redis-job-detail`, branch
`perf/redis-job-detail`. It carries over the in-progress targeted revalidation
and correction wiring from `perf/public-jobs-cache` at `936c3f2`. Graphify
identified the detail page, public route, and presentation query. The actual
imports and write callers confirmed the newer targeted notifier and legacy
replacement behavior.

1. Next's job page fetches Fastify's `GET /api/jobs/:id`. After its existing ID
   check, Fastify can serve the same public JSON from Redis when
   `JOBS_REDIS_URL` is configured. It caches successful detail reads for
   86,400 seconds. PostgreSQL supplies the response on a miss or Redis timeout.
   Redis-disabled Fastify still calls the existing detail query directly.
2. Each key includes the validated job ID and the PostgreSQL row versions
   (`xmin`) of that Post and its Source. A successful edit retires the old
   key as part of commit, before the frontend notification. Deletion removes
   the version lookup result. This works even if Redis was unavailable at the
   moment of the write. A fill checks the version again after loading the
   detail. A write racing after that check can only leave an entry under the
   retired key. Retired values expire by TTL.
3. Autonomous corrections keep their existing exact detail notification and
   send the existing bulk operation when listing data changes. Legacy source
   replacement commits the source changes and post replacement together, using
   `DELETE ... RETURNING` to capture the exact withdrawn IDs. It notifies those
   pages after commit and then refreshes the list. Empty legacy extracts
   preserve posts. If they update a source with existing posts, those details
   and the list are refreshed to reflect the shared source fields. Reviewed
   HTTP publication notifies its returned IDs and then the list. A draft save
   still does not touch public Posts.

The opt-in integration uses a production Next standalone build, a live
Fastify server, real PostgreSQL query events, and disposable Redis 7. It uses
`APTUS_TEST_JOB_EDIT_CACHE=1`, a fresh migrated loopback
`aptus_preparation_test` database with matching `DATABASE_URL` and
`TEST_DATABASE_URL`, and loopback `JOBS_REDIS_URL`. Run it with
`node --import tsx --test tests/jobs-cache-production.test.ts` and
`NODE_ENV=production`.

| Verified read | Next.js calls to Fastify | PostgreSQL version lookups | PostgreSQL detail queries |
| --- | ---: | ---: | ---: |
| First visit to A after detail-only correction | 1 | 2 | 1 |
| Next visit to B and shared list after the same correction, combined | 0 | 0 | 0 |
| Subsequent direct Fastify read of A | Direct API request | 1 | 0 |

The integration also checked one-day expiry, a list-affecting edit, a rollback
that sent no notification and preserved the warm Redis entry, and notification
failure reported separately from the committed edit. A deliberately delayed
query returned its original data to the already-running request and left no
stale Redis entry. An edit and visit during a Redis pause returned current
PostgreSQL data. After recovery the current entry warmed and the next direct
read made zero detail queries. A real legacy replacement made the old API
and rendered page return 404 without waiting for expiry. The unrelated job
page remained warm.

The production build and eight standalone/integration checks passed. All 46
focused route, presentation and ingestion checks passed, including the
PostgreSQL-backed autonomous and reviewed publication regressions. Focused
ESLint, typecheck and the Git diff check passed.

Use a Redis database dedicated to this PostgreSQL environment. When restoring
or replacing PostgreSQL, start with a fresh Redis namespace because transaction
IDs are local to the database cluster. This approach keeps one small SQL
lookup on a warm Fastify read. Direct database or CLI writes change which
Redis key is readable but bypass immediate Next notification. Next page
freshness also depends on successful notification delivery. Listings and
Popular Jobs remain outside the Redis slice. Production rollout requires
separate approval.
