import { NextResponse, type NextRequest } from 'next/server';
import { formatRobotsTxt } from './app/robots';
import { prefersMarkdown } from './lib/markdown-negotiation';

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (
    (request.method === 'GET' || request.method === 'HEAD') &&
    pathname === '/robots.txt'
  ) {
    return new NextResponse(formatRobotsTxt(process.env.SITE_URL), {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }

  if (
    (request.method === 'GET' || request.method === 'HEAD') &&
    prefersMarkdown(request.headers.get('accept'))
  ) {
    const targetPath = pathname === '/' ? '/md' : `/md${pathname}`;
    const rewriteUrl = new URL(`${targetPath}${search}`, request.url);
    return NextResponse.rewrite(rewriteUrl);
  }

  const response = NextResponse.next();
  response.headers.set('Vary', 'Accept');
  return response;
}

export const config = {
  matcher: ['/((?!api/|_next/static/|_next/image/|md(?:/|$)|favicon\\.ico).*)'],
};
