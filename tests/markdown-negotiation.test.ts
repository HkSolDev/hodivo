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

test('md route handler returns text/markdown with Vary: Accept and Content-Signal', async () => {
  const res = await mdGet(new Request('http://localhost:8080/md'), {
    params: Promise.resolve({}),
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'text/markdown; charset=utf-8');
  assert.equal(res.headers.get('vary'), 'Accept');
  assert.equal(
    res.headers.get('content-signal'),
    'ai-train=no, search=yes, ai-input=yes',
  );
  assert.ok(Number(res.headers.get('x-markdown-tokens')) > 0);
  const body = await res.text();
  assert.match(body, /^# Aptus/m);

  const typingRes = await mdGet(
    new Request('http://localhost:8080/md/typing'),
    {
      params: Promise.resolve({ slug: ['typing'] }),
    },
  );
  assert.equal(typingRes.status, 200);
  const typingBody = await typingRes.text();
  assert.match(typingBody, /Government Exam Typing Practice/);
  assert.match(typingBody, /https:\/\/hodivo\.app\/typing/);

  const examRes = await mdGet(
    new Request('http://localhost:8080/md/typing/exam'),
    {
      params: Promise.resolve({ slug: ['typing', 'exam'] }),
    },
  );
  assert.equal(examRes.status, 200);
  const examBody = await examRes.text();
  assert.match(examBody, /Government Exam Typing Simulation/);

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

test('proxy serves /robots.txt with Content-Signal directives', async () => {
  const robotsReq = new NextRequest('http://localhost:8080/robots.txt');
  const robotsRes = proxy(robotsReq);
  assert.equal(robotsRes.status, 200);
  assert.equal(
    robotsRes.headers.get('content-type'),
    'text/plain; charset=utf-8',
  );
  const robotsBody = await robotsRes.text();
  assert.match(robotsBody, /User-Agent: \*/);
  assert.match(
    robotsBody,
    /Content-Signal: ai-train=no, search=yes, ai-input=yes/,
  );
  assert.match(robotsBody, /Disallow: \/api\//);
  assert.match(robotsBody, /Sitemap: https:\/\/hodivo\.app\/sitemap\.xml/);
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

test('public resize Markdown is discoverable without rewriting non-content endpoints', async () => {
  const home = await renderMarkdownForPath('/');
  assert.match(home.markdown, /\[Resize files\]\(\/tools\/prepare-file\)/);
  const tool = await renderMarkdownForPath('/tools/prepare-file');
  assert.equal(tool.status, 200);
  assert.match(tool.markdown, /without uploading or storing/);
  assert.match(tool.markdown, /1,000 bytes/);
  for (const path of ['/sitemap.xml', '/.well-known/api-catalog', '/profile']) {
    const response = proxy(
      new NextRequest(`http://localhost:8080${path}`, {
        headers: { accept: 'text/markdown' },
      }),
    );
    assert.equal(response.headers.has('x-middleware-rewrite'), false);
  }
});

test('job Markdown reflects public API fields and reports an unavailable upstream', async () => {
  const options = (body: object, status = 200) => ({
    fetchImpl: async () => Response.json(body, { status }),
  });
  const valid = await renderMarkdownForPath(
    '/jobs/example',
    options({
      postName: 'Clerk',
      applicationLastDate: '2026-12-17T00:00:00.000Z',
      source: { notificationPdfUrl: 'https://example.org/notice.pdf' },
      reviewedDetails: {
        apply_url: 'https://example.org/apply',
        vacancies: 12,
      },
    }),
  );
  assert.match(valid.markdown, /2026-12-17/);
  assert.match(valid.markdown, /\[Official recruitment notice\].*notice\.pdf/);
  assert.match(valid.markdown, /\[Official application link\].*\/apply/);
  assert.equal(
    (await renderMarkdownForPath('/jobs/example', options({}, 502))).status,
    503,
  );
  assert.equal(
    (
      await renderMarkdownForPath(
        '/jobs/example',
        options({ postName: 'Draft', designReview: true }),
      )
    ).status,
    404,
  );
});
