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
    const hindiPassage = {
      id: 'imported-hindi',
      title: 'हिन्दी अनुच्छेद',
      text: 'सुबह मैं अपनी किताबें',
    };
    if (request.url === '/api/typing/practice-passages') {
      const { id, title } = hindiPassage;
      response.end(
        JSON.stringify({ passages: [{ id, title }], nextCursor: null }),
      );
      return;
    }
    if (request.url === '/api/typing/practice-passages/imported-hindi') {
      response.end(
        JSON.stringify({ passage: { ...hindiPassage, language: 'hi' } }),
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
      await page.clock.install();
      await setPassage('a long passage for the timer');
      await page.getByRole('button', { name: '2m', exact: true }).click();
      await input.pressSequentially('a');
      await input.press('Escape');
      const resumeOverlay = page.getByRole('button', {
        name: /Session paused — Click here to resume/i,
      });
      await expect(resumeOverlay).toBeVisible();
      await page.clock.fastForward(65000);
      await expect(summary).toHaveCount(0);
      await resumeOverlay.click();
      await expect(input).toBeFocused();
      await page.clock.fastForward(121000);
      await expect(summary).toBeVisible();
      await expect(summary).toContainText('120s');
      await page.getByRole('button', { name: 'Restart', exact: true }).click();
    },
  );

  await t.test(
    'duration presets, custom minutes stepper and server passage markup work literally',
    async () => {
      await page
        .getByRole('button', { name: 'Increase custom minutes', exact: true })
        .click();
      await page.getByRole('button', { name: 'Set', exact: true }).click();
      await page.getByRole('button', { name: '2m', exact: true }).click();
      await setPassage('<img src=x onerror=alert(1)>');
      await expect(page.getByLabel('Passage to type')).toHaveText(
        '<img src=x onerror=alert(1)>',
      );
      await expect(page.locator('main img')).toHaveCount(0);
    },
  );

  await t.test('composition scores only the committed edit', async () => {
    await setPassage('MMa');
    await input.focus();
    const cdp = await page.context().newCDPSession(page);
    try {
      const compose = (text: string) =>
        cdp.send('Input.imeSetComposition', {
          text,
          selectionStart: text.length,
          selectionEnd: text.length,
        });

      await compose('m');
      await expect(input).toHaveValue('m');
      await expect(page.getByRole('status')).toContainText('first keystroke');
      await compose('');
      await expect(input).toHaveValue('');

      await compose('é');
      await page.keyboard.insertText('é');
      await expect(input).toHaveValue('');
      await expect(page.getByRole('status')).toContainText('That character');

      await compose('m');
      await compose('M');
      await page.keyboard.insertText('M');
      await expect(input).toHaveValue('M');
      await input.dispatchEvent('input', {
        inputType: 'insertCompositionText',
        data: 'M',
      });
      await page.keyboard.insertText('M');
      await expect(input).toHaveValue('MM');

      await input.press('Shift+ArrowLeft');
      await compose('M');
      await page.keyboard.insertText('M');
      await expect(input).toHaveValue('MM');
      await input.pressSequentially('a');
      await expect(summary).toContainText('4 correct / 0 incorrect');
    } finally {
      await cdp.detach();
      await page.getByRole('button', { name: 'Restart', exact: true }).click();
    }
  });

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
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.getByRole('link', { name: 'Sign in', exact: true }).click();
      await expect(page).toHaveURL(`${origin}/sign-in`);
      await page
        .getByRole('link', { name: 'Typing practice', exact: true })
        .first()
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
    'mobile keyboard keeps the active passage above the input',
    async () => {
      const touch = await browser.newContext({
        hasTouch: true,
        isMobile: true,
        viewport: { width: 320, height: 740 },
      });
      try {
        nextText = 'Mobile typing practice keeps the next words in view. '
          .repeat(10)
          .trim();
        fixtureId++;
        const mobile = await touch.newPage();
        await mobile.goto(`${origin}/typing`);
        const typing = mobile.getByRole('textbox', {
          name: 'Type the passage here',
        });
        await typing.tap();
        await mobile.evaluate(() => {
          const viewport = window.visualViewport!;
          Object.defineProperties(viewport, {
            height: { configurable: true, value: 300 },
            offsetTop: { configurable: true, value: 32 },
          });
          viewport.dispatchEvent(new Event('resize'));
        });

        const passage = mobile.getByLabel('Passage to type');
        await typing.pressSequentially(nextText.slice(0, 135));
        await expect
          .poll(async () => {
            const inputBox = await typing.boundingBox();
            const passageBox = await passage.boundingBox();
            const activeBox = await passage
              .locator('[class*="_current__"]')
              .boundingBox();
            return (
              !!inputBox &&
              !!passageBox &&
              !!activeBox &&
              activeBox.y >= passageBox.y &&
              activeBox.y + activeBox.height <=
                passageBox.y + passageBox.height &&
              passageBox.y >= 32 &&
              passageBox.y + passageBox.height <= inputBox.y &&
              inputBox.y + inputBox.height <= 332 &&
              (await passage.evaluate((element) => element.scrollTop > 0))
            );
          })
          .toBe(true);
        await expect(typing).toHaveValue(nextText.slice(0, 135));
        assert.equal(await mobile.evaluate(() => window.scrollY), 0);
        await expect(
          mobile.getByRole('button', { name: 'Restart' }),
        ).toBeHidden();

        await mobile.evaluate(() => {
          const viewport = window.visualViewport!;
          Object.defineProperties(viewport, {
            height: { value: window.innerHeight },
            offsetTop: { value: 0 },
          });
          viewport.dispatchEvent(new Event('resize'));
        });
        await expect(
          mobile.getByRole('button', { name: 'Restart' }),
        ).toBeVisible();
        await expect(typing).toHaveValue(nextText.slice(0, 135));
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

  await t.test(
    'Hindi uses the same practice page and completes with a typo',
    async () => {
      await page.getByRole('button', { name: 'Browse passages' }).click();
      await page.getByRole('button', { name: 'हिन्दी अभ्यास' }).click();
      const passage = page.getByLabel('Passage to type');
      await expect(passage).toHaveAttribute('lang', 'hi');
      await expect(input).toHaveAttribute('lang', 'hi');
      const passageText = await passage.innerText();
      const charCount = page.getByText(/Chars:/);
      const originalCount = await charCount.innerText();

      await input.focus();
      await page.keyboard.insertText(passageText.replace('मैं ', 'मई  '));
      await expect(summary).toContainText('Passage complete');
      await expect(summary).toContainText('55 correct / 2 incorrect');
      await expect(charCount).toHaveText(originalCount);

      await setPassage('cat');
      await expect(input).not.toHaveAttribute('lang', 'hi');
      await input.pressSequentially('cat');
      await expect(summary).toContainText('3 correct / 0 incorrect');
    },
  );

  await t.test(
    'an imported Hindi passage opens in Practice and reports skipped words',
    async () => {
      await page.getByRole('button', { name: 'Browse passages' }).click();
      await page.getByRole('link', { name: 'हिन्दी अनुच्छेद' }).click();
      await expect(input).toHaveAttribute('lang', 'hi');
      await expect(page.getByLabel('Passage to type')).toHaveText(
        'सुबह मैं अपनी किताबें',
      );
      await input.focus();
      await page.keyboard.insertText('सुबह अपनी किताबें');
      await expect(summary).toContainText('Passage complete');
      await expect(summary).toContainText('Skipped words: 1');
      await expect(summary).toContainText('100%');
    },
  );

  const plain = await browser.newContext({ javaScriptEnabled: false });
  try {
    const noJs = await plain.newPage();
    await noJs.goto(`${origin}/typing`);
    await expect(noJs.locator('noscript p')).toBeVisible();
    await expect(noJs.locator('noscript p')).toContainText(/JavaScript/);
    await expect(
      noJs.getByRole('link', { name: 'Home', exact: true }),
    ).toBeVisible();
  } finally {
    await plain.close();
  }
  assert.deepEqual(errors, []);
});
