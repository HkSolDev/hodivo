import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_PRODUCTION_ORIGIN,
  HOME_SEO_DESCRIPTION,
  HOME_SEO_TITLE,
  HOW_IT_WORKS_SEO_DESCRIPTION,
  HOW_IT_WORKS_SEO_TITLE,
  homeCatalogMetadata,
  jobMetadata,
  jobShareUrl,
  publicPageMetadata,
  stripBrandSuffix,
  trustedPublicOrigin,
} from '../components/jobs/job-sharing';
import { buildRobots, PRIVATE_DISALLOW_PATHS } from '../app/robots';
import {
  buildSitemapEntries,
  generateSitemap,
  isSitemapEligibleJob,
} from '../app/sitemap';
import type { PublicJobItem } from '../components/jobs/job-card';

test('public previews use individual facts and an absolute shared image', () => {
  const first = jobMetadata(
    {
      id: 'one',
      postName: 'Research Associate',
      organization: 'Example Institute',
      vacancies: 1,
      applicationLastDate: '2026-11-05',
    },
    'https://jobs.example',
  );
  const second = jobMetadata(
    { id: 'two', postName: 'Typist' },
    'https://jobs.example',
  );
  assert.equal(first.title, 'Research Associate — Example Institute');
  assert.match(first.description!, /1 vacancy/);
  assert.match(first.description!, /2026-11-05/);
  assert.equal(first.alternates?.canonical, 'https://jobs.example/jobs/one');
  assert.notEqual(first.title, second.title);
  assert.doesNotMatch(second.description!, /null|undefined|deadline|vacancies/);
  assert.match(
    JSON.stringify(first.openGraph),
    /https:\/\/jobs.example\/share-image/,
  );
  assert.equal(
    jobShareUrl('one', 'https://jobs.example/path?private=value'),
    'https://jobs.example/jobs/one',
  );
});

test('missing origin does not invent public URLs; invalid or staging configured origin fails', () => {
  assert.equal(
    jobMetadata({ id: 'one', postName: 'Typist' }).openGraph,
    undefined,
  );
  assert.throws(() =>
    jobMetadata(
      { id: 'one', postName: 'Typist' },
      'https://jobs.example/private',
    ),
  );
  assert.throws(() =>
    jobMetadata(
      { id: 'one', postName: 'Typist' },
      'https://staging.hodivo.app',
    ),
  );
  assert.throws(() =>
    jobMetadata({ id: 'one', postName: 'Typist' }, 'http://hodivo.app'),
  );
  assert.equal(
    trustedPublicOrigin('http://localhost:8080', {
      allowLocalhost: false,
      fallbackOrigin: DEFAULT_PRODUCTION_ORIGIN,
    }),
    'https://hodivo.app',
  );
  assert.equal(
    trustedPublicOrigin('https://preview.hodivo.app', {
      allowLocalhost: false,
      fallbackOrigin: DEFAULT_PRODUCTION_ORIGIN,
    }),
    'https://hodivo.app',
  );
});

test('brand suffix helper and metadata avoid duplicated Hodivo branding', () => {
  assert.equal(
    stripBrandSuffix('Job Details | Hodivo | Hodivo'),
    'Job Details',
  );
  const metadata = jobMetadata(
    {
      id: 'one',
      postName: 'Junior Research Fellow | Hodivo',
      organization: 'IIIT Pune | Hodivo',
    },
    'https://hodivo.app',
  );
  assert.equal(metadata.title, 'Junior Research Fellow — IIIT Pune');
});

test('homepage, pagination, and query metadata apply canonical and robots policy', () => {
  const rootMeta = homeCatalogMetadata({}, 'https://hodivo.app');
  assert.deepEqual(rootMeta.title, { absolute: HOME_SEO_TITLE });
  assert.equal(rootMeta.description, HOME_SEO_DESCRIPTION);
  assert.equal(rootMeta.alternates?.canonical, 'https://hodivo.app/');
  assert.equal(rootMeta.robots, undefined);

  const pageTwoMeta = homeCatalogMetadata({ page: '2' }, 'https://hodivo.app');
  assert.equal(pageTwoMeta.title, 'Indian Government Jobs — Page 2');
  assert.equal(pageTwoMeta.alternates?.canonical, 'https://hodivo.app/?page=2');
  assert.equal(pageTwoMeta.robots, undefined);

  const generatedLinkMeta = homeCatalogMetadata(
    {
      page: '2',
      sort: 'newest',
      layout: 'rows',
      recLayout: 'cards',
      recSort: 'soonest',
    },
    'https://hodivo.app',
  );
  assert.equal(
    generatedLinkMeta.alternates?.canonical,
    'https://hodivo.app/?page=2',
  );
  assert.equal(generatedLinkMeta.robots, undefined);

  const filteredMeta = homeCatalogMetadata(
    { q: 'engineer', qualification: 'BACHELORS', page: '2' },
    'https://hodivo.app',
  );
  assert.equal(filteredMeta.alternates?.canonical, 'https://hodivo.app/');
  assert.deepEqual(filteredMeta.robots, { index: false, follow: true });

  const redundantPageOneMeta = homeCatalogMetadata(
    { page: '1' },
    'https://hodivo.app',
  );
  assert.equal(
    redundantPageOneMeta.alternates?.canonical,
    'https://hodivo.app/',
  );
  assert.deepEqual(redundantPageOneMeta.robots, { index: false, follow: true });

  const howMeta = publicPageMetadata({
    title: HOW_IT_WORKS_SEO_TITLE,
    description: HOW_IT_WORKS_SEO_DESCRIPTION,
    pathname: '/how-it-works',
    origin: 'https://hodivo.app',
  });
  assert.equal(howMeta.title, 'How It Works');
  assert.equal(
    howMeta.alternates?.canonical,
    'https://hodivo.app/how-it-works',
  );
});

