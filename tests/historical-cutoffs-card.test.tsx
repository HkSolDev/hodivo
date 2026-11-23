import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  JobDetailContent,
  type JobDetailData,
} from '../components/jobs/job-detail-content';

function baseJob(overrides: Partial<JobDetailData> = {}): JobDetailData {
  return {
    id: 'job-cutoff-test-1',
    postName: 'Engineer Trainee (Electrical)',
    organization: 'POWERGRID',
    vacancies: 250,
    applicationLastDate: '2026-11-23T23:59:59+05:30',
    educationRequired: 'B.E./B.Tech in Electrical Engineering',
    minEducationLevel: 'BACHELORS',
    source: {
      name: 'POWERGRID',
      url: 'https://powergrid.in/',
    },
    ...overrides,
  };
}

test('JobDetailContent renders Historical cutoffs after Qualification routes and before Age', () => {
  const html = renderToStaticMarkup(
    React.createElement(JobDetailContent, {
      job: baseJob({
        reviewedDetails: {
          historical_cutoffs: [
            {
              examYear: 2024,
              post: 'Engineer Trainee (Electrical)',
              stage: 'GATE-2024 Interview Shortlist',
              isOfficial: true,
              cutoffs: { UR: 46.33, OBC_NCL: 39.67, SC: 33 },
              sourceUrl: 'https://powergrid.in/cutoff.pdf',
              notes: 'Normalized marks out of 100.',
            },
            {
              examYear: 2023,
              post: 'Engineer Trainee (Electrical)',
              stage: 'Reference Cycle',
              isOfficial: false,
              cutoffs: { UR: 48.33 },
              sourceUrl: 'javascript:alert(1)',
            },
          ],
        },
      }),
    }),
  );

  const qualIdx = html.indexOf('Qualification routes');
  const cutoffIdx = html.indexOf('Historical cutoffs');
  const ageIdx = html.indexOf('Age requirements and relaxations');

  assert.ok(qualIdx >= 0, 'Qualification routes should render');
  assert.ok(
    cutoffIdx > qualIdx,
    'Historical cutoffs should render after Qualification routes',
  );
  assert.ok(ageIdx > cutoffIdx, 'Historical cutoffs should render before Age');
  assert.ok(html.includes('2024'));
  assert.ok(html.includes('Official'));
  assert.ok(html.includes('Reference'));
  assert.ok(html.includes('OBC NCL'));
  assert.ok(html.includes('46.33'));
  assert.ok(html.includes('https://powergrid.in/cutoff.pdf'));
  assert.ok(!html.includes('javascript:alert(1)'));
});

test('JobDetailContent omits Historical cutoffs when empty or missing', () => {
  const html = renderToStaticMarkup(
    React.createElement(JobDetailContent, {
      job: baseJob({
        reviewedDetails: {
          historical_cutoffs: [],
        },
      }),
    }),
  );

  assert.ok(!html.includes('Historical cutoffs'));
});
