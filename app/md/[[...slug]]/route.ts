import { renderMarkdownForPath } from '../../../lib/markdown-negotiation';

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
    },
  });
}
