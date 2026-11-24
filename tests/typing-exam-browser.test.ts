import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  mkdirSync,
  mkdtempSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { setTimeout } from 'node:timers/promises';
import { test } from 'node:test';
import { chromium, expect } from 'playwright/test';

test('exam simulation integrates catalogue, local editing and responsive layout', async (t) => {
  const artifacts = mkdtempSync(join(tmpdir(), 'aptus-exam-review-'));
  const { snapshot } = JSON.parse(
    readFileSync(
      new URL('./fixtures/typing-exam/start.json', import.meta.url),
      'utf8',
    ),
  );
  snapshot.passage.text = snapshot.passage.text.repeat(80);
  snapshot.passage.contentHash = createHash('sha256')
    .update(snapshot.passage.text)
    .digest('hex');
  const exam = {
    id: 'exam1',
    slug: 'ssc-chsl',
    name: 'SSC CHSL simulation',
    organization: null,
  };
  const {
    rules: _rules,
    readiness: _readiness,
    rulesUpdatedAt: _updated,
    ...version
  } = snapshot.version;
  const unsupported = {
    ...snapshot.version,
    id: 'version2',
    rules: { ...snapshot.version.rules, editingPolicy: 'unsupported' },
    readiness: {
      canStart: false,
      reasons: ['RULES_UNSUPPORTED'],
      scoringAvailable: false,
    },
  };
  let state: 'ready' | 'empty' | 'error' = 'ready';
  const requests: { method: string; url: string; body: string }[] = [];
  const api = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      requests.push({ method: req.method ?? '', url: req.url ?? '', body });
      res.setHeader('content-type', 'application/json');
      if (req.url?.startsWith('/api/typing/')) {
        if (state === 'error') {
          res.statusCode = 503;
          res.end(
            JSON.stringify({
              error: {
                code: 'SERVICE_UNAVAILABLE',
                message: 'Exam content is temporarily unavailable.',
              },
            }),
          );
          return;
        }
        const result =
          req.url === '/api/typing/exams'
            ? { exams: state === 'empty' ? [] : [exam], nextCursor: null }
            : req.url === '/api/typing/exams/exam1/versions'
              ? {
                  versions: [
                    version,
                    {
                      ...version,
                      id: 'version2',
                      label: 'Unsupported configuration',
                    },
                  ],
                  nextCursor: null,
                }
              : req.url === '/api/typing/exam-versions/version2'
                ? { version: unsupported }
                : req.url === '/api/typing/exam-versions/version1'
                  ? { version: snapshot.version }
                  : req.url === '/api/typing/exam-versions/version1/passage'
                    ? { snapshot }
                    : null;
        if (!result) res.statusCode = 404;
        res.end(JSON.stringify(result));
        return;
      }
      res.end(JSON.stringify({ user: null, enabled: false }));
    });
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
  const logPath = join(artifacts, 'next.log');
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
      '18913',
    ],
    {
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: '1',
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
  const origin = 'http://127.0.0.1:18913';
  let ready = false;
  for (let i = 0; i < 100; i++) {
    assert.equal(next.exitCode, null, `Next exited: inspect ${logPath}`);
    try {
      await fetch(`${origin}/typing/exam`, {
        signal: AbortSignal.timeout(1000),
      });
      ready = true;
      break;
    } catch {
      await setTimeout(100);
    }
  }
  assert(ready);
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
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install();
  await page.goto(`${origin}/typing/exam`);
  // Labels are the public UI acceptance boundary, not CSS implementation details.
  const input = page.getByRole('textbox', { name: 'Your answer', exact: true });
  async function selectExam() {
    await page.getByLabel('Exam', { exact: true }).selectOption('exam1');
    await page.getByLabel('Version', { exact: true }).selectOption('version1');
    await page
      .getByRole('button', { name: 'Load passage', exact: true })
      .click();
    await expect(input).toBeEnabled();
  }
  await t.test(
    'unsupported stored rules are visible but cannot start',
    async () => {
      await page.getByLabel('Exam', { exact: true }).selectOption('exam1');
      await page
        .getByLabel('Version', { exact: true })
        .selectOption('version2');
      await expect(
        page.getByText('Exam configuration is not supported for simulation.', {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Load passage', exact: true }),
      ).toBeDisabled();
      await expect(input).toBeDisabled();
    },
  );
  await t.test(
    'clearing a pending version request clears loading and ignores its response',
    async () => {
      let release: (() => void) | undefined;
      const path = '**/api/typing/exam-versions/version1';
      await page.route(path, async (route) => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        await route.continue().catch(() => {});
      });
      await page
        .getByLabel('Version', { exact: true })
        .selectOption('version1');
      await expect(
        page.getByText('Loading master passage...', { exact: true }),
      ).toBeVisible();
      await page.getByLabel('Version', { exact: true }).selectOption('');
      await expect(
        page.getByText('Loading master passage...', { exact: true }),
      ).not.toBeVisible();
      release?.();
      await page.unrouteAll({ behavior: 'wait' });
      await expect(input).toBeDisabled();
    },
  );
  await selectExam();
  await t.test(
    'normal corrections, paste blocking, Tab navigation and dialog cancellation',
    async () => {
      await expect(page.getByLabel('Time remaining')).toHaveText('10:00');
      await input.press('Backspace');
      await expect(page.getByLabel('Time remaining')).toHaveText('10:00');
      await input.pressSequentially('Abx');
      await input.press('Backspace');
      await input.pressSequentially('c');
      await expect(input).toHaveValue('Abc');
      await input.evaluate((el) =>
        el.dispatchEvent(
          new InputEvent('beforeinput', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertFromPaste',
            data: 'SECRET_TYPED_TEXT',
          }),
        ),
      );
      await expect(input).toHaveValue('Abc');
      await input.press('Tab');
      await expect(input).not.toBeFocused();
      await page
        .getByRole('button', { name: 'Submit examination', exact: true })
        .click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.clock.fastForward(2000);
      await expect(page.getByLabel('Time remaining')).not.toHaveText('10:00');
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(page.getByRole('dialog')).not.toBeVisible();
      await expect(input).toHaveValue('Abc');
    },
  );
  await t.test(
    'changing a running version warns, cancellation preserves text and confirmation discards locally',
    async () => {
      await page
        .getByRole('button', { name: 'Choose another version', exact: true })
        .click();
      await expect(
        page.getByRole('dialog', { name: 'Choose another version?' }),
      ).toBeVisible();
      await page.clock.fastForward(1000);
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(input).toHaveValue('Abc');
      await page
        .getByRole('button', { name: 'Choose another version', exact: true })
        .click();
      await page
        .getByRole('button', { name: 'Confirm version change', exact: true })
        .click();
      await expect(input).toBeDisabled();
      await selectExam();
      await expect(input).toHaveValue('');
      await input.pressSequentially('Abc');
    },
  );
  await t.test(
    'responsive widths, long text/font zoom and short viewport keep controls reachable',
    async () => {
      const screenshots = join(artifacts, 'screenshots');
      mkdirSync(screenshots, { recursive: true });
      for (const width of [320, 390, 568, 834, 1440, 1920]) {
        await page.setViewportSize({
          width,
          height: width === 568 ? 320 : 900,
        });
        assert(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          `horizontal page overflow at ${width}`,
        );
        await input.scrollIntoViewIfNeeded();
        await expect(input).toBeVisible();
        await page
          .getByRole('button', { name: 'Submit examination', exact: true })
          .scrollIntoViewIfNeeded();
        await page.screenshot({
          path: join(screenshots, `${width}.png`),
          fullPage: true,
        });
      }
      await page.setViewportSize({ width: 640, height: 500 });
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '200%';
      });
      await page.getByRole('button', { name: 'A+', exact: true }).click();
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        '200% text zoom overflow',
      );
      await input.scrollIntoViewIfNeeded();
      await expect(input).toBeVisible();
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '';
      });
      t.diagnostic(`Exam screenshots: ${screenshots}`);
    },
  );
  await t.test(
    'mobile keyboard keeps the active exam passage above the answer',
    async () => {
      const touch = await browser.newContext({
        hasTouch: true,
        isMobile: true,
        viewport: { width: 390, height: 740 },
      });
      try {
        const mobile = await touch.newPage();
        await mobile.goto(`${origin}/typing/exam`);
        await mobile.getByLabel('Exam', { exact: true }).selectOption('exam1');
        await mobile
          .getByLabel('Version', { exact: true })
          .selectOption('version1');
        const load = mobile.getByRole('button', {
          name: 'Load passage',
          exact: true,
        });
        await load.click();
        const answer = mobile.getByRole('textbox', { name: 'Your answer' });
        await answer.tap();
        const resizeViewport = (height: number | null, top: number) =>
          mobile.evaluate(
            ({ height, top }) => {
              const viewport = window.visualViewport!;
              Object.defineProperties(viewport, {
                height: { configurable: true, value: height ?? innerHeight },
                offsetTop: { configurable: true, value: top },
              });
              viewport.dispatchEvent(new Event('resize'));
            },
            { height, top },
          );

        await resizeViewport(288, 32);
        const timer = mobile.getByLabel('Time remaining');
        await expect(timer).toHaveText('10:00');
        const controls = mobile.getByRole('navigation', {
          name: 'Controls and Counters Bar',
        });
        await expect(controls).toBeHidden();
        const scrollBeforeTyping = await mobile.evaluate(() => scrollY);
        const text = snapshot.passage.text.slice(0, 180);
        await answer.pressSequentially(text);
        await expect(answer).toHaveValue(text);
        const passageSection = mobile.getByRole('region', {
          name: 'Official Master Passage',
        });
        await expect
          .poll(() =>
            passageSection.evaluate((section) => {
              const pane = section.getBoundingClientRect();
              const answerBox = document
                .getElementById('typing-textarea')!
                .getBoundingClientRect();
              return (
                pane.top >= 32 &&
                pane.height > 0 &&
                pane.bottom <= answerBox.top &&
                answerBox.height > 0 &&
                answerBox.bottom <= 320
              );
            }),
          )
          .toBe(true);
        assert.equal(await mobile.evaluate(() => scrollY), scrollBeforeTyping);
        await expect(
          mobile.getByRole('button', { name: 'Submit examination' }),
        ).toBeInViewport();

        await resizeViewport(null, 0);
        await expect(controls).toBeVisible();
        await expect(answer).toHaveValue(text);
      } finally {
        await touch.close();
      }
    },
  );
  await t.test(
    'expiry during confirmation finishes exactly once and restart retains passage',
    async () => {
      await page
        .getByRole('button', { name: 'Submit examination', exact: true })
        .click();
      await page.clock.fastForward(600000);
      await expect(input).toHaveAttribute('readonly', '');
      await expect(
        page.getByRole('dialog', { name: 'Submit Examination Confirmation' }),
      ).not.toBeVisible();
      await expect(
        page.getByText('Official scoring is unavailable.', { exact: true }),
      ).toBeVisible();
      const calls = requests.filter((r) => r.url.endsWith('/passage')).length;
      await page
        .getByRole('button', { name: 'Close summary', exact: true })
        .click();
      await page
        .getByRole('button', { name: 'Restart examination', exact: true })
        .click();
      await page
        .getByRole('button', { name: 'Confirm restart', exact: true })
        .click();
      await expect(input).toHaveValue('');
      await expect(input).toBeEditable();
      assert.equal(
        requests.filter((r) => r.url.endsWith('/passage')).length,
        calls,
      );
    },
  );
  await t.test(
    'composition stays visible across ticks and starts only on commit',
    async () => {
      await input.focus();
      const cdp = await page.context().newCDPSession(page);
      const compose = (text: string) =>
        cdp.send('Input.imeSetComposition', {
          text,
          selectionStart: text.length,
          selectionEnd: text.length,
        });
      await compose('あ');
      await page.clock.fastForward(2000);
      await expect(input).toHaveValue('あ');
      await expect(page.getByLabel('Time remaining')).toHaveText('10:00');
      await cdp.send('Input.insertText', { text: 'あ' });
      await page.clock.fastForward(1000);
      await expect(page.getByLabel('Time remaining')).toHaveText('09:59');
      await compose('い');
      await page.clock.fastForward(2000);
      await expect(input).toHaveValue('あい');
      await cdp.send('Input.insertText', { text: 'い' });
      await expect(input).toHaveValue('あい');
      await cdp.detach();
    },
  );
  await t.test(
    'manual confirmation completes locally and the same version can be selected again',
    async () => {
      await page
        .getByRole('button', { name: 'Submit examination', exact: true })
        .click();
      await page
        .getByRole('button', { name: 'Confirm submission', exact: true })
        .click();
      await expect(page.getByText('Submitted', { exact: true })).toBeVisible();
      await expect(input).not.toBeEditable();
      await page
        .getByRole('button', { name: 'Close summary', exact: true })
        .click();
      await page
        .getByRole('button', { name: 'Choose another version', exact: true })
        .click();
      await page
        .getByRole('button', { name: 'Confirm version change', exact: true })
        .click();
      await page
        .getByLabel('Version', { exact: true })
        .selectOption('version1');
      await page
        .getByRole('button', { name: 'Load passage', exact: true })
        .click();
      await expect(input).toHaveValue('');
      await expect(input).toBeEditable();
    },
  );
  await t.test(
    'restart confirmation checks the deadline before a delayed timer callback',
    async () => {
      await input.pressSequentially('A');
      await page
        .getByRole('button', { name: 'Restart examination', exact: true })
        .click();
      await page
        .getByRole('button', { name: 'Confirm restart', exact: true })
        .evaluate((button) => {
          const original = performance.now.bind(performance);
          Object.defineProperty(performance, 'now', {
            configurable: true,
            value: Number.prototype.valueOf.bind(original() + 600001),
          });
          try {
            button.click();
          } finally {
            Object.defineProperty(performance, 'now', {
              configurable: true,
              value: original,
            });
          }
        });
      await expect(
        page.getByText('Time Expired', { exact: true }),
      ).toBeVisible();
      await expect(input).toHaveValue('A');
      await expect(input).not.toBeEditable();
    },
  );
  await t.test(
    'catalogue failures and empty catalogue remain honest and retryable',
    async () => {
      state = 'error';
      await page.reload();
      await expect(
        page.getByRole('alert').filter({ hasText: 'temporarily unavailable' }),
      ).toBeVisible();
      state = 'empty';
      await page.getByRole('button', { name: 'Retry', exact: true }).click();
      await expect(
        page.getByText('No published exams are available.', { exact: true }),
      ).toBeVisible();
    },
  );
  assert.deepEqual(errors, []);
  for (const r of requests.filter((r) => r.url.startsWith('/api/typing/'))) {
    assert.equal(r.method, 'GET');
    assert.equal(r.body, '');
    assert(!r.url.includes('Abc') && !r.url.includes('SECRET_TYPED_TEXT'));
  }
});