test('robots route allows public pages, disallows private/API routes, and declares production sitemap', () => {
  const robotsConfig = buildRobots('http://localhost:8080');
  assert.equal(robotsConfig.sitemap, 'https://hodivo.app/sitemap.xml');
  assert.ok(!Array.isArray(robotsConfig.rules));
  assert.equal(robotsConfig.rules.userAgent, '*');
  assert.equal(robotsConfig.rules.allow, '/');
  assert.deepEqual(robotsConfig.rules.disallow, [...PRIVATE_DISALLOW_PATHS]);
  for (const requiredDisallow of [
    '/profile',
    '/saved',
    '/results',
    '/sign-in',
    '/auth/',
    '/admin/',
    '/api/',
  ]) {
    assert.ok(
      (robotsConfig.rules.disallow as string[]).includes(requiredDisallow),
      `Expected ${requiredDisallow} in robots disallow list`,
    );
  }
});

test('sitemap includes only verified live jobs with IST deadline cutoff and fails safely on upstream errors', async () => {
  // 2026-11-11 20:00 UTC is 2026-11-12 01:30 IST (so 2026-11-11 is expired in IST, 2026-11-12 is still open)
  const nowAfterIstMidnight = new Date('2026-11-11T20:00:00.000Z');
  const fixtureJobs: PublicJobItem[] = [
    {
      id: 'live-today-ist',
      postName: 'Scientist B',
      organization: 'DRDO',
      applicationLastDate: '2026-11-12',
      vacancies: 4,
      educationRequired: 'B.E./B.Tech',
      source: { name: 'DRDO' },
    },
    {
      id: 'expired-yesterday-ist',
      postName: 'Expired Clerk',
      organization: 'SSC',
      applicationLastDate: '2026-11-11',
      vacancies: 1,
      educationRequired: 'Graduation',
      source: { name: 'SSC' },
    },
    {
      id: 'unknown-deadline',
      postName: 'Pharmacist Grade I',
      organization: 'HLL Lifecare Limited',
      applicationLastDate: null,
      vacancies: null,
      educationRequired: 'B.Pharm',
      source: { name: 'HLL' },
    },
    {
      id: 'live-today-ist',
      postName: 'Scientist B Duplicate',
      organization: 'DRDO',
      applicationLastDate: '2026-11-25',
      vacancies: 4,
      educationRequired: 'B.E./B.Tech',
      source: { name: 'DRDO' },
    },
    {
      id: 'invalid/id/../../admin',
      postName: 'Invalid Path Job',
      organization: 'Test',
      applicationLastDate: '2026-11-25',
      vacancies: 1,
      educationRequired: 'Graduation',
      source: { name: 'Test' },
    },
  ];

  assert.equal(
    isSitemapEligibleJob(fixtureJobs[0]!, nowAfterIstMidnight),
    true,
  );
  assert.equal(
    isSitemapEligibleJob(fixtureJobs[1]!, nowAfterIstMidnight),
    false,
  );
  assert.equal(
    isSitemapEligibleJob(fixtureJobs[2]!, nowAfterIstMidnight),
    false,
  );

  const entries = buildSitemapEntries(fixtureJobs, {
    origin: 'https://hodivo.app',
    now: nowAfterIstMidnight,
  });

  assert.deepEqual(
    entries.map((entry) => entry.url),
    [
      'https://hodivo.app/',
      'https://hodivo.app/how-it-works',
      'https://hodivo.app/jobs/live-today-ist',
    ],
  );
  for (const entry of entries) {
    assert.equal(entry.lastModified, undefined);
  }

  // Design-review preview responses must exclude preview jobs
  const previewEntries = await generateSitemap({
    origin: 'https://hodivo.app',
    backendUrl: 'http://backend.internal',
    now: nowAfterIstMidnight,
    fetchImpl: (async () =>
      new Response(
        JSON.stringify({
          data: fixtureJobs,
          pagination: {
            page: 1,
            pageSize: 100,
            totalItems: fixtureJobs.length,
            totalPages: 1,
          },
          designReview: true,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )) as typeof fetch,
  });
  assert.deepEqual(
    previewEntries.map((entry) => entry.url),
    ['https://hodivo.app/', 'https://hodivo.app/how-it-works'],
  );

  // Upstream failure or stale unconfirmed data must throw rather than fabricating an empty job sitemap
  await assert.rejects(() =>
    generateSitemap({
      origin: 'https://hodivo.app',
      backendUrl: 'http://backend.internal',
      fetchImpl: (async () =>
        new Response('Service Unavailable', { status: 503 })) as typeof fetch,
    }),
  );

  await assert.rejects(() =>
    generateSitemap({
      origin: 'https://hodivo.app',
      backendUrl: 'http://backend.internal',
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({
            data: fixtureJobs,
            pagination: {
              page: 1,
              pageSize: 100,
              totalItems: 1,
              totalPages: 1,
            },
            freshnessUnconfirmed: true,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )) as typeof fetch,
    }),
  );
});
