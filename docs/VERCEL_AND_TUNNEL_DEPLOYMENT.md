# Production Deployment: Vercel Frontend + Self-Hosted API (Cloudflare Tunnel)

Last verified: 2026-11-18 / 2026-11-19

## 1. Current Topology

Hodivo/Aptus runs a split production architecture: **Vercel** serves the public Next.js frontend (`https://hodivo.app`), while **Coolify on `akash9568` (`ghost_server`)** runs the Fastify API (`aptus-api`), PostgreSQL, Python worker, and a backup Coolify frontend (`https://aptus.novaraorigin.com`).

| Surface                | Public URL                                                    | Host / Runtime                                                             | Upstream / Notes                                         |
| ---------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------- |
| Primary Frontend       | `https://hodivo.app` (alias `https://hodivo-main.vercel.app`) | Vercel (`hodivo-main`)                                                     | Calls `BACKEND_INTERNAL_URL=https://api.hodivo.app`      |
| Backend API            | `https://api.hodivo.app`                                      | `akash9568` → `cloudflared` → `coolify-proxy` → `aptus-api` (`:8080`)      | Fastify + Prisma + PostgreSQL                            |
| Backup Server Frontend | `https://aptus.novaraorigin.com`                              | `akash9568` → `cloudflared` → `coolify-proxy` → `aptus-frontend` (`:3000`) | Calls `http://aptus-api:8080` on internal Docker network |

## 2. Request Flow

```text
User Browser (https://hodivo.app)
   │  (Cloudflare DNS: A record, DNS-only → Vercel edge bom1)
   ▼
Vercel Next.js (hodivo-main)
   │
   ├── Static / client-only routes (/typing, /typing/exam, /tools/prepare-file, /how-it-works)
   │     └─▶ Served directly from Vercel global CDN (stays up even if akash9568 is offline)
   │
   └── Dynamic SSR & /api/* routes (/, /jobs/[id], /api/*, /profile, /results, auth)
         └─▶ Next.js rewrite / server fetch → BACKEND_INTERNAL_URL (https://api.hodivo.app)
               │
               ▼
         Cloudflare Edge (api.hodivo.app, Proxied, Bot Fight Mode OFF)
               │
               ▼
         Cloudflare Tunnel (b138891e-cac6-4c03-8e1e-640c19549f18)
               │
               ▼
         cloudflared on akash9568 (/etc/cloudflared/config.yml) → http://localhost:80
               │
               ▼
         coolify-proxy (Traefik) → aptus-api (Fastify :8080) → PostgreSQL
```

## 3. Vercel Configuration (`hodivo-main`)

