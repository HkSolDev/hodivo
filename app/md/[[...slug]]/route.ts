import { CONTENT_SIGNAL_DIRECTIVE } from '../../robots';
import { renderMarkdownForPath } from '../../../lib/markdown-negotiation';

function estimateMarkdownTokens(markdown: string): number {
  return Math.max(1, Math.ceil(markdown.length / 4));
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug?: string[] }> },
) {
  const { slug } = await context.params;
  const pathname = slug && slug.length > 0 ? `/${slug.join('/')}` : '/';
  const { status, markdown } = await renderMarkdownForPath(pathname);

  return new Response(markdown, {
    status,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      Vary: 'Accept',
      'Cache-Control': 'no-store',
      'Content-Signal': CONTENT_SIGNAL_DIRECTIVE,
      'x-markdown-tokens': String(estimateMarkdownTokens(markdown)),
    },
  });
}

export async function HEAD(
  request: Request,
  context: { params: Promise<{ slug?: string[] }> },
) {
  const res = await GET(request, context);
  return new Response(null, {
    status: res.status,
    headers: res.headers,
  });
}
