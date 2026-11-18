# SEO & Public AI-Search Discovery Handoff (`hodivo.app`)

## Overview

This handoff documents the frontend SEO and public AI-search discovery improvements implemented on branch `codex/html-first-worker-plan` in `/Users/mrblackghost/Work/Projects/aptus-html-first-worker`.

## Implemented Changes

### 1. Slice A — Correct Job Detail HTTP Status & Outage Handling (`app/jobs/[id]/page.tsx`)

- **Fixed Soft-404 on Missing/Invalid Jobs**:
  - `fetchJobDetail(id)` returns a discriminated union (`{ status: 'ok'; job }` | `{ status: 'not_found' }` | `{ status: 'unavailable' }`) wrapped in React `cache()` so `generateMetadata` and `JobDetailPage` share the same request per render.
  - Invalid job IDs (`!isSafeJobId(id)`) or upstream HTTP `404`/`400` responses return `{ status: 'not_found' }`.
  - `JobDetailPage` invokes Next.js `notFound()` when `status === 'not_found'`, returning an actual HTTP `404` status code and `<meta name="robots" content="noindex"/>`.
- **Separated Backend Outages (`5xx`/Network Errors) from Missing Jobs**:
  - When the backend API returns `5xx` or is unreachable (`status === 'unavailable'`), `generateMetadata` emits `title: 'Job Temporarily Unavailable'` with `robots: { index: false, follow: false }`, and `JobDetailPage` renders a clear temporary-unavailable notice without fabricating job content or claiming the job was removed.
- **Removed Brand Suffix Duplication**:
  - Fallback and page titles no longer append `| Hodivo` before `app/layout.tsx`'s `%s | Hodivo` template runs, eliminating `<title>Job Details | Hodivo | Hodivo</title>`.
- **Preview Protection**:
  - If `job.designReview === true`, `generateMetadata` sets `robots: { index: false, follow: false }`.

### 2. Slice B — Metadata, Canonicals, and Pagination/Query Policy (`components/jobs/job-sharing.ts`, `app/layout.tsx`, `app/page.tsx`, `app/how-it-works/page.tsx`)

- **Trusted Public Origin Validation (`trustedPublicOrigin`, `parseTrustedOriginUrl`)**:
  - Uses `process.env.SITE_URL` as the fixed trusted origin; never derives canonicals from request `Host` or `X-Forwarded-Host` headers.
  - Rejects paths, query strings, hashes, credentials, insecure `http://` on non-localhost hosts, and staging/preview hostnames (`staging.*`, `*.staging.*`, `preview.*`, `0.0.0.0`, `*.local`, `*.internal`).
  - For discovery routes (`robots.ts` and `sitemap.ts`), passes `{ allowLocalhost: false, fallbackOrigin: 'https://hodivo.app' }` so localhost or unconfigured origins never leak into production `robots.txt` or `sitemap.xml`.
- **Homepage Metadata & Pagination/Query Policy (`homeCatalogMetadata`)**:
  - Clean root (`/`):
    - Title: `Hodivo — Indian Government Jobs, Eligibility & Official Notifications`
    - Description: `Discover live Indian government job notifications across central, state, PSU, banking, defence and research roles. Compare education and age eligibility, check vacancies and application deadlines, and verify official recruitment links.`
    - Canonical: `${SITE_URL}/` with matching Open Graph and Twitter card metadata.
  - Clean paginated catalogue pages (`/?page=2`, `/?page=3`, etc., with no filter/sort/view params):
    - Indexable and crawlable (`robots` unrestricted).
    - Distinct title: `Indian Government Jobs — Page N | Hodivo`.
    - Self-canonical: `${SITE_URL}/?page=N` so crawlers can index and traverse page 2+ job links without collapsing all pagination pages into page 1.
  - Search, filter, sort, layout, or redundant `?page=1` query combinations (`?q=...`, `?qualification=...`, `?sort=...`, `?layout=...`, `?page=1`):
    - Canonicalizes to `${SITE_URL}/` and sets `robots: { index: false, follow: true }` so crawlers follow job links without indexing an unbounded explosion of filter/sort permutations.
- **How It Works Page (`app/how-it-works/page.tsx`)**:
  - Emits title `How It Works | Hodivo`, description, canonical `${SITE_URL}/how-it-works`, and Open Graph/Twitter card metadata.

### 3. Slice C — Crawler Policy (`app/robots.ts`)

