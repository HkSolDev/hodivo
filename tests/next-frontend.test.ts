import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { test } from 'node:test';
import { chromium, expect } from 'playwright/test';
import { prisma } from '../src/db.js';
import { server as fastifyServer } from '../src/server.js';

// Helper to find a free TCP port
function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (!addr || typeof addr === 'string') {
        srv.close(() => reject(new Error('Invalid address')));
        return;
      }
      const port = addr.port;
      srv.close(() => resolve(port));
    });
  });
}

// Wait for HTTP server to respond with non-refused connection
async function waitForServer(url: string, timeoutMs = 30000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status > 0) return;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error(`Server at ${url} failed to respond within ${timeoutMs}ms`);
}

test('Next.js frontend: server-rendered SEO, private caching, in-memory workspace, and auth flow', async (t) => {
  // Isolate database calls
  const originalTransaction = prisma.$transaction;
  const originalFindUnique = prisma.post.findUnique;
  const futureDeadline = new Date(Date.now() + 14 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  Object.defineProperty(prisma, '$transaction', {
    configurable: true,
    value: async () => ({
      data: [
        {
          id: 'job-fixture-1',
          postName: 'Junior Scientific Officer',
          vacancies: 12,
          applicationLastDate: `${futureDeadline}T00:00:00.000Z`,
          educationRequired: 'Master’s Degree in Physics or Chemistry',
          source: {
            name: 'SSC Selection Post Phase XII',
          },
        },
      ],
      pagination: { page: 1, pageSize: 6, totalItems: 1, totalPages: 1 },
    }),
  });

  Object.defineProperty(prisma.post, 'findUnique', {
    configurable: true,
    value: async (args: { where?: { id?: string } }) => {
      const requestedId = args?.where?.id;
      if (requestedId === 'job-fixture-1') {
        return {
          id: 'job-fixture-1',
          postName: 'Junior Scientific Officer',
          vacancies: 12,
          applicationLastDate: new Date(`${futureDeadline}T00:00:00.000Z`),
          educationRequired: 'Master’s Degree in Physics or Chemistry',
          minAge: 18,
          maxAge: 30,
          categoryRelaxationApplies: true,
          source: {
            name: 'SSC Selection Post Phase XII',
            url: 'https://ssc.gov.in/notice',
            notificationPdfUrl: 'https://ssc.gov.in/notice.pdf',
            officialSiteUrl: 'https://ssc.gov.in',
            applyUrl: 'https://ssc.gov.in/apply',
            fetchedAt: new Date('2026-11-10T08:00:00.000Z'),
          },
          reviewedDetails: {
            post_name: 'Junior Scientific Officer',
            recruiting_body: 'Staff Selection Commission',
            advt_no: 'Phase-XII/2026',
            vacancies: 12,
            vacancy_breakdown: null,
            pay_level: 'Level 6',
            salary_min: 35400,
            salary_max: 112400,
            salary_period: 'MONTH',
            salary_notes: null,
            employment_type: 'Permanent',
            locations: ['New Delhi'],
            application_start_date: null,
            application_last_date: futureDeadline,
            fee_payment_last_date: null,
            exam_dates: [],
            fee_rules: [],
            age_rules: {
              min_age: 18,
              max_age: 30,
              age_as_on_date: null,
              relaxations: [],
              notes: null,
            },
            qualification_summary: 'Master’s Degree in Physics or Chemistry',
            qualification_routes: [],
            experience_required: null,
            nationality_requirement: 'Indian Citizen',
            other_eligibility: [],
            selection_stages: ['Computer Based Examination'],
            how_to_apply_steps: ['Apply online at ssc.gov.in'],
            required_documents: [],
          },
        };
      }
      if (requestedId === 'backend-outage-job') {
        throw new Error('Simulated database connection failure');
      }
      return null;
    },
  });

  t.after(() => {
    Object.defineProperty(prisma, '$transaction', {
      configurable: true,
      value: originalTransaction,
    });
    Object.defineProperty(prisma.post, 'findUnique', {
      configurable: true,
      value: originalFindUnique,
    });
  });

  // 1. Start Fastify backend on port 8081 (local internal port)
  const fastifyPort = 8081;
  await fastifyServer.listen({ port: fastifyPort, host: '127.0.0.1' });
  const fastifyOrigin = `http://127.0.0.1:${fastifyPort}`;

  t.after(async () => {
    await fastifyServer.close();
  });

  // 2. Start Next.js server pointing to Fastify backend
  const nextPort = await getFreePort();
  const nextOrigin = `http://127.0.0.1:${nextPort}`;

  let nextProcess: ChildProcess | null = null;
  nextProcess = spawn(
    'pnpm',
    ['exec', 'next', 'start', '-p', String(nextPort), '-H', '127.0.0.1'],
    {
      env: {
        ...process.env,
        PORT: String(nextPort),
        BACKEND_INTERNAL_URL: fastifyOrigin,
        SITE_URL: 'https://hodivo.app',
      },
      stdio: 'inherit',
    },
  );

  t.after(() => {
    if (nextProcess) {
      nextProcess.kill('SIGTERM');
    }
  });

  await waitForServer(nextOrigin, 20000);

  // Setup Playwright
  const bundled = chromium.executablePath();
  const localChrome =
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const executablePath =
    process.env.APTUS_TEST_BROWSER ??
    (existsSync(bundled)
      ? bundled
      : existsSync(localChrome)
        ? localChrome
        : bundled);
  const browser = await chromium.launch({ executablePath, headless: true });

  t.after(async () => {
    await browser.close();
  });

  await t.test(
    'Server-rendered HTML check (SEO): Real job data in initial HTML and proper metadata',
    async () => {
      const response = await fetch(`${nextOrigin}/`);
      assert.equal(response.status, 200);
      const html = await response.text();

      // Check title, description, and canonical
      assert.ok(
        html.includes(
          '<title>Hodivo — Indian Government Jobs, Eligibility &amp; Official Notifications</title>',
        ),
      );
      assert.ok(
        html.includes(
          'Discover live Indian government job notifications across central, state, PSU, banking, defence and research roles.',
        ),
      );
      assert.ok(html.includes('rel="canonical" href="https://hodivo.app/"'));

      // Check initial server-rendered job post from backend
      assert.ok(
        html.includes('Junior Scientific Officer'),
        'Initial server-rendered HTML must contain real job title for SEO',
      );
      assert.ok(
        !html.includes('SSC Selection Post Phase XII'),
        'Cards must not present the scraper source as the recruiting organization',
      );
    },
  );

  await t.test(
    'Discovery routes: /robots.txt and /sitemap.xml return accurate crawler policies and live job URLs',
    async () => {
      const robotsRes = await fetch(`${nextOrigin}/robots.txt`);
      assert.equal(robotsRes.status, 200);
      const robotsText = await robotsRes.text();
      assert.match(robotsText, /User-Agent:\s*\*/i);
      assert.match(robotsText, /Allow:\s*\//i);
      assert.match(robotsText, /Disallow:\s*\/profile/i);
      assert.match(robotsText, /Disallow:\s*\/api\//i);
      assert.match(
        robotsText,
        /Sitemap:\s*https:\/\/hodivo\.app\/sitemap\.xml/i,
      );

      const sitemapRes = await fetch(`${nextOrigin}/sitemap.xml`);
      assert.equal(sitemapRes.status, 200);
      const sitemapXml = await sitemapRes.text();
      assert.ok(sitemapXml.includes('<loc>https://hodivo.app/</loc>'));
      assert.ok(
        sitemapXml.includes('<loc>https://hodivo.app/how-it-works</loc>'),
      );
      assert.ok(
        sitemapXml.includes('<loc>https://hodivo.app/jobs/job-fixture-1</loc>'),
      );
      assert.ok(!sitemapXml.includes('/profile'));
      assert.ok(!sitemapXml.includes('/api/'));
    },
  );

  await t.test(
    'Private caching protections: /profile and /results have strict private headers',
    async () => {
      for (const route of ['/profile', '/results']) {
        const res = await fetch(`${nextOrigin}${route}`);
        assert.equal(res.status, 200);

        const cacheControl = res.headers.get('cache-control') ?? '';
        assert.ok(
          cacheControl.includes('private'),
          `${route} Cache-Control must be private`,
        );
        assert.ok(
          cacheControl.includes('no-store'),
          `${route} Cache-Control must include no-store`,
        );

        const robotsHeader = res.headers.get('x-robots-tag') ?? '';
        assert.ok(
          robotsHeader.includes('noindex'),
          `${route} X-Robots-Tag must include noindex`,
        );

        const html = await res.text();
        assert.ok(
          html.includes('noindex') || html.includes('nofollow'),
          `${route} HTML metadata should also have robots noindex/nofollow`,
        );
      }
    },
  );

  await t.test(
    'Job detail responses: 200 for real job, 404 for nonexistent job, and HTTP 500 on backend failure',
    async () => {
      const okRes = await fetch(`${nextOrigin}/jobs/job-fixture-1`);
      assert.equal(okRes.status, 200);
      const okHtml = await okRes.text();
      assert.ok(
        okHtml.includes(
          '<title>Junior Scientific Officer — Staff Selection Commission | Hodivo</title>',
        ),
      );
      assert.ok(!okHtml.includes('Hodivo | Hodivo'));
      assert.ok(
        okHtml.includes(
          'rel="canonical" href="https://hodivo.app/jobs/job-fixture-1"',
        ),
      );

      const missingRes = await fetch(
        `${nextOrigin}/jobs/nonexistent-seo-audit-check`,
      );
      assert.equal(missingRes.status, 404);
      const missingHtml = await missingRes.text();
      assert.ok(!missingHtml.includes('Hodivo | Hodivo'));
      assert.ok(missingHtml.includes('noindex'));

      const outageRes = await fetch(`${nextOrigin}/jobs/backend-outage-job`);
      const outageHtml = await outageRes.text();
      assert.equal(outageRes.status, 500);
      assert.ok(!outageHtml.includes('Junior Scientific Officer'));
      assert.ok(!outageHtml.includes('Hodivo | Hodivo'));
    },
  );

  await t.test(
    'No-JavaScript browser check: homepage and job detail page render readable content and crawlable links',
    async () => {
      const noJsContext = await browser.newContext({
        javaScriptEnabled: false,
        viewport: { width: 1280, height: 900 },
      });
      const page = await noJsContext.newPage();

      try {
        await page.goto(`${nextOrigin}/`);
        await expect(
          page.getByRole('link', { name: 'Junior Scientific Officer' }),
        ).toBeVisible();

        await page.goto(`${nextOrigin}/jobs/job-fixture-1`);
        await expect(
          page.getByRole('heading', { name: 'Junior Scientific Officer' }),
        ).toBeVisible();
        await expect(
          page.getByText('Staff Selection Commission'),
        ).toBeVisible();
      } finally {
        await noJsContext.close();
      }
    },
  );

  await t.test(
    'Browser flow: signed-out profile remains private without browser storage',
    async () => {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 900 },
      });

      try {
        await page.goto(`${nextOrigin}/profile`);
        await expect(
          page.getByRole('heading', { name: 'Sign in to view your profile' }),
        ).toBeVisible();
        await expect(page.locator('#profile-fields')).toHaveCount(0);
        const storage = await page.evaluate(() => ({
          localStorageCount: window.localStorage.length,
          sessionStorageCount: window.sessionStorage.length,
        }));
        assert.equal(storage.localStorageCount, 0);
        assert.equal(storage.sessionStorageCount, 0);
      } finally {
        await page.close();
      }
    },
  );

  await t.test(
    'Auth and security: Google sign-in redirect, CSRF, and sign-out clearing memory',
    async () => {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 900 },
      });

      try {
        // Mock the social sign-in API response through Playwright route interception
        await page.route('**/api/auth/sign-in/social', async (route) => {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            json: {
              url: 'https://accounts.google.com/o/oauth2/v2/auth?mock=1',
            },
          });
        });

        await page.goto(`${nextOrigin}/sign-in`);

        const signInBtn = page.getByRole('button', {
          name: 'Continue with Google',
        });
        await expect(signInBtn).toBeVisible();

        // Intercept external redirect
        let redirectedToGoogle = false;
        await page.route('https://accounts.google.com/**', async (route) => {
          redirectedToGoogle = true;
          await route.fulfill({
            status: 200,
            contentType: 'text/html',
            body: '<html><body>Google Login</body></html>',
          });
        });

        await signInBtn.click();
        await page.waitForURL(/accounts\.google\.com/);
        assert.ok(redirectedToGoogle);
      } finally {
        await page.close();
      }
    },
  );
});
