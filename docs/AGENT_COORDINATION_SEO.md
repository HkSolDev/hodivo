# Agent Coordination: Frontend SEO & AI-Search Discovery

## Status

Active coordination record for the frontend SEO and public discovery slice on `codex/html-first-worker-plan`.

## Branch and Starting State

- Worktree: `/Users/mrblackghost/Work/Projects/aptus-html-first-worker`
- Branch: `codex/html-first-worker-plan`
- Starting HEAD: `46d7d51460007c29d46e132f99de7e924902f468` (`feat(worker): checkpoint bounded HTML-first evidence recovery`)
- Dirty files at start: `?? graphify-out/` (local generated code-graph directory; kept out of commits)
- Original checkout preserved untouched: `/Users/mrblackghost/Work/Projects/aptus-next`

## Owned Files (SEO Slice)

- `app/robots.ts` (new)
- `app/sitemap.ts` (new)
- `app/layout.tsx`
- `app/page.tsx`
- `app/how-it-works/page.tsx`
- `app/jobs/[id]/page.tsx`
- `components/jobs/job-sharing.ts`
- `tests/job-sharing.test.ts`
- `tests/next-frontend.test.ts`
- `docs/AGENT_COORDINATION_SEO.md` (new)
- `docs/SEO_DISCOVERY_HANDOFF.md` (new)

## Worker AI Owned Files (Do Not Touch)

- `services/ai/**`
- `docs/AGENT_COORDINATION_HTML_FIRST.md`
- `docs/HTML_FIRST_WORKER_PLAN.md`
- `docs/HTML_FIRST_WORKER_HANDOFF.md`
- `docs/agent-reports/**`

## Shared Boundaries and Coordination Decision

- `src/lib/public-jobs.ts`, `src/routes/jobs.ts`, `src/routes/job-detail.ts`, `components/jobs/job-detail-content.tsx`, `next.config.ts`, `.env.example`:
  - **No edits required.**
  - `GET /api/jobs` already supports `pageSize` up to `100` (`src/routes/jobs.ts`) and returns `applicationLastDate`, `designReview`, and `source` fields (`src/lib/public-jobs.ts`).
  - `GET /api/jobs/:id` already returns HTTP `404` for invalid/missing job IDs and HTTP `503` for backend/database failures (`src/routes/job-detail.ts`).
  - `app/sitemap.ts` can consume `GET /api/jobs` directly over `BACKEND_INTERNAL_URL` and apply conservative sitemap eligibility rules without modifying shared backend routes, Prisma queries, or locked contracts.

## Explicit Exclusions

- No edits to `services/ai/**`, worker scheduling/extraction/evidence/provider code, or worker tests.
- No edits to Prisma schema, migrations, or live database state.
- No edits to `contracts/**`, `scripts/contracts/**`, or lockfiles (`pnpm-lock.yaml`).
- No edits to deployment scripts, Cloudflare configuration, or authentication implementation.
- No repository-wide formatting or `git add .` / `git add -A`.

## Acceptance Checks

1. `pnpm check:contracts`
2. Focused SEO and frontend tests (`tests/job-sharing.test.ts`, `tests/next-frontend.test.ts`, `tests/job-detail-content.test.ts`, `tests/public-browsing.test.ts`, `tests/jobs-cache.test.ts`, `tests/jobs-cache-production.test.ts`)
3. `pnpm typecheck`
4. `pnpm lint`
5. `pnpm next:build`
6. Prettier check on owned changed files and `git diff --check`
7. Local HTTP and no-JS Playwright verification for `/`, `/?page=2`, `/?q=test`, `/how-it-works`, `/robots.txt`, `/sitemap.xml`, `/jobs/:id` (200, 404, and 503 outage states), and `/share-image`