- Implements Next.js `MetadataRoute.Robots` at `/robots.txt`:
  ```txt
  User-Agent: *
  Allow: /
  Disallow: /profile
  Disallow: /saved
  Disallow: /results
  Disallow: /sign-in
  Disallow: /auth/
  Disallow: /admin/
  Disallow: /api/

  Sitemap: https://hodivo.app/sitemap.xml
  ```
- **Why a Single Wildcard Rule Is Used**:
  - Under RFC 9309, a specific `User-agent` block overrides the `User-agent: *` block rather than merging with it. Using a single `User-agent: *` rule ensures `Googlebot`, `Bingbot`, `OAI-SearchBot`, `Claude-SearchBot`, and `PerplexityBot` all receive identical permissions to crawl public routes (`/`, `/?page=N`, `/how-it-works`, `/jobs/*`, `/share-image`) and identical disallow rules for private/auth/admin/API paths, without silently granting or changing AI training crawler permissions (`GPTBot`, `ClaudeBot`, `Google-Extended`).

### 4. Slice D — Sitemap (`app/sitemap.ts`)

- Implements Next.js `MetadataRoute.Sitemap` at `/sitemap.xml`, with hourly upstream fetch revalidation and an invalidation request from the publication hook:
  - Fetches public jobs from `${BACKEND_INTERNAL_URL}/api/jobs?sort=soonest&page=${page}&pageSize=100` (compatible with the standalone `frontend.Dockerfile` runtime, which has `BACKEND_INTERNAL_URL` and no direct database access).
  - Includes:
    - `https://hodivo.app/`
    - `https://hodivo.app/how-it-works`
    - `https://hodivo.app/typing`, `https://hodivo.app/typing/exam`, and `https://hodivo.app/tools/prepare-file`

    - Verified live public job URLs (`https://hodivo.app/jobs/{id}`)
  - Conservative Sitemap Eligibility (`isSitemapEligibleJob`):
    - Requires a safe job ID (`isSafeJobId`) and non-empty `postName`.
    - Requires a known `applicationLastDate` whose `YYYY-MM-DD` calendar date is `>= sitemapIndiaDateKey(now)` (`Asia/Kolkata` IST calendar date). Jobs remain in the sitemap through their final day in India and drop out after IST midnight.
    - Excludes jobs with `applicationLastDate: null` from the sitemap (without changing the homepage catalogue, which continues to list unknown-deadline jobs with a verification notice). Unknown deadline does not by itself prove a job is still open for sitemap submission.
    - Excludes `designReview: true` preview payloads and deduplicates canonical URLs deterministically.
    - Omits `lastModified` because `PublicJob` only exposes `source.fetchedAt` (scraper collection time, not content modification time).
    - Throws on upstream HTTP error or `freshnessUnconfirmed: true` so Next.js never serves or caches a fabricated empty "all jobs disappeared" sitemap during a backend outage.

### 5. Slice E — Conditional `JobPosting` Structured Data Gate

- **Decision**: `JobPosting` JSON-LD is intentionally **omitted** for current records.
- **Evidence**:
  - Google's `JobPosting` structured data specification requires `datePosted` (the original ISO 8601 date that the employer posted the job).
  - Neither `prisma/schema.prisma`, `src/lib/public-jobs.ts`, nor `components/jobs/job-detail-content.tsx` stores or renders a verified employer `datePosted`:
    - `source.fetchedAt` is the scraper collection timestamp (explicitly labeled in the UI: _"Collection date is not a verification date"_).
    - `Post.publishedAt` is Hodivo's internal publication timestamp and is not exposed in `publicFields`.
    - `reviewedDetails.application_start_date` is the application window start date, not the employer posting date, and is frequently `null`.
- **Requirements Before Enabling `JobPosting` JSON-LD Later**:
  1. Extract and source-ground a verified employer notification publication date (e.g., `notification_date` / `date_posted`) in the worker and `ReviewedDetails` contract, allowing `null` when unstated.
  2. Expose that verified date in `GET /api/jobs/:id` and display it visibly on `JobDetailContent` so structured data matches visible page facts.
  3. Emit `JobPosting` JSON-LD only when `postName`, recruiting organization (`hiringOrganization.name`), verified employer `datePosted`, and explicit location/remote status are non-null, escaping `<` as `\u003c`.

---

## Public tool and agent discovery

