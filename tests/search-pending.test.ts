import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, expect } from 'playwright/test';

const job = {
  id: 'search-fixture',
  postName: 'Example Technical Assistant',
  educationRequired: 'Diploma',
  applicationLastDate: null,
  vacancies: 4,
  payLevel: 'Level 6',
  source: { name: 'Example source' },
};
const graduate = {
  ...job,
  id: 'search-graduate',
  postName: 'Example Graduate Clerk',
  educationRequired: 'Graduation',
};

function jobsFor(url: string) {
  const params = new URL(url, 'http://localhost').searchParams;
  const q = (params.get('q') ?? '').trim().toLowerCase();
  if (q === 'no-such-job') return [];
  let items = [job, graduate];
  if (q) {
    items = items.filter((item) => item.postName.toLowerCase().includes(q));
  }
  if (params.get('qualification') === 'DIPLOMA') {
    items = items.filter((item) => item.educationRequired === 'Diploma');
  }
  if (params.get('qualification') === 'BACHELORS') {
    items = items.filter((item) => item.educationRequired === 'Graduation');
  }
  return items;
}

test('search shows immediate pending feedback without hiding current results', async (t) => {
  let failJobs = false;
  let jobsDelay = 0;
  let showNextPage = false;
  const api = createServer(
    async (request: IncomingMessage, response: ServerResponse) => {
      if (request.url === '/api/auth/get-session') {
        response.setHeader('Content-Type', 'application/json');
        response.statusCode = 401;
        response.end(JSON.stringify({ error: 'Please sign in again.' }));
        return;
      }
      if (jobsDelay) await delay(jobsDelay);
      const items = jobsFor(request.url ?? '/');
      response.setHeader('Content-Type', 'application/json');
      if (failJobs && request.url?.startsWith('/api/jobs')) {
        response.statusCode = 500;
        response.end('unavailable');
        return;
      }
      const page = Number(
        new URL(request.url ?? '/', 'http://localhost').searchParams.get(
          'page',
        ) ?? '1',
      );
      response.end(
        JSON.stringify(
          request.url?.startsWith('/api/jobs')
            ? {
                data: items.slice((page - 1) * 6, page * 6),
                pagination: {
                  page,
                  pageSize: 6,
                  totalItems: items.length,
                  totalPages: showNextPage
                    ? 2
                    : Math.max(1, Math.ceil(items.length / 6)),
                },
              }
            : job,
        ),
      );
    },
  );
  api.listen(0, '127.0.0.1');
  await once(api, 'listening');
  t.after(() => new Promise<void>((resolve) => api.close(() => resolve())));
  const address = api.address();
  assert(address && typeof address !== 'string');

  const next = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '-p', '18881'],
    {
      env: {
        ...process.env,
        BACKEND_INTERNAL_URL: `http://127.0.0.1:${address.port}`,
        APTUS_JOBS_CACHE_SECONDS: '0',
      },
      stdio: 'ignore',
    },
  );
  t.after(() => next.kill());
  const origin = 'http://127.0.0.1:18881';
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      ready = (await fetch(origin, { signal: AbortSignal.timeout(1000) })).ok;
      if (ready) break;
    } catch {
      /* Wait for the test server to listen. */
    }
    await delay(100);
  }
  assert(ready, 'Built Next.js test server must start');

  const bundled = chromium.executablePath();
  const browser = await chromium.launch({
    executablePath:
      process.env.APTUS_TEST_BROWSER ??
      (existsSync(bundled)
        ? bundled
        : '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
  });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('**/api/auth/**', (route) =>
    route.fulfill({ json: { user: null, enabled: false } }),
  );

  function searchStatus(target: typeof page) {
    return target
      .locator('form')
      .filter({ has: target.getByRole('searchbox') })
      .locator('[role="status"]');
  }

  async function searchFor(text: string, method: 'click' | 'enter') {
    const box = page.getByRole('searchbox', { name: 'Search all jobs' });
    await box.fill(text);
    if (method === 'enter') {
      await box.press('Enter');
      return;
    }
    await page.getByRole('button', { name: 'Search', exact: true }).click();
  }

  async function expectPendingKeepsResults(previousCount: number) {
    await expect(
      page.getByRole('button', { name: 'Searching…' }),
    ).toBeVisible();
    await expect(page.locator('[data-search-pending="true"]')).toBeVisible();
    await expect(page.getByText('Updating results')).toBeVisible();
    await expect(page.locator('[data-job-card]')).toHaveCount(previousCount);
    await expect(page.locator('form [role="status"]')).toHaveText('Searching…');
  }

  await page.goto(origin);
  await expect(page.locator('[data-job-card]')).toHaveCount(2);
  jobsDelay = 1200;

  await t.test(
    'button and Enter show pending, then the new count',
    async () => {
      await searchFor('technical', 'click');
      await expectPendingKeepsResults(2);
      await expect(page.locator('[data-job-card]')).toHaveCount(1);
      await expect(page.locator('[data-search-pending="false"]')).toHaveCount(
        1,
      );
      await expect(
        page.getByRole('button', { name: 'Search', exact: true }),
      ).toBeVisible();
      await expect(page.locator('form [role="status"]')).toHaveText(
        'Search finished',
      );
      await expect(page.getByText('1 jobs')).toBeVisible();

      await searchFor('graduate', 'enter');
      await expectPendingKeepsResults(1);
      await expect(page.locator('[data-job-card]')).toHaveCount(1);
      await expect(page.locator('form [role="status"]')).toHaveText(
        'Search finished',
      );
      assert.match(page.url(), /q=graduate/);
    },
  );

  await t.test('qualification changes use the same pending state', async () => {
    await page.getByRole('searchbox').fill('example');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Searching…' }),
    ).toBeVisible();
    await page
      .getByRole('combobox', { name: 'Qualification', exact: true })
      .selectOption('DIPLOMA');
    await expect(
      page.getByRole('button', { name: 'Searching…' }),
    ).toBeVisible();
    await expect(page).toHaveURL(/qualification=DIPLOMA/);
    await expect(page.locator('[data-job-card]')).toHaveCount(1);
    await expect(page.locator('form [role="status"]')).toHaveText(
      'Search finished',
    );
  });

  await t.test('empty results, editing, same query, and Back', async () => {
    await page.goto(origin);
    await page.getByRole('searchbox').fill('no-such-job');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'No jobs match your search' }),
    ).toBeVisible();
    await expect(page.locator('[data-search-pending="false"]')).toHaveCount(1);

    await page.getByRole('searchbox').fill('technical');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Searching…' }),
    ).toBeVisible();
    await page.getByRole('searchbox').fill('technical officer');
    await expect(page.locator('[data-search-pending="false"]')).toHaveCount(1);
    await expect(page.getByRole('searchbox')).toHaveValue('technical officer');
    assert.equal(new URL(page.url()).searchParams.get('q'), 'technical');

    await page.getByRole('searchbox').fill('technical');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await delay(80);
    await expect(page.getByRole('button', { name: 'Searching…' })).toHaveCount(
      0,
    );
    await expect(page.locator('[data-search-pending="true"]')).toHaveCount(0);

    await page.goto(`${origin}/?q=technical&page=2`);
    await page.getByRole('searchbox').fill('graduate');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page).toHaveURL(/q=graduate/);
    assert.equal(new URL(page.url()).searchParams.get('page'), null);
    await page.goBack();
    await expect(page.getByRole('searchbox')).toHaveValue('technical');
    await page.goForward();
    await expect(page.getByRole('searchbox')).toHaveValue('graduate');
    assert.equal(new URL(page.url()).searchParams.get('page'), null);
  });

  await t.test(
    'clearing draft text keeps the selected qualification',
    async () => {
      await page.goto(`${origin}/?qualification=BACHELORS`);
      await expect(
        page.getByRole('combobox', { name: 'Qualification', exact: true }),
      ).toHaveValue('BACHELORS');
      await page.getByRole('searchbox').fill('clerk');
      await page.getByRole('button', { name: 'Clear search text' }).click();
      await expect(page.getByRole('searchbox')).toHaveValue('');
      await expect(
        page.getByRole('combobox', { name: 'Qualification', exact: true }),
      ).toHaveValue('BACHELORS');
      assert.match(page.url(), /qualification=BACHELORS/);
      assert.equal(new URL(page.url()).searchParams.get('q'), null);
      await page
        .getByRole('link', { name: 'Clear search and filter' })
        .first()
        .click();
      await expect(page.locator('[data-job-card]')).toHaveCount(2);
      assert.equal(new URL(page.url()).searchParams.get('qualification'), null);
    },
  );

  await t.test('a failed jobs response clears the pending state', async () => {
    try {
      await page.goto(origin);
      failJobs = true;
      await page.getByRole('searchbox').fill('never-seen');
      await page.getByRole('button', { name: 'Search', exact: true }).click();
      await expect(
        page.getByRole('button', { name: 'Searching…' }),
      ).toBeVisible();
      await expect(
        page
          .getByRole('region', { name: 'Search results' })
          .getByText('temporarily unavailable'),
      ).toBeVisible();
      await expect(searchStatus(page)).toHaveText(
        'Jobs are temporarily unavailable. Please try again shortly.',
      );
      await expect(page.locator('[data-search-pending="false"]')).toHaveCount(
        1,
      );
      await expect(
        page.getByRole('button', { name: 'Search', exact: true }),
      ).toBeVisible();

      failJobs = false;
      await page.goto(origin);
      await page.getByRole('searchbox').fill('technical');
      await page.getByRole('button', { name: 'Search', exact: true }).click();
      await expect(page.locator('[data-job-card]')).toHaveCount(1);
      await page.getByRole('searchbox').fill('graduate');
      await page.getByRole('button', { name: 'Search', exact: true }).click();
      await expect(page).toHaveURL(/q=graduate/);
      failJobs = true;
      await page.getByRole('searchbox').fill('technical');
      await page.getByRole('button', { name: 'Search', exact: true }).click();
      await expect(
        page.getByRole('button', { name: 'Searching…' }),
      ).toBeVisible();
      await expect(
        page.getByText('Freshness could not be confirmed'),
      ).toBeVisible();
      await expect(searchStatus(page)).not.toHaveText('Search finished');
      await expect(page.locator('[data-job-card]')).toHaveCount(1);
      await expect(page.locator('[data-search-pending="false"]')).toHaveCount(
        1,
      );
      await expect(
        page.getByRole('button', { name: 'Search', exact: true }),
      ).toBeVisible();
    } finally {
      failJobs = false;
    }
  });

  await t.test(
    'a fresh visit treats explicit defaults as the same search',
    async () => {
      await page.setViewportSize({ width: 1100, height: 900 });
      await page.goto(origin);
      await page.getByRole('button', { name: 'Search', exact: true }).click();
      await delay(200);
      assert.equal(new URL(page.url()).search, '');
      await expect(
        page.getByRole('button', { name: 'Searching…' }),
      ).toHaveCount(0);

      await page.goto(`${origin}/?sort=newest`);
      await page.getByRole('button', { name: 'Search', exact: true }).click();
      await delay(200);
      assert.equal(new URL(page.url()).search, '?sort=newest');
      await expect(
        page.getByRole('button', { name: 'Searching…' }),
      ).toHaveCount(0);
    },
  );

  await t.test(
    'returning to the current search cancels the outstanding one',
    async () => {
      try {
        await page.goto(`${origin}/?q=clerk`);
        await expect(page.getByText('Example Graduate Clerk')).toBeVisible();
        jobsDelay = 2500;
        await page.getByRole('searchbox').fill('slow-assistant');
        await page.getByRole('button', { name: 'Search', exact: true }).click();
        await expect(
          page.getByRole('button', { name: 'Searching…' }),
        ).toBeVisible();
        await page.getByRole('searchbox').fill('clerk');
        await page.getByRole('searchbox').press('Enter');
        await expect(
          page.getByRole('button', { name: 'Searching…' }),
        ).toHaveCount(0);
        assert.equal(new URL(page.url()).searchParams.get('q'), 'clerk');
        await expect(page.locator('[data-search-pending="false"]')).toHaveCount(
          1,
        );
        await delay(3000);
        assert.equal(new URL(page.url()).searchParams.get('q'), 'clerk');
        await expect(page.getByText('Example Graduate Clerk')).toBeVisible();
        await expect(page.locator('[data-job-card]')).toHaveCount(1);
      } finally {
        jobsDelay = 0;
      }
    },
  );

  await t.test(
    'sort, layout, pagination, and clear interrupt a pending search',
    async () => {
      try {
        jobsDelay = 2500;
        await page.goto(origin);
        await page.getByRole('searchbox').fill('slow-assistant');
        await page.getByRole('button', { name: 'Search', exact: true }).click();
        await expect(
          page.getByRole('button', { name: 'Searching…' }),
        ).toBeVisible();
        await page
          .getByRole('combobox', { name: 'Sort all jobs' })
          .selectOption('soonest');
        await expect(page).toHaveURL(/sort=soonest/);
        assert.equal(new URL(page.url()).searchParams.get('q'), null);
        await expect(page.locator('[data-search-pending="false"]')).toHaveCount(
          1,
        );
        await delay(3000);
        assert.equal(new URL(page.url()).searchParams.get('q'), null);
        await expect(page).toHaveURL(/sort=soonest/);

        await page.getByRole('searchbox').fill('slow-assistant');
        await page.getByRole('button', { name: 'Search', exact: true }).click();
        await expect(
          page.getByRole('button', { name: 'Searching…' }),
        ).toBeVisible();
        await page.getByRole('button', { name: 'Cards', exact: true }).click();
        await expect(page).toHaveURL(/layout=cards/);
        assert.equal(new URL(page.url()).searchParams.get('q'), null);
        await expect(page.locator('[data-search-pending="false"]')).toHaveCount(
          1,
        );
        await delay(3000);
        assert.doesNotMatch(page.url(), /slow-assistant/);

        showNextPage = true;
        await page.goto(origin);
        await page.getByRole('searchbox').fill('slow-assistant');
        await page.getByRole('button', { name: 'Search', exact: true }).click();
        await expect(
          page.getByRole('button', { name: 'Searching…' }),
        ).toBeVisible();
        await page.getByRole('link', { name: /Next page/ }).click();
        await expect(page).toHaveURL(/page=2/);
        assert.equal(new URL(page.url()).searchParams.get('q'), null);
        await expect(page.locator('[data-search-pending="false"]')).toHaveCount(
          1,
        );
        await delay(3000);
        assert.equal(new URL(page.url()).searchParams.get('q'), null);

        showNextPage = false;
        jobsDelay = 0;
        await page.goto(`${origin}/?q=technical`);
        await expect(
          page.getByText('Example Technical Assistant'),
        ).toBeVisible();
        jobsDelay = 2500;
        await page.getByRole('searchbox').fill('slow-assistant');
        await page.getByRole('button', { name: 'Search', exact: true }).click();
        await expect(
          page.getByRole('button', { name: 'Searching…' }),
        ).toBeVisible();
        await page
          .getByRole('link', { name: 'Clear search and filter' })
          .first()
          .click();
        await expect(page.locator('[data-job-card]')).toHaveCount(2);
        assert.equal(new URL(page.url()).searchParams.get('q'), null);
        await expect(page.locator('[data-search-pending="false"]')).toHaveCount(
          1,
        );
        await delay(3000);
        assert.doesNotMatch(page.url(), /slow-assistant/);
        await expect(page.locator('[data-job-card]')).toHaveCount(2);
      } finally {
        jobsDelay = 0;
        showNextPage = false;
      }
    },
  );

  await t.test(
    'mobile filters, keyboard, reduced motion, and themes',
    async () => {
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(origin);
      const toggle = page.getByRole('button', { name: /^Filters/ });
      await toggle.focus();
      await page.keyboard.press('Enter');
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(
        page.getByRole('combobox', { name: 'Qualification', exact: true }),
      ).toBeVisible();

      await page.emulateMedia({ reducedMotion: 'reduce' });
      jobsDelay = 4000;
      await page.getByRole('searchbox').fill('slow-theme');
      await page.getByRole('button', { name: 'Search', exact: true }).click();
      const searching = page.getByRole('button', { name: 'Searching…' });
      await expect(searching).toBeVisible();
      assert.equal(
        await searching.evaluate((element) => {
          const spinner = element.querySelector('[class*="spinner"]');
          return spinner ? getComputedStyle(spinner).display : 'missing';
        }),
        'none',
      );
      const readButton = () =>
        searching.evaluate((element) => ({
          background: getComputedStyle(element).backgroundColor,
          theme: document.documentElement.getAttribute('data-theme'),
          accent: getComputedStyle(document.documentElement)
            .getPropertyValue('--accent')
            .trim(),
        }));
      await page.getByRole('button', { name: 'Switch to dark mode' }).click();
      await expect(searching).toHaveCSS(
        'background-color',
        'rgb(245, 245, 247)',
      );
      const dark = await readButton();
      await page.getByRole('button', { name: 'Switch to light mode' }).click();
      await expect(searching).toHaveCSS('background-color', 'rgb(29, 29, 31)');
      const light = await readButton();
      assert.equal(dark.theme, 'dark');
      assert.equal(light.theme, 'light');
      assert.equal(dark.accent, '#f5f5f7');
      assert.equal(light.accent, '#1d1d1f');
      await expect(page.locator('[data-job-card]')).toHaveCount(0);
      await expect(page.locator('[data-search-pending="false"]')).toHaveCount(
        1,
      );
    },
  );

  await t.test(
    'Back and Forward restore the committed query when only sort or page changes',
    async () => {
      jobsDelay = 0;
      await page.setViewportSize({ width: 1100, height: 900 });
      await page.goto(`${origin}/?q=technical`);
      await expect(page.getByRole('searchbox')).toHaveValue('technical');
      await page
        .getByRole('combobox', { name: 'Sort all jobs' })
        .selectOption('soonest');
      await expect(page).toHaveURL(/sort=soonest/);
      assert.equal(new URL(page.url()).searchParams.get('q'), 'technical');
      await page.getByRole('searchbox').fill('unsent sort draft');
      await page.goBack();
      await expect(page).not.toHaveURL(/sort=soonest/);
      await expect(page.getByRole('searchbox')).toHaveValue('technical');
      await page.goForward();
      await expect(page).toHaveURL(/sort=soonest/);
      await expect(page.getByRole('searchbox')).toHaveValue('technical');

      showNextPage = true;
      await page.goto(`${origin}/?q=technical`);
      await page.getByRole('link', { name: /Next page/ }).click();
      await expect(page).toHaveURL(/page=2/);
      assert.equal(new URL(page.url()).searchParams.get('q'), 'technical');
      await page.getByRole('searchbox').fill('unsent page draft');
      await page.goBack();
      await expect(page).not.toHaveURL(/page=2/);
      await expect(page.getByRole('searchbox')).toHaveValue('technical');
      await page.goForward();
      await expect(page).toHaveURL(/page=2/);
      await expect(page.getByRole('searchbox')).toHaveValue('technical');
      showNextPage = false;
    },
  );

  await t.test(
    'a failed client search reloads instead of staying on Searching',
    async () => {
      jobsDelay = 0;
      const failed = await browser.newPage();
      try {
        await failed.route('**/api/auth/**', (route) =>
          route.fulfill({ json: { user: null, enabled: false } }),
        );
        await failed.route('**/*', async (route) => {
          const request = route.request();
          const url = request.url();
          const isFlight =
            url.includes('_rsc=') || request.headers().rsc === '1';
          if (isFlight && url.includes('abort-search')) {
            await route.abort('failed');
            return;
          }
          if (isFlight && url.includes('status-search')) {
            await route.fulfill({
              status: 500,
              contentType: 'text/plain',
              body: 'unavailable',
            });
            return;
          }
          await route.continue();
        });
        for (const query of ['abort-search', 'status-search']) {
          await failed.goto(origin);
          await failed.evaluate(() => {
            window.__searchDocument = 'spa';
          });
          await failed.getByRole('searchbox').fill(query);
          await failed
            .getByRole('button', { name: 'Search', exact: true })
            .click();
          await expect(failed).toHaveURL(new RegExp(`q=${query}`));
          assert.equal(
            await failed.evaluate(() => window.__searchDocument ?? null),
            null,
          );
          await expect(
            failed.getByRole('button', { name: 'Searching…' }),
          ).toHaveCount(0);
          await expect(
            failed.locator('[data-search-pending="false"]'),
          ).toHaveCount(1);
        }
      } finally {
        await failed.close();
      }
    },
  );

  await t.test('no-JavaScript GET search still works', async () => {
    jobsDelay = 0;
    const plain = await browser.newContext({ javaScriptEnabled: false });
    try {
      const noJs = await plain.newPage();
      await noJs.goto(origin);
      await noJs.getByRole('searchbox').fill('technical');
      await noJs
        .getByRole('combobox', { name: 'Qualification', exact: true })
        .selectOption('DIPLOMA');
      await noJs.getByRole('button', { name: 'Search', exact: true }).click();
      await expect(noJs).toHaveURL(/q=technical/);
      await expect(noJs).toHaveURL(/qualification=DIPLOMA/);
      await expect(noJs.locator('[data-job-card]')).toHaveCount(1);
      await expect(
        noJs.getByRole('button', { name: 'Searching…' }),
      ).toHaveCount(0);
    } finally {
      await plain.close();
    }
  });
});
