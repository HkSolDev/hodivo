import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadPracticePassage } from '../lib/typing/practice-api.js';

test('practice client preserves canonical text and validates every response boundary', async (t) => {
  const passage = { id: 'fixture', title: 'Fixture', text: 'Cat\n\t  dog.  ' };
  let payload: unknown = { passage };
  let status = 200;
  const signal = new AbortController().signal;
  t.mock.method(
    globalThis,
    'fetch',
    async (input: string | URL | Request, init?: RequestInit) => {
      assert.equal(input, '/api/typing/practice-passage');
      assert.equal(init?.cache, 'no-store');
      assert.equal(init?.signal, signal);
      assert.equal(init?.body, undefined);
      return new Response(JSON.stringify(payload), { status });
    },
  );
  assert.deepEqual(await loadPracticePassage(signal), passage);
  payload = { passage: null };
  assert.equal(await loadPracticePassage(signal), null);
  for (const invalid of [
    {},
    { passage, backspacePolicy: 'DISABLED' },
    { passage: { ...passage, backspacePolicy: 'DISABLED' } },
    { passage: { ...passage, id: '' } },
    { passage: { ...passage, id: 'x'.repeat(129) } },
    { passage: { ...passage, title: 'x'.repeat(201) } },
    { passage: { ...passage, text: 'emoji 😀' } },
    { passage: { ...passage, text: '\t \n' } },
    { passage: { ...passage, text: 'x'.repeat(50001) } },
  ]) {
    payload = invalid;
    await assert.rejects(loadPracticePassage(signal));
  }
  status = 503;
  await assert.rejects(loadPracticePassage(signal));
});
