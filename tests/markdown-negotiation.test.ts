import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import {
  prefersMarkdown,
  renderMarkdownForPath,
} from '../lib/markdown-negotiation.js';
import { proxy } from '../proxy.js';
import { GET as mdGet } from '../app/md/[[...slug]]/route.js';

test('prefersMarkdown respects media type quality and ordering', () => {
  assert.equal(prefersMarkdown('text/markdown'), true);
  assert.equal(prefersMarkdown('text/markdown, text/html;q=0.9'), true);
  assert.equal(prefersMarkdown('text/markdown;q=1.0, text/html;q=1.0'), true);
  assert.equal(
    prefersMarkdown(
      'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    ),
    false,
  );
  assert.equal(prefersMarkdown('text/html, text/markdown;q=0.8'), false);
  assert.equal(prefersMarkdown('text/markdown;q=0'), false);
  assert.equal(prefersMarkdown('*/*'), false);
  assert.equal(prefersMarkdown(null), false);
});

test('proxy rewrites Accept: text/markdown to /md and passes through text/html', () => {
  const mdReq = new NextRequest('http://localhost:8080/jobs/ssc-cgl-2026', {
    headers: { accept: 'text/markdown' },
  });
  const mdRes = proxy(mdReq);
  assert.equal(
    mdRes.headers.get('x-middleware-rewrite'),
    'http://localhost:8080/md/jobs/ssc-cgl-2026',
  );

  const rootMdReq = new NextRequest('http://localhost:8080/', {
    headers: { accept: 'text/markdown' },
  });
  const rootMdRes = proxy(rootMdReq);
  assert.equal(
    rootMdRes.headers.get('x-middleware-rewrite'),
    'http://localhost:8080/md',
  );

  const htmlReq = new NextRequest('http://localhost:8080/', {
    headers: { accept: 'text/html' },
  });
  const htmlRes = proxy(htmlReq);
  assert.equal(htmlRes.headers.get('x-middleware-rewrite'), null);
  assert.equal(htmlRes.headers.get('vary'), 'Accept');
});

test('md route handler returns text/markdown with Vary: Accept', async () => {
  const res = await mdGet(new Request('http://localhost:8080/md'), {
    params: Promise.resolve({}),
  });
  assert.equal(res.status, 200);
  assert.equal(
    res.headers.get('content-type'),
    'text/markdown; charset=utf-8',
  );
  assert.equal(res.headers.get('vary'), 'Accept');
  const body = await res.text();
  assert.match(body, /^# Aptus/m);

  const notFoundRes = await mdGet(
    new Request('http://localhost:8080/md/does-not-exist'),
    { params: Promise.resolve({ slug: ['does-not-exist'] }) },
  );
  assert.equal(notFoundRes.status, 404);
  assert.equal(
    notFoundRes.headers.get('content-type'),
    'text/markdown; charset=utf-8',
  );
  assert.equal(notFoundRes.headers.get('vary'), 'Accept');
});

test('renderMarkdownForPath formats job details from backend response', async () => {
  const mockFetch: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        id: 'ssc-1',
        postName: 'SSC CGL 2026',
        organization: 'Staff Selection Commission',
        educationRequired: 'Graduation',
        minAge: 18,
        maxAge: 30,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );

  const result = await renderMarkdownForPath('/jobs/ssc-1', {
    backendUrl: 'http://127.0.0.1:8081',
    fetchImpl: mockFetch,
  });
  assert.equal(result.status, 200);
  assert.match(result.markdown, /^# SSC CGL 2026/m);
  assert.match(result.markdown, /Staff Selection Commission/);
});
