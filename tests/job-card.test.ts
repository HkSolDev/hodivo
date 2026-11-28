import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { tsImport } from 'tsx/esm/api';
import type { PublicJobItem } from '../components/jobs/job-card';

const { JobCard }: typeof import('../components/jobs/job-card') =
  await tsImport('../components/jobs/job-card.tsx', {
    parentURL: import.meta.url,
    tsconfig: 'tsconfig.next.json',
  });

const job: PublicJobItem = {
  id: 'example-job',
  postName: 'Technical Assistant',
  vacancies: 0,
  applicationLastDate: '2026-11-30',
  educationRequired: 'Diploma in Electronics',
  source: { name: 'Example aggregator' },
};

test('public card shows recorded facts without presenting the scraper as employer', () => {
  const html = renderToStaticMarkup(createElement(JobCard, { job }));
  assert.match(html, /Technical Assistant/);
  assert.match(html, /30 Nov 2026/);
  assert.match(html, /Diploma in Electronics/);
  assert.match(html, /0 vacancies/);
  assert.doesNotMatch(html, /Example aggregator/);
  assert.match(html, /href="\/jobs\/example-job"/);
});

test('unknown core facts are explicit without inventing optional facts or open status', () => {
  const html = renderToStaticMarkup(
    createElement(JobCard, {
      job: {
        ...job,
        applicationLastDate: null,
        vacancies: null,
        educationRequired: 'Not specified',
      },
    }),
  );
  assert.match(html, /Organization: <\/span>Not specified/);
  assert.doesNotMatch(html, /Appointment:/);
  assert.match(html, /Deadline not specified/);
  assert.doesNotMatch(html, /Apply by|Qualification|vacancies|Open/);
  assert.match(html, /View details/);
});

test('pay level stays as recorded and untrusted title text stays escaped', () => {
  const html = renderToStaticMarkup(
    createElement(JobCard, {
      job: {
        ...job,
        postName: '<script>alert(1)</script>',
        applicationLastDate: 'invalid',
        payLevel: 'Level 8',
      },
    }),
  );
  assert.match(html, /Pay: Level 8/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>|Apply by|₹/);
});

test('inline bullet qualifications split into a scannable list with chips', () => {
  const html = renderToStaticMarkup(
    createElement(JobCard, {
      job: {
        ...job,
        educationRequired:
          '• Graduate in any discipline from a university recognized by Government of India (or equivalent recognized by Central Govt). • Must hold a valid Domicile Certificate of UT of Jammu & Kashmir. • Fresher-eligible (no prior experience required).',
      },
    }),
  );
  assert.match(html, /<ul[^>]*>/);
  assert.match(html, /Domicile req\./);
  assert.match(html, /Fresher OK/);
  assert.doesNotMatch(html, /Experience req\./);
  assert.match(html, /\+1 more in details/);
  assert.doesNotMatch(html, /•/);
});

test('visitor text follows vacancy and pay details and omits unavailable counts', () => {
  const render = (recentVisitorCount: number | null) =>
    renderToStaticMarkup(
      createElement(JobCard, {
        job: { ...job, payLevel: 'Level 8', recentVisitorCount },
      }),
    );
  assert.match(
    render(1),
    /Pay: Level 8<\/p><p[^>]*data-job-visitors[^>]*>1 visitor in the last 7 days/,
  );
  assert.match(render(6), /6 visitors in the last 7 days/);
  assert.doesNotMatch(render(0), /data-job-visitors/);
  assert.doesNotMatch(render(null), /data-job-visitors/);
});

test('the closing-day label follows the India calendar date', (t) => {
  t.mock.timers.enable({
    apis: ['Date'],
    now: new Date('2026-11-29T18:30:00Z'),
  });
  const render = (applicationLastDate: string) =>
    renderToStaticMarkup(
      createElement(JobCard, { job: { ...job, applicationLastDate } }),
    );
  assert.match(
    render('2026-11-30'),
    /Last day to apply.*<time dateTime="2026-11-30">30 Nov 2026<\/time>/,
  );
  assert.doesNotMatch(render('2026-11-29'), /Last day to apply/);
  assert.match(render('2026-12-01'), /Apply by 1 Dec 2026/);
});
