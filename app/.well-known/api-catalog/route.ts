import { NextResponse } from 'next/server';

const SITE_URL = 'https://hodivo.app';

/**
 * RFC 9727 API Catalog endpoint (`/.well-known/api-catalog`).
 * Advertises machine-readable service description, documentation, and health status.
 */
export async function GET() {
  const catalog = {
    linkset: [
      {
        anchor: SITE_URL,
        'service-desc': [
          {
            href: `${SITE_URL}/api/openapi.json`,
            type: 'application/openapi+json',
          },
        ],
        'service-doc': [
          {
            href: `${SITE_URL}/how-it-works`,
            type: 'text/html',
          },
        ],
        status: [
          {
            href: `${SITE_URL}/api/health`,
            type: 'application/json',
          },
        ],
      },
    ],
  };

  return NextResponse.json(catalog, {
    status: 200,
    headers: {
      'Content-Type': 'application/linkset+json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
