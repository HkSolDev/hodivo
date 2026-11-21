import assert from 'node:assert/strict';
import { test } from 'node:test';
import { publicPageView } from '../components/layout/web-analytics';

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
