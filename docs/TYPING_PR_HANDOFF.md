# Typing practice and draft storage PR

Based on refreshed main `82432f7`, isolated from unrelated local work. Current
Hodivo branding and existing Prisma models are preserved.

Implemented: public `/typing` practice, Aptus/Hodivo light/dark styles, timed and
custom passages, pause/resume and attempt-based feedback; draft-only exam/version/
passage schema and strict atomic operator import with dry-run and conflict checks.
Terra reviewed storage and its C1 fix; AGY 3.8 Flash High reviewed responsive code.
The manager reproduced/fixed the restart click issue and verified browser behavior.

Verified on this clean branch: typecheck, lint, production Next build, 53 storage/
CLI checks with disposable PostgreSQL, 23 practice pure/SSR checks and 9 browser
checks. Browser matrix: 320/390/568/834/1440/1920, light/dark; touch/keyboard at320.
Earlier failure from Prisma engine-cache permissions was corrected by generating
the client with cache access, then rerunning checks successfully.

Not implemented: public catalogue API, exam UI, publication/admin tooling, attempt
history or official exam content/rules. No shared/live migration or deployment.
Real Safari/mobile hardware and frontend Docker image were not exercised.

Latest requested behavior: practice must automatically receive a random reviewed
database passage without a passage picker. This PR currently retains the local
word/custom practice UI; that requested database-backed practice flow is pending
the next read-API/frontend slice. Do not call the full typing application complete.
