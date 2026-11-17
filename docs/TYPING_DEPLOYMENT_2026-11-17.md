# Typing & AI Agent Readiness Deployment — 17 November 2026

Merged `main` commit `5b9a9da2d5ae5e5009f1a31d3b979f9ca1f1824a` (PR #51) deployed to production on `akash9568` via Coolify.

## Verified Image Snapshot

| Service  | Source revision / image tag                | Registry digest                                                           |
| -------- | ------------------------------------------ | ------------------------------------------------------------------------- |
| Frontend | `5b9a9da2d5ae5e5009f1a31d3b979f9ca1f1824a` | `sha256:c603a7faaee488360b723d0f72b79d7afb9b600003483f2e6b8c3022bb080166` |
| API      | `5b9a9da2d5ae5e5009f1a31d3b979f9ca1f1824a` | `sha256:e125abf3f15afe58d2d2943ee1ed27da7d73948cf7044d03ce29e6524fec0254` |

## Summary of Deployed Changes

1. **Typing Practice (`/typing`)**:
   - Zero-scroll `100dvh` redesign with 64%/36% split, responsive mobile HUD, and monkeytype-style blur/resume overlay.
   - `PassageView` auto-scroll fix and color-coded coaching summary (27/35 WPM thresholds).
   - In-memory practice passage pool cache (`src/lib/typing-catalogue.ts`).
2. **Typing Exam Simulation (`/typing/exam`)**:
   - Zero-scroll `100dvh` dual-pane terminal with whole-word active highlight.
   - Unified `lib/typing/exam-evaluator.ts` implementing SSC Full/Half mistake scoring and category cutoffs.
   - Candidate sign-in gate popover and in-memory catalogue/snapshot cache.
3. **AI Agent Readiness & SEO**:
   - `/robots.txt` with `Content-Signal: ai-train=no, search=yes, ai-input=yes`.
   - `/sitemap.xml` including `/typing` and `/typing/exam`.
   - `Accept: text/markdown` content negotiation (`lib/markdown-negotiation.ts`, `proxy.ts`, `app/md/[[...slug]]/route.ts`).

## Follow-up release — PR #52 (`e8098ad793980e1c94dad77bd1a7e4de3e660b9f`)

Built and deployed through Coolify on 17 November 2026 (`localhost:5000/aptus-frontend:e8098ad793980e1c94dad77bd1a7e4de3e660b9f` and `localhost:5000/aptus-api:e8098ad793980e1c94dad77bd1a7e4de3e660b9f`, API digest `sha256:52744bd8b8b93719fb3eebe155eeaff151839bbb3e3d9f87b51b0bd5783deb17`):

- **RFC 9727 API Catalog:** `/.well-known/api-catalog` (`application/linkset+json`), `/api/openapi.json` (`application/openapi+json`), and `/api/health`.
- **Typing practice defaults:** `2m`, `3m`, `5m`, and `10m` presets with `2m` (`120s`) default in `components/typing/typing-practice.tsx`.
- **Mobile home & job detail polish:** Alternating row backgrounds (`color-mix(in srgb, var(--ink) 10%, var(--surface))`) on mobile cards and List view, compact primary/secondary **View details** & **Save** pill buttons, hidden `Appointment: Not specified`, omitted empty **Applicant requirements** / **Recruitment links** placeholders in `components/jobs/job-detail-content.tsx`, and `10` jobs per page (`PAGE_SIZE = 10` in `components/jobs/jobs-server-cache.ts`; `/api/jobs` default `30` in `src/routes/jobs.ts`).