- **Project:** `mrblackghostts-projects/hodivo-main`
- **Root Directory:** empty / `./` (repo root — **not** `app`)
- **Framework Preset:** `Next.js`
- **Install Command:** `pnpm install --frozen-lockfile --ignore-scripts`
- **Build Command:** `pnpm next:build` (`next build --webpack`, required by [next.config.ts](../next.config.ts#L98-L104))
- **Output Directory:** default (`.next`)

### Environment Variables (Vercel Production)

| Variable                    | Value                      | Purpose                                                                                      |
| --------------------------- | -------------------------- | -------------------------------------------------------------------------------------------- |
| `BACKEND_INTERNAL_URL`      | `https://api.hodivo.app`   | Baked into `next.config.ts` `/api/:path*` rewrites at build time and used by SSR loaders     |
| `SITE_URL`                  | `https://hodivo.app`       | Canonical `<link rel="canonical">`, `robots.txt`, `sitemap.xml`, OpenGraph metadata          |
| `INGEST_TOKEN` _(optional)_ | Same secret as `aptus-api` | Only needed if `aptus-api` `FRONTEND_REVALIDATE_URL` points to Vercel `/api/revalidate-jobs` |

> **Auth note:** Do **not** add `DATABASE_URL`, `BETTER_AUTH_SECRET`, or `GOOGLE_CLIENT_SECRET` to Vercel. All `/api/auth/*` routes proxy to `aptus-api`, which owns authentication and `BETTER_AUTH_URL`.

## 4. Cloudflare & Tunnel Configuration (`akash9568`)

### DNS (`hodivo.app` zone)

| Type          | Name                     | Target / Value                                                           | Proxy Status             |
| ------------- | ------------------------ | ------------------------------------------------------------------------ | ------------------------ |
| `A` / `CNAME` | `@` (`hodivo.app`)       | Vercel DNS target (`64.29.17.1` / `f5930848bd4279bf.vercel-dns-017.com`) | `DNS only` (grey cloud)  |
| `CNAME`       | `api` (`api.hodivo.app`) | `b138891e-cac6-4c03-8e1e-640c19549f18.cfargotunnel.com`                  | `Proxied` (orange cloud) |

### Cloudflare Security Setting (Critical)

- **Bot Fight Mode** (`hodivo.app` → Security → Bots) **must be OFF** (or skipped via WAF rule for `Hostname equals api.hodivo.app`).
- When Bot Fight Mode was enabled, Cloudflare returned `403` (`cf-mitigated: challenge`) to Vercel's server-to-server `fetch()` requests, causing `/` to show `"Jobs are temporarily unavailable"`.

### Tunnel Ingress (`/etc/cloudflared/config.yml` on `akash9568`)

`cloudflared` runs as a systemd service with `/etc/cloudflared/config.yml`:

```yaml
- hostname: api.hodivo.app
  service: http://localhost:80
```

Validate and restart after any edit:

```bash
sudo cloudflared --config /etc/cloudflared/config.yml tunnel ingress validate
sudo systemctl restart cloudflared
sudo systemctl status cloudflared --no-pager
```

## 5. Coolify Configuration (`aptus-api`)

- **Resource:** `aptus-api` (`pzvqgrcr4r2ruzfxi6mqjq2b`, container port `8080`)
- **Domain entry:** Protocol `http`, Domain `api.hodivo.app`, Port `8080`
- Keep `aptus-frontend` (`yjkbdsihlnbpy1xnauk2890e`) untouched on `aptus.novaraorigin.com` as a direct server fallback. Both frontends share `aptus-api` and PostgreSQL simultaneously.

## 6. Performance & Capacity Notes

- **Before (7-day Cloudflare Analytics on self-hosted frontend via tunnel):**
  - Origin response time: `p50 = 890 ms`, `p75 = 1 s`, `p95 = 3.9 s`, `p99 = 6.2 s`
  - Origin TCP/TLS connection breakdown: `232 ms` TCP + `229 ms` TLS + `887 ms` Response Wait
  - Core Web Vitals (P75): LCP `2,156 ms` (`23.08%` Poor), INP `416 ms`, CLS `0.089`
- **After (Vercel `bom1` edge + `api.hodivo.app`):**
  - Live `/` SSR measured `461 ms` TTFB / `488 ms` total
  - Static routes (`/typing`, `/typing/exam`, `/tools/prepare-file`, `/how-it-works`) and `/share-image` assets serve globally from Vercel's CDN without hitting the tunnel
  - `next.config.ts` sets `Cache-Control: public, max-age=0, s-maxage=86400, stale-while-revalidate=604800, stale-if-error=604800` on `/tools/:path*`, `/typing`, and `/typing/:path*` so CDN edges cache the HTML shells for 24h (and serve stale for up to 7 days during revalidation or origin outages), while browsers always revalidate (`max-age=0`) and `/api/typing/*` passage endpoints remain `no-store`.
- **Scaling bottleneck:** Dynamic API/DB endpoints (`/api/match`, `/api/auth/*`, uncached `/jobs/[id]`) still funnel through one `cloudflared` tunnel, one `aptus-api` container, and one PostgreSQL instance. To handle viral spikes, add a Cloudflare Cache Rule for public `GET /api/jobs*` and/or move `aptus-api` + Neon Postgres to an always-on cloud VM.

## 7. Verification Commands

```bash
# 1. Backend API through Cloudflare Tunnel
curl -i https://api.hodivo.app/health
curl -i "https://api.hodivo.app/api/jobs?page=1&pageSize=1"

# 2. Vercel frontend + /api rewrite + SEO canonical
curl -i https://hodivo.app/
curl -sS https://hodivo.app/ | grep -o '<link rel="canonical"[^>]*>'
curl -sS https://hodivo.app/robots.txt | head -n 10
curl -i "https://hodivo.app/api/jobs?page=1&pageSize=1"
```
