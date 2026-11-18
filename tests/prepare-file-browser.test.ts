import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { chromium, expect } from 'playwright/test';
import { vendorRoot } from '../lib/prepare-file/vendor';

const origin = process.env.APTUS_PREPARE_FILE_TEST_ORIGIN;

function syntheticPdf(pageCount: number) {
  const catalog = '<< /Type /Catalog /Pages 2 0 R >>';
  const kids = Array.from({ length: pageCount }, (_, i) => `${3 + i * 2} 0 R`);
  const pages = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pageCount} >>`;
  const objects = [catalog, pages];
  const contents = Array.from({ length: 1200 }, (_, index) => {
    const x = (index * 117) % 594;
    const y = (index * 73) % 826;
    return `${(index % 7) / 7} g ${x} ${y} 8 12 re f\n`;
  }).join('');
  for (let index = 0; index < pageCount; index++) {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 ${840 + index}] /Resources << >> /Contents ${4 + index * 2} 0 R >>`,
    );
    objects.push(
      `<< /Length ${contents.length} >>\nstream\n${contents}endstream`,
    );
  }
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((object, index) => {
    const offset = pdf.length;
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  pdf += `trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return {
    name: 'synthetic.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(pdf),
  };
}

test(
  'production file tool keeps processing local and loads codecs by operation',
  {
    skip:
      !origin &&
      'Set APTUS_PREPARE_FILE_TEST_ORIGIN to a local production build.',
  },
  async () => {
    const artifacts = mkdtempSync(join(tmpdir(), 'aptus-file-review-'));
    const chunks = '.next/static/chunks';
    const optionalChunk = readdirSync(chunks).find(
      (name) =>
        name.endsWith('.js') &&
        readFileSync(join(chunks, name), 'utf8').includes(
          'Enter both width and height',
        ),
    );
    assert.ok(
      optionalChunk,
      'optional requirements should have its own build chunk',
    );

    const localChrome =
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const browser = await chromium.launch({
      executablePath:
        process.env.APTUS_TEST_BROWSER ??
        (!existsSync(chromium.executablePath()) && existsSync(localChrome)
          ? localChrome
          : undefined),
    });
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      const requests: { url: string; method: string; body: Buffer | null }[] =
        [];
      context.on('request', (request) => {
        if (request.url().startsWith('http')) {
          requests.push({
            url: request.url(),
            method: request.method(),
            body: request.postDataBuffer(),
          });
        }
      });
      const pathRequested = (suffix: string) =>
        requests.some((request) =>
          new URL(request.url).pathname.endsWith(suffix),
        );
      const processingRequested = () =>
        requests.some((request) => request.url.includes(vendorRoot)) ||
        pathRequested(optionalChunk);
      const response = await page.goto(`${origin}/how-it-works`, {
        waitUntil: 'networkidle',
      });
      assert.equal(response?.status(), 200);
      assert.equal(processingRequested(), false);
      for (const width of [320, 834, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${origin}/how-it-works`);
        const navigation = page.getByRole('navigation', {
          name: 'Main navigation',
        });
        const prepare = navigation.getByRole('link', {
          name: width < 760 ? 'Resize' : 'Resize files',
          exact: true,
        });
        await expect(prepare).toBeVisible();
        const bounds = await prepare.boundingBox();
        if (width < 760) {
          assert.ok(bounds && bounds.width >= 44 && bounds.height >= 44);
        }
        await prepare.click();
        await expect(page).toHaveURL(`${origin}/tools/prepare-file`);
        await expect(prepare).toHaveAttribute('aria-current', 'page');
      }
      const tool = await page.goto(`${origin}/tools/prepare-file`, {
        waitUntil: 'networkidle',
      });
      assert.equal(tool?.status(), 200);
      assert.match(tool?.headers()['cache-control'] ?? '', /s-maxage=31536000/);
      assert.equal(processingRequested(), false);
      const staticScript = requests.find(
        (request) =>
          request.url.includes('/_next/static/') && request.url.endsWith('.js'),
      );
      assert.ok(staticScript);
      const staticResponse = await context.request.get(staticScript.url);
      assert.equal(
        staticResponse.headers()['cache-control'],
        'public, max-age=31536000, immutable',
      );

      const photo = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 600;
        canvas.height = 400;
        const ctx = canvas.getContext('2d')!;
        const image = ctx.createImageData(canvas.width, canvas.height);
        let state = 42;
        for (let index = 0; index < image.data.length; index += 4) {
          state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
          image.data.set(
            [state >>> 24, (state >>> 16) & 255, (state >>> 8) & 255, 255],
            index,
          );
        }
        ctx.putImageData(image, 0, 0);
        return canvas.toDataURL('image/jpeg', 0.95).split(',')[1];
      });
      const source = page.locator('input[type="file"]');
      const sample = {
        name: 'synthetic.jpg',
        mimeType: 'image/jpeg',
        buffer: Buffer.from(photo, 'base64'),
      };
      const limit = page.getByLabel('Maximum file size');
      await source.setInputFiles(sample);
      const jpgLink = page.getByRole('link', { name: /Download JPG/ });
      await expect(jpgLink).toBeVisible({ timeout: 20_000 });
      assert.equal(processingRequested(), false);
      const measure = () =>
        jpgLink.evaluate(async (element) => {
          const blob = await (
            await fetch((element as HTMLAnchorElement).href)
          ).blob();
          const bitmap = await createImageBitmap(blob);
          const result = {
            bytes: blob.size,
            width: bitmap.width,
            height: bitmap.height,
          };
          bitmap.close();
          return result;
        });
      assert.ok((await measure()).bytes <= 50_000);
      const saving = page.waitForEvent('download');
      await jpgLink.click();
      const download = await saving;
      assert.equal(download.suggestedFilename(), 'synthetic_prepared_50kb.jpg');
      assert.equal(await download.failure(), null);
      const previousUrl = await jpgLink.getAttribute('href');
      await page.getByText('More requirements for JPG').click();
      assert.equal(processingRequested(), false);
      await page.getByLabel('Width (px)').fill('350');
      await page.getByLabel('Height (px)').fill('450');
      await page.getByLabel('Minimum size (KB)').fill('20');
      await page.getByRole('button', { name: 'Apply requirements' }).click();
      await expect(
        page.getByText('350 × 450 px', { exact: true }),
      ).toBeVisible();
      assert.ok(pathRequested(optionalChunk));
      const exact = await measure();
      assert.equal(exact.width, 350);
      assert.equal(exact.height, 450);
      assert.ok(exact.bytes >= 20_000 && exact.bytes <= 50_000);
      assert.ok(
        await page.evaluate(
          (url) =>
            fetch(url!).then(
              () => false,
              () => true,
            ),
          previousUrl,
        ),
      );

      await page.getByRole('button', { name: '20 KB Signature' }).click();
      await expect(page.getByRole('status')).toHaveText(
        /Fits limit|Below minimum|Exceeds limit/,
        { timeout: 20_000 },
      );
      assert.ok(pathRequested('/mozjpeg_enc.wasm'));
      assert.equal(pathRequested('/pdf.min.js'), false);

      await limit.fill('500');
      await page.getByRole('button', { name: 'Export as PDF' }).click();
      const pdfLink = page.getByRole('link', { name: /Download PDF/ });
      await expect(pdfLink).toBeVisible({ timeout: 20_000 });
      assert.ok(pathRequested('/pdf-lib.min.js'));
      assert.equal(pathRequested('/pdf.min.js'), false);
      assert.equal(pathRequested('/pdf.worker.min.js'), false);

      await source.setInputFiles(syntheticPdf(2));
      await expect(page.getByText('2 pages', { exact: true })).toHaveCount(2, {
        timeout: 20_000,
      });
      assert.ok(pathRequested('/pdf.min.js'));
      assert.ok(pathRequested('/pdf.worker.min.js'));
      const bytes = await pdfLink.evaluate(async (element) => {
        const blob = await (
          await fetch((element as HTMLAnchorElement).href)
        ).blob();
        return blob.size;
      });
      assert.ok(bytes <= 500_000);
      const pdfBytes = await pdfLink.evaluate(async (element) =>
        Array.from(
          new Uint8Array(
            await (
              await fetch((element as HTMLAnchorElement).href)
            ).arrayBuffer(),
          ),
        ),
      );
      const geometry = await page.evaluate(async (bytes) => {
        const reader = window.pdfjsLib.getDocument({
          data: Uint8Array.from(bytes).buffer,
          isEvalSupported: false,
        });
        try {
          const doc = await reader.promise;
          return await Promise.all(
            Array.from({ length: doc.numPages }, async (_, index) => {
              const page = await doc.getPage(index + 1);
              const { width, height } = page.getViewport({ scale: 1 });
              return [width, height];
            }),
          );
        } finally {
          await reader.destroy();
        }
      }, pdfBytes);
      assert.deepEqual(geometry, [
        [612, 840],
        [612, 841],
      ]);
      await limit.fill('1');
      await expect(
        page.getByRole('alert').filter({ hasText: 'Smallest result found' }),
      ).toContainText('Smallest result found', { timeout: 30_000 });
      await expect(
        page.getByRole('button', { name: 'Download PDF' }),
      ).toBeDisabled();
      await expect(
        page.getByRole('img', { name: 'First prepared PDF page' }),
      ).toBeVisible();
      await page.getByRole('button', { name: /Try a \d+ KB limit/ }).click();
      await expect(pdfLink).toBeVisible({ timeout: 30_000 });

      const raceContext = await browser.newContext();
      try {
        const racePage = await raceContext.newPage();
        await racePage.goto(`${origin}/tools/prepare-file`);
        let release!: () => void;
        const delayed = new Promise<void>((resolve) => {
          release = resolve;
        });
        await racePage.route('**/pdf-lib.min.js', async (route) => {
          await delayed;
          await route.continue();
        });
        const picker = racePage.locator('input[type="file"]');
        const writerRequested = racePage.waitForRequest('**/pdf-lib.min.js');
        await picker.setInputFiles(syntheticPdf(2));
        await writerRequested;
        await racePage.getByLabel('Maximum file size').fill('55');
        await picker.setInputFiles(sample);
        await racePage.getByRole('button', { name: 'Export as JPG' }).click();
        const latestDownload = racePage.getByRole('link', {
          name: /Download JPG/,
        });
        await expect(latestDownload).toBeVisible();
        const latest = await latestDownload.getAttribute('href');
        const writerLoaded = racePage.waitForResponse('**/pdf-lib.min.js');
        release();
        await writerLoaded;
        await racePage.waitForLoadState('networkidle');
        await expect(latestDownload).toHaveAttribute('href', latest ?? '');
      } finally {
        await raceContext.close();
      }

      const worker = await context.request.get(
        `${origin}${vendorRoot}/pdfjs/pdf.worker.min.js`,
      );
      assert.equal(
        worker.headers()['cache-control'],
        'public, max-age=31536000, immutable',
      );
      assert.equal(pathRequested('/heic2any.min.js'), false);

      for (const width of [1440, 820, 390]) {
        await page.setViewportSize({ width, height: 950 });
        for (const theme of ['light', 'dark']) {
          const toggle = page.getByRole('button', {
            name:
              theme === 'dark' ? 'Switch to dark mode' : 'Switch to light mode',
          });
          if (await toggle.isVisible()) await toggle.click();
          await expect(page.locator('html')).toHaveAttribute(
            'data-theme',
            theme,
          );
          const sourceBox = await page
            .getByRole('heading', { name: 'Source document' })
            .boundingBox();
          const previewBox = await page
            .getByRole('heading', { name: 'Verification & preview' })
            .boundingBox();
          assert.ok(sourceBox && previewBox);
          assert.equal(Math.abs(sourceBox.y - previewBox.y) < 8, width >= 1024);
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            true,
          );
          await page.screenshot({
            path: join(artifacts, `${width}-${theme}.png`),
            animations: 'disabled',
            fullPage: true,
          });
        }
      }
      await source.setInputFiles({
        name: 'synthetic.heic',
        mimeType: 'image/heic',
        buffer: Buffer.from('unsupported HEIC'),
      });
      await expect(
        page.getByText(
          'Could not open this HEIC or HEIF file. Try a JPG or PNG copy.',
        ),
      ).toBeVisible();
      assert.equal(pathRequested('/heic2any.min.js'), false);
      assert.ok(
        requests.every(
          (request) =>
            ['GET', 'HEAD'].includes(request.method) &&
            request.body === null &&
            new URL(request.url).origin === origin &&
            !request.url.includes('synthetic.'),
        ),
      );
      console.log(`Prepare file screenshots: ${artifacts}`);
    } finally {
      await browser.close();
    }
  },
);
