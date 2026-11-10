import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  decideSearch,
  idleSearch,
  interruptSearch,
  noteSearchLocation,
  sameSearch,
} from '../frontend/search-pending.js';

const here = 'http://localhost/?q=clerk&sort=newest&layout=rows&page=2';
const next = '/?q=assistant&sort=newest&layout=rows';

void test('the latest search starts, and returning to the current page cancels it', () => {
  const started = decideSearch(idleSearch, next, here);
  assert.equal(started.kind, 'start');
  if (started.kind !== 'start') return;
  assert.equal(started.feedback.notice, 'Searching…');
  assert.equal(started.feedback.pendingHref, next);

  assert.equal(decideSearch(started.feedback, next, here).kind, 'ignore');
  assert.equal(decideSearch(idleSearch, here, here).kind, 'ignore');
  assert.equal(decideSearch(started.feedback, here, here).kind, 'cancel');
});

void test('search identity uses effective defaults and ignores the flight cache-buster', () => {
  assert.equal(
    sameSearch(
      '/',
      '/?sort=newest&layout=rows&recLayout=cards&recSort=soonest&q=&qualification=',
    ),
    true,
  );
  assert.equal(sameSearch('/?sort=newest', '/?layout=rows&sort=newest'), true);
  assert.equal(sameSearch('/?page=1', '/'), true);
  assert.equal(sameSearch('/?q=clerk%20', '/?q=clerk'), true);
  assert.equal(
    sameSearch(
      '/?q=assistant&sort=newest&_rsc=abc',
      'http://localhost/?sort=newest&q=assistant',
    ),
    true,
  );
  assert.equal(sameSearch('/?q=assistant&page=2', '/?q=assistant'), false);
  assert.equal(sameSearch('/?sort=soonest', '/'), false);
});

void test('a committed page ends the search, including when another navigation wins', () => {
  const started = decideSearch(idleSearch, next, here);
  assert.equal(started.kind, 'start');
  if (started.kind !== 'start') return;

  const landed = noteSearchLocation(
    started.feedback,
    'http://localhost/?q=assistant&sort=newest&layout=rows',
  );
  assert.deepEqual(landed, { pendingHref: null, notice: 'Search finished' });
  assert.equal(noteSearchLocation(landed, here), landed);

  assert.deepEqual(
    noteSearchLocation(
      started.feedback,
      'http://localhost/?sort=soonest',
      'results',
    ),
    idleSearch,
  );
  assert.equal(
    noteSearchLocation(
      started.feedback,
      'http://localhost/?q=assistant',
      'unavailable',
    ).notice,
    'Jobs are temporarily unavailable. Please try again shortly.',
  );
  assert.deepEqual(
    noteSearchLocation(
      started.feedback,
      'http://localhost/?q=assistant',
      'stale',
    ),
    idleSearch,
  );
  assert.deepEqual(interruptSearch(), idleSearch);
});
