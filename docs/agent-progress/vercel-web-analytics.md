# Vercel Web Analytics PR #67

[PR #67](https://github.com/HkSolDev/hodivo/pull/67) was open with remote head
`2f24707d435eafbb4d055d78be375e443ced6ff5`. The
[failing browser test](https://github.com/HkSolDev/hodivo/actions/runs/44905668917/job/136850580701)
filled the recommendations search with `Technical` and still saw three cards.

The input's React change handler updates the saved review view's search value,
which filters the rendered cards. The baseline browser check added the no-JavaScript
assertion from `e0a9ac8` to the original PR head. It failed because the
server-rendered input was enabled before the change handler could run.

The isolated PR worktree merged `origin/main` at `de09abb` and reused the
component and browser-test changes from `e0a9ac8`. The hydration guard keeps
search disabled until React can handle input. The browser test still checks
that searching for `Technical` yields one card and opens Technical Assistant.
The analytics allowlist and event filtering are unchanged from the original PR.

The production mobile browser test separately timed out twice waiting for
`networkidle` after reaching the expected URL. It now waits for
`domcontentloaded` and retains the URL, search value, and card count assertions.
The timeout log does not attribute that timeout to Analytics. Hydrogen Low and
DeepSeek Flash independently reviewed this conclusion using a sanitized summary.

## Verification

`pnpm test:web` finished with 188 passing, zero failures, and two opt-in
checks skipped. The skips were the committed job edit cache test
(`APTUS_TEST_JOB_EDIT_CACHE`) and the production file tool browser test
(`APTUS_PREPARE_FILE_TEST_ORIGIN`). The recommendations browser test passed
at mobile, tablet and desktop widths.

Tested code commit `d541c9f9097ea1465e2a378e49ac4674673be703`.

- `node --import tsx --test tests/web-analytics.test.ts` passed both tests for query and fragment stripping and private route exclusions.
- `pnpm typecheck` and focused ESLint on analytics, recommendations and their tests passed.
- `pnpm audit --prod --audit-level=low` found no known vulnerabilities.
- `node /private/tmp/hodivo-pr67-analytics-smoke.cjs` passed against the production build with a stub collection script. The browser registered the filter, sanitized the public URL and dropped the private URL.
- The production mobile browser test passed all eight checks after the wait change.
- The Python publication contract passed both checks after linking the existing
  release-worktree virtual environment, whose requirements file matches this checkout.
- `git diff --check origin/main...HEAD` passed.

The exact recommendations fixture requires Next.js development mode.
Running that fixture against a production server was unavailable because
the review fixture is development-only. The standard web suite builds Next.js
in production mode and runs the repository's separate production browser coverage.

Remote CI must run on the updated head after an authorized push. Live Vercel
event collection requires a deployment and remains unverified.
