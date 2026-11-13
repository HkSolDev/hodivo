import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { closeSync, existsSync, mkdtempSync, openSync } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { test } from 'node:test';
import { chromium, expect } from 'playwright/test';

test('public typing practice works in an isolated browser session', async (t) => {
  let nextText = 'cat';
  let fixtureId = 0;
  let apiState: 'ready' | 'empty' | 'error' | 'malformed' | 'slow' = 'ready';
  let heldResponse: ServerResponse | null = null;
  const passageRequests: string[] = [];
  const api = createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/api/typing/practice-passage') {
      passageRequests.push(`${request.method} ${request.url}`);
      if (apiState === 'slow') {
        heldResponse = response;
        return;
      }
      if (apiState === 'error') {
        response.statusCode = 503;
        response.end(JSON.stringify({ error: 'Unavailable' }));
        return;
      }
      response.end(
        JSON.stringify(
          apiState === 'malformed'
            ? { passage: { text: 'bad' } }
            : {
                passage:
                  apiState === 'empty'
                    ? null
                    : {
                        id: `fixture-${fixtureId}`,
                        title: 'Fixture passage',
                        text: nextText,
                      },
              },
        ),
      );
      return;
    }
    response.end(JSON.stringify({ user: null, enabled: false }));
  });
  api.listen(0, '127.0.0.1');
  await once(api, 'listening');
  t.after(
    () =>
      new Promise<void>((resolve) => {
        api.close(() => resolve());
        api.closeAllConnections();
      }),
  );
  const address = api.address();
  assert(address && typeof address !== 'string');
  const logPath = join(
    mkdtempSync(join(tmpdir(), 'aptus-typing-log-')),
    'next.log',
  );
  const log = openSync(logPath, 'w');
  const next = spawn(
    process.execPath,
    [
      'node_modules/next/dist/bin/next',
      'dev',
      '--webpack',
      '-H',
      '127.0.0.1',
      '-p',
      '18912',
    ],
    {
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: '1',
        // Keep framework upgrade prompts out of this isolated test server.
        __NEXT_AGENT_UPGRADE_FORCE_TERMINAL_FOR_TESTING: '1',
        TERM: 'dumb',
        BACKEND_INTERNAL_URL: `http://127.0.0.1:${address.port}`,
      },
      stdio: ['ignore', log, log],
    },
  );
  t.after(async () => {
    if (next.exitCode === null && next.signalCode === null) {
      next.kill();
      await once(next, 'exit');
    }
    closeSync(log);
  });
  const origin = 'http://127.0.0.1:18912';
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    assert.equal(next.exitCode, null, `Next exited; inspect ${logPath}`);
    try {
      await fetch(`${origin}/typing`, { signal: AbortSignal.timeout(1000) });
      ready = true;
      break;
    } catch {
      await setTimeout(100);
    }
  }
  assert(ready, 'Isolated Next test server must start');
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
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const response = await page.goto(`${origin}/typing`);
  assert.equal(response?.status(), 200);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Typing practice',
  );

  const input = page.getByRole('textbox', {
    name: 'Type the passage here',
    exact: true,
  });
  const summary = page.getByRole('region', { name: 'Session summary' });
  await expect(input).toBeEnabled();
  async function setPassage(text: string) {
    nextText = text;
    fixtureId++;
    await page
      .getByRole('button', { name: 'Next passage', exact: true })
      .click();
    await expect(page.getByLabel('Passage to type')).toHaveText(text);
    await expect(input).toBeEnabled();
  }

  await t.test(
    'corrected errors stay in attempt history and restart clears the session',
    async () => {
      await setPassage('cat');
      await input.pressSequentially('cx');
      await input.press('Backspace');
      await input.pressSequentially('at');
      await expect(summary).toBeVisible();
      await expect(summary).toContainText('75%');
      await expect(summary).toContainText('3 correct / 1 incorrect');
      await page.getByRole('button', { name: 'Restart', exact: true }).click();
      await expect(input).toHaveValue('');
      await expect(summary).toHaveCount(0);
      await expect(page.getByRole('status')).toContainText('first keystroke');
    },
  );

  await t.test(
    'identical selected-character replacement still counts as an attempt',
    async () => {
      await setPassage('cab');
      await input.pressSequentially('c');
      await input.press('Shift+ArrowLeft');
      await input.pressSequentially('c');
      await input.pressSequentially('ab');
      await expect(summary).toContainText('4 correct / 0 incorrect');
      await page.getByRole('button', { name: 'Restart', exact: true }).click();
    },
  );

  await t.test(
    'partial selected-text replacements count the whole native insertion',
    async () => {
      await setPassage('abcde');
      await input.pressSequentially('ab');
      await input.press('ControlOrMeta+A');
      await page.keyboard.insertText('aB');
      await input.pressSequentially('cde');
      await expect(summary).toContainText('6 correct / 1 incorrect');
      await page.getByRole('button', { name: 'Restart', exact: true }).click();
    },
  );

  await t.test(
    'pause excludes time away and duration completes the session',
    async () => {
      await setPassage('a long passage for the timer');
      await page.getByRole('textbox', { name: 'Custom seconds' }).fill('2');
      await page.getByRole('button', { name: 'Set', exact: true }).click();
      await input.pressSequentially('a');
      await page.getByRole('heading', { level: 1 }).click();
      await expect(
        page.getByRole('button', { name: 'Resume', exact: true }),
      ).toBeVisible();
      await setTimeout(2200);
      await expect(summary).toHaveCount(0);
      await page.getByRole('button', { name: 'Resume', exact: true }).click();
      await expect(input).toBeFocused();
      await expect(summary).toBeVisible({ timeout: 4000 });
      await expect(summary).toContainText('2s');
      await page.getByRole('button', { name: 'Restart', exact: true }).click();
    },
  );

  await t.test(
    'duration validation remains and server passage markup renders literally',
    async () => {
      await page.getByRole('textbox', { name: 'Custom seconds' }).fill('1.5');
      await page.getByRole('button', { name: 'Set', exact: true }).click();
      await expect(
        page.getByText('Enter a whole number of seconds', { exact: false }),
      ).toBeVisible();
      await page.getByRole('button', { name: '15s', exact: true }).click();
      await setPassage('<img src=x onerror=alert(1)>');
      await expect(page.getByLabel('Passage to type')).toHaveText(
        '<img src=x onerror=alert(1)>',
      );
      await expect(page.locator('main img')).toHaveCount(0);
    },
  );

  await t.test(
    'unsupported direct input is rejected and cancelling composition preserves the next key',
    async () => {
      try {
        await setPassage('cat');
        await input.focus();
        await page.keyboard.insertText('é');
        await expect(input).toHaveValue('');
        await expect(page.getByRole('status')).toContainText(
          /English|supported|plain/,
        );
        const cdp = await page.context().newCDPSession(page);
        try {
          await cdp.send('Input.imeSetComposition', {
            text: 'a',
            selectionStart: 1,
            selectionEnd: 1,
          });
          await page.keyboard.insertText('a');
          await expect(input).toHaveValue('');
        } finally {
          await cdp.detach();
        }
        await input.dispatchEvent('compositionstart', { data: '' });
        await input.dispatchEvent('compositionend', { data: '' });
        await input.pressSequentially('cat');
        await expect(summary).toContainText('3 correct / 0 incorrect');
      } finally {
        await page
          .getByRole('button', { name: 'Restart', exact: true })
          .click();
      }
    },
  );

  await t.test(
    'light and dark layouts fit supported widths and footer navigation works',
    async () => {
      await setPassage('x'.repeat(200));
      const screenshots = mkdtempSync(join(tmpdir(), 'aptus-typing-review-'));
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme });
        for (const width of [320, 390, 568, 834, 1440, 1920]) {
          await page.setViewportSize({ width, height: 900 });
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth > innerWidth,
            ),
            false,
          );
          await expect(input).toBeVisible();
          await input.click();
          await input.pressSequentially('x');
          await expect(input).toHaveValue('x');
          await page
            .getByRole('button', { name: 'Restart', exact: true })
            .click();
          await expect(input).toHaveValue('');
          if ([320, 390, 1440].includes(width)) {
            await page.screenshot({
              path: join(screenshots, `${colorScheme}-${width}.png`),
              fullPage: true,
            });
          }
        }
      }
      await setPassage('x'.repeat(10000));
      await page.setViewportSize({ width: 390, height: 900 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      t.diagnostic(`Typing review screenshots: ${screenshots}`);
      await page
        .getByRole('link', { name: /How (?:Aptus|Hodivo) works/ })
        .click();
      await expect(page).toHaveURL(`${origin}/how-it-works`);
      await page
        .getByRole('link', { name: 'Typing practice', exact: true })
        .click();
      await expect(page).toHaveURL(`${origin}/typing`);
      await expect(input).toHaveValue('');
    },
  );

  await t.test(
    'narrow touch and keyboard activation can restart practice',
    async () => {
      const touch = await browser.newContext({
        hasTouch: true,
        isMobile: true,
        viewport: { width: 320, height: 740 },
      });
      try {
        const mobile = await touch.newPage();
        await mobile.goto(`${origin}/typing`);
        nextText = 'cat';
        fixtureId++;
        await mobile
          .getByRole('button', { name: 'Next passage', exact: true })
          .tap();
        const mobileInput = mobile.getByRole('textbox', {
          name: 'Type the passage here',
          exact: true,
        });
        const restart = mobile.getByRole('button', {
          name: 'Restart',
          exact: true,
        });
        await expect(mobileInput).toBeEnabled();
        await mobileInput.tap();
        await mobileInput.pressSequentially('c');
        await restart.tap();
        await expect(mobileInput).toHaveValue('');
        await mobileInput.pressSequentially('c');
        await restart.press('Enter');
        await expect(mobileInput).toHaveValue('');
      } finally {
        await touch.close();
      }
    },
  );

  await t.test(
    'empty, failure and malformed responses disable input and retry recovers',
    async () => {
      await page.goto(`${origin}/typing`);
      await expect(input).toBeEnabled();
      for (const state of ['empty', 'error', 'malformed'] as const) {
        apiState = state;
        await page
          .getByRole('button', { name: 'Next passage', exact: true })
          .click();
        await expect(input).toBeDisabled();
        await expect(
          page.getByRole('button', { name: 'Retry', exact: true }),
        ).toBeVisible();
        apiState = 'ready';
        nextText = 'cat';
        fixtureId++;
        await page.getByRole('button', { name: 'Retry', exact: true }).click();
        await expect(input).toBeEnabled();
        await expect(page.getByLabel('Passage to type')).toHaveText('cat');
      }
      assert(passageRequests.length > 0);
      assert(
        passageRequests.every(
          (request) => request === 'GET /api/typing/practice-passage',
        ),
      );
      await expect(
        page.getByRole('button', { name: 'Custom text', exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Words', exact: true }),
      ).toHaveCount(0);
    },
  );

  await t.test(
    'loading disables editing and navigation cannot restore a stale passage',
    async () => {
      apiState = 'slow';
      await page
        .getByRole('button', { name: 'Next passage', exact: true })
        .click();
      await expect(input).toBeDisabled();
      await expect(
        page.getByRole('button', { name: 'Next passage', exact: true }),
      ).toBeDisabled();
      await expect.poll(() => heldResponse !== null).toBe(true);
      await page.goto(`${origin}/how-it-works`);
      apiState = 'ready';
      nextText = 'Fresh passage after navigation.';
      fixtureId++;
      await page.goto(`${origin}/typing`);
      await expect(input).toBeEnabled();
      await expect(page.getByLabel('Passage to type')).toHaveText(nextText);
      heldResponse?.end(
        JSON.stringify({
          passage: { id: 'stale', title: 'Stale', text: 'Old passage.' },
        }),
      );
      await expect(page.getByLabel('Passage to type')).toHaveText(nextText);
    },
  );

  const plain = await browser.newContext({ javaScriptEnabled: false });
  try {
    const noJs = await plain.newPage();
    await noJs.goto(`${origin}/typing`);
    await expect(noJs.locator('noscript p')).toBeVisible();
    await expect(noJs.locator('noscript p')).toContainText(/JavaScript/);
    await expect(
      noJs.getByRole('link', { name: /How (?:Aptus|Hodivo) works/ }),
    ).toBeVisible();
  } finally {
    await plain.close();
  }
  assert.deepEqual(errors, []);
});