- The Resize files page is linked from the shared navigation and the homepage Markdown. Its HTML title, canonical, preview metadata and negotiated Markdown describe browser-only processing and the PDF rasterization trade-off.
- The homepage advertises the existing API catalog, OpenAPI document and service documentation through its HTTP `Link` header. The OpenAPI document is explicitly crawlable. Other existing API crawler rules still apply.
- Public job Markdown uses published job fields for deadline, qualifications, vacancy count and official links. The job detail HTML already has per-job metadata and canonical URLs.
- Markdown responses declare `Vary: Accept` and `Cache-Control: no-store`. Keep negotiated HTML out of any blanket CDN cache rule unless that rule distinguishes HTML and Markdown requests.
- Auth.md and A2A discovery are for actual agent registration and protocol services. Hodivo currently exposes public pages and an API catalog. A scanner score does not determine search rankings.

## Post-Deploy Operator Runbook

### 1. Environment Check (Coolify Frontend Service)

Ensure the production frontend container has:

- `SITE_URL=https://hodivo.app`
- `BACKEND_INTERNAL_URL=http://aptus-api:8080`

### 2. Cloudflare `robots.txt` & Bot Fight Mode Check

During the pre-change live audit of `https://hodivo.app`:

1. `https://hodivo.app/robots.txt` returned HTTP `200` with `x-nextjs-cache: HIT` and 1,248 bytes of Cloudflare content-signal comments (`# As a condition of accessing this website, you agree to abide by the following content signals...`), and no `User-agent` or `Sitemap` lines.
   - **Action after deploying `app/robots.ts`**: Run `curl -i https://hodivo.app/robots.txt`. Confirm that `User-Agent: *`, `Allow: /`, the `Disallow:` lines, and `Sitemap: https://hodivo.app/sitemap.xml` are present in the response body. If Cloudflare's "Manage `robots.txt`" / AI Audit content-signal injection is enabled in the Cloudflare dashboard, verify that it either prepends comments to the origin `robots.txt` or disable Cloudflare's managed override so the origin `app/robots.ts` rules and `Sitemap:` directive are served intact.
2. Unauthenticated `curl` requests to `https://hodivo.app` succeeded (`HTTP/2 200`), whereas default Python `urllib` requests received `HTTP 403` (`error code: 1010`).
   - **Action in Cloudflare Dashboard**: Inspect **Security → Events** (filtered by path `/`, `/robots.txt`, `/sitemap.xml`, `/jobs/*`) and **Security → Bots**:
     - Confirm **Verified Bots** are allowed.
     - Check whether **Browser Integrity Check** or **Bot Fight Mode / Super Bot Fight Mode** is challenging or blocking legitimate search/AI-discovery crawlers (`Googlebot`, `Bingbot`, `OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot`).
     - Do not disable WAF protections globally or weaken `/api/*`, `/admin/*`, or `/auth/*` rules.

### 3. Live Verification Commands After Deploy

```sh
# 1. Homepage metadata & canonical
curl -sS -D - https://hodivo.app/ | grep -i -E 'HTTP/|title>|rel="canonical"|property="og:'

# 2. Pagination self-canonical & search noindex
curl -sS https://hodivo.app/?page=2 | grep -i -E '<title>|rel="canonical"|name="robots"'
curl -sS https://hodivo.app/?q=scientist | grep -i -E '<title>|rel="canonical"|name="robots"'

# 3. How-it-works metadata & canonical
curl -sS https://hodivo.app/how-it-works | grep -i -E '<title>|rel="canonical"|property="og:'

# 4. Robots & Sitemap
curl -i https://hodivo.app/robots.txt
curl -i https://hodivo.app/sitemap.xml | head -n 40

# 5. Real job (200) vs Nonexistent job (404)
curl -I https://hodivo.app/jobs/cmwaeode6000501tlkre3e5tb
curl -i https://hodivo.app/jobs/nonexistent-seo-audit-check | head -n 25
```

### 4. Search Console Submission

1. In **Google Search Console** (and **Bing Webmaster Tools**), verify domain/URL-prefix ownership for `https://hodivo.app`.
2. Submit `https://hodivo.app/sitemap.xml` under **Sitemaps**.
3. Use **URL Inspection** on `https://hodivo.app/`, `https://hodivo.app/how-it-works`, one live `/jobs/{id}` URL, and one nonexistent `/jobs/nonexistent-seo-audit-check` URL to confirm Googlebot sees HTTP `200` on live pages and HTTP `404` on missing jobs.

## Coordinator corrections — 11 November 2026

This section supersedes the earlier HTTP-200/noindex outage policy. Backend
outages now throw through the framework server-error path; the production test
asserts HTTP 500, while missing jobs remain HTTP 404. Default sort and display
parameters generated by pagination links are normalized to clean self-canonical
pagination metadata. Nondefault sorting/filtering remains noindex. Production
build and eight integration/browser checks passed locally. Nothing was deployed.
