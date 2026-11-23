import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prisma } from '../src/db.js';
import { listPublicJobs } from '../src/lib/public-jobs.js';

await test('public job listing allows ten seconds to acquire its snapshot transaction', async (t) => {
  const original: unknown = Reflect.get(prisma, '$transaction');
  let transactionOptions: unknown;
  Object.defineProperty(prisma, '$transaction', {
    configurable: true,
    value: async (
      callback: (database: {
        post: {
          count: () => Promise<number>;
          findMany: () => Promise<[]>;
        };
      }) => Promise<unknown>,
      options: unknown,
    ) => {
      transactionOptions = options;
      return callback({
        post: {
          count: async () => 0,
          findMany: async () => [],
        },
      });
    },
  });
  t.after(() =>
    Object.defineProperty(prisma, '$transaction', {
      configurable: true,
      value: original,
    }),
  );

  await listPublicJobs(1, 10);

  assert.deepEqual(transactionOptions, {
    isolationLevel: 'RepeatableRead',
    maxWait: 10_000,
    timeout: 15_000,
  });
});

await test('public presentation removes portal branding and exposes only recognized official destinations', async () => {
  const { publicJobPresentation, cleanPublicJobTitle, officialPublicUrl } =
    await import('../src/lib/public-job-presentation.js');
  const raw = {
    postName: 'Sarkari Result: JKSSB Junior Engineer IES — FreeJobAlert.com',
    source: {
      url: 'https://www.sarkariresult.com/jobs/je/',
      notificationPdfUrl: 'https://jkssb.nic.in/notices/je.pdf',
      officialSiteUrl: 'https://jkssb.nic.in/',
      applyUrl: 'https://freejobalert.com/apply',
    },
    reviewedDetails: {
      official_site_url: 'https://jkssb.nic.in/',
      apply_url: 'https://sarkariresult.com/apply',
      education_required: 'Engineering diploma',
    },
  };
  const original = structuredClone(raw);
  const result = publicJobPresentation(raw);
  assert.equal(result.postName, 'JKSSB Junior Engineer IES');
  assert.equal(result.source.url, '');
  assert.equal(result.source.notificationPdfUrl, raw.source.notificationPdfUrl);
  assert.equal(result.source.applyUrl, null);
  assert.equal(result.reviewedDetails.apply_url, null);
  assert.equal(
    result.reviewedDetails.education_required,
    'Engineering diploma',
  );
  assert.deepEqual(raw, original, 'stored provenance must not be mutated');
  for (const value of [
    'https://www.sarkariresult.com/a',
    'https://freejobalert.com/a',
    'https://mysarkarinaukri.com/a',
    'https://ssc.gov.in@evil.test/a',
    'javascript:alert(1)',
    'https://ssc.gov.in:444/a',
    'https://ssc.gov.in:80/a',
    'https://unrelated.example/a',
    'https://ssc.gov.in.unrelated.example/a',
    'https://jobs.freejobalert.com/a',
    'http://uppbpb.gov.in/a',
    'http://careers.bhel.in/a',
    'not a URL',
  ])
    assert.equal(officialPublicUrl(value), null);
  for (const value of [
    'https://ssc.gov.in/a.pdf',
    'https://coconutboard.gov.in/a',
    'https://careers.bhel.in/',
    'https://iiitp.ac.in/a',
    'https://www.ibps.in/a',
  ])
    assert.equal(officialPublicUrl(value), value);
  for (const title of [
    'JKSSB Junior Engineer',
    'UPSC IES Recruitment',
    'Junior Research Fellow (JRF)',
    'Sarkari Results Analyst',
  ]) {
    assert.equal(cleanPublicJobTitle(title), title);
  }
});

await test('job detail applies presentation filtering without rewriting the database record', async (t) => {
  const { getPublicJob } = await import('../src/lib/public-jobs.js');
  const original = Reflect.get(prisma.post, 'findUnique');
  const raw = {
    id: 'official-presentation-fixture',
    postName: 'UPSC IES — Sarkari Result',
    source: {
      url: 'https://mysarkarinaukri.com/jobs/example',
      notificationPdfUrl: 'https://upsc.gov.in/notice.pdf',
      officialSiteUrl: 'https://upsc.gov.in/',
      applyUrl: null,
    },
    reviewedDetails: { apply_url: 'https://freejobalert.com/example' },
  };
  Object.defineProperty(prisma.post, 'findUnique', {
    configurable: true,
    value: async () => raw,
  });
  t.after(() =>
    Object.defineProperty(prisma.post, 'findUnique', {
      configurable: true,
      value: original,
    }),
  );
  const job = await getPublicJob(raw.id);
  assert.equal(job?.postName, 'UPSC IES');
  assert.equal(job?.source.url, '');
  assert.equal(raw.source.url, 'https://mysarkarinaukri.com/jobs/example');
  assert.equal(raw.postName, 'UPSC IES — Sarkari Result');
});
