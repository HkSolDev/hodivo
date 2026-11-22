import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  publicPageView,
  publicTelemetryEvent,
} from '../components/layout/web-analytics';

test('analytics strips query and fragment from public page views', () => {
  assert.deepEqual(
    publicPageView({
      type: 'pageview',
      url: 'https://example.test/?q=fixture#fragment',
    }),
    { type: 'pageview', url: 'https://example.test/' },
  );
});

test('analytics drops private page views', () => {
  for (const path of [
    'admin/review/fixture',
    'profile',
    'results',
    'saved',
    'typing/progress',
    'auth/error',
  ]) {
    assert.equal(
      publicPageView({ type: 'pageview', url: 'https://example.test/' + path }),
      null,
    );
  }
});

test('speed insights sanitizes public vitals and drops private vitals', () => {
  const vital = {
    type: 'vital',
    route: '/jobs/[id]',
    url: 'https://example.test/jobs/fixture',
  };
  assert.deepEqual(
    publicTelemetryEvent({ ...vital, url: vital.url + '?q=fixture#fragment' }),
    vital,
  );
  assert.equal(
    publicTelemetryEvent({
      ...vital,
      url: 'https://example.test/typing/progress',
    }),
    null,
  );
});
