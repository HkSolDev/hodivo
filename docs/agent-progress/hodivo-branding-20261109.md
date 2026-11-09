# Hodivo public branding

- Objective: replace customer-visible Aptus branding with Hodivo on the frontend shown in the user screenshot.
- Base: `a3bed9e4cc09170bdb29a62a7154c966746dd50a` (running frontend image revision); branch `codex/hodivo-branding-20261109`; worktree `/private/tmp/aptus-hodivo-branding`.
- Owned paths: `app/layout.tsx`, `app/jobs/[id]/page.tsx`, `app/sign-in/page.tsx`, `app/how-it-works/page.tsx`, `app/auth/error/page.tsx`, `components/layout/header.tsx`, `components/layout/footer.tsx`, `components/results/results-view.tsx`, `components/auth/auth-bar.tsx`, `components/auth/passkeys.tsx`, `components/profile/profile-form.tsx`, `tests/next-frontend.test.ts`, `tests/next-navigation.test.ts`.
- Decision: use “Hodivo,” matching `hodivo.app`. The header wordmark is text, not a separate image asset. Change visible labels/copy and page metadata; preserve internal IDs, cookie/theme/cache keys, auth configuration, API routes and the separate API renderer.
- Evidence: screenshot’s “Qualification routes” text matches `components/jobs/job-detail-content.tsx` at the live image revision; the active frontend container label and OCI revision both identify the base SHA above.
- Verification: `pnpm typecheck` and `pnpm lint` passed. The targeted browser suite passed all 13 checks: `tests/next-frontend.test.ts` and `tests/next-navigation.test.ts`. A broader `pnpm test:web` run also built successfully; its initial failures were stale “Aptus” assertions, now corrected, and one unrelated missing `services/ai/.venv/bin/python` contract-test dependency in this isolated worktree.
- Review: Antigravity’s read-only review found complete visible-brand coverage and no reason to rename internal `aptus` keys. The requested Luna review was started but did not return, so it is not used as evidence.
- Status: implementation and review complete. No deploy, merge or push performed.
