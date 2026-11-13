import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';

test('public practice route projects one passage, rejects query and sanitizes failure', async (t) => {
  const passage = { id: 'test-id', title: 'Fixture', text: 'Cat\n\t  dog.  ' };
  let rows: (typeof passage)[] = [passage];
  let unavailable = false;
  let queryCalls = 0;
  const loadPassage = async () => {
    queryCalls++;
    if (unavailable)
      throw new Error('postgresql://private-database must never leak');
    return rows[0] ?? null;
  };
  const app = buildApp(undefined, {}, undefined, loadPassage);
  t.after(() => app.close());
  let response = await app.inject('/api/typing/practice-passage');
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.deepEqual(response.json(), { passage });
  rows = [];
  response = await app.inject('/api/typing/practice-passage');
  assert.deepEqual(response.json(), { passage: null });
  const calls = queryCalls;
  for (const url of [
    '/api/typing/practice-passage?exam=secret',
    '/api/typing/practice-passage?a=1&a=2',
  ]) {
    response = await app.inject(url);
    assert.equal(response.statusCode, 400);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.deepEqual(response.json(), {
      error: 'This endpoint does not accept query parameters.',
    });
  }
  assert.equal(queryCalls, calls);
  unavailable = true;
  response = await app.inject('/api/typing/practice-passage');
  assert.equal(response.statusCode, 503);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.deepEqual(response.json(), {
    error: 'Practice passages are temporarily unavailable. Please try again.',
  });
  response = await app.inject({
    method: 'POST',
    url: '/api/typing/practice-passage',
    payload: { text: 'private typing' },
  });
  assert.equal(response.statusCode, 404);
  assert.equal(queryCalls, calls + 1);
});
