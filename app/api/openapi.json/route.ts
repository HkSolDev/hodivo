import { NextResponse } from 'next/server';

const OPENAPI_SPEC = {
  openapi: '3.1.0',
  info: {
    title: 'HODIVO Public API',
    version: '1.0.0',
    description:
      'Public discovery and health endpoints for HODIVO (Indian government recruitment eligibility matching and typing practice).',
  },
  servers: [{ url: 'https://hodivo.app' }],
  paths: {
    '/api/health': {
      get: {
        summary: 'Service health check',
        responses: {
          '200': {
            description: 'Service is healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

export async function GET() {
  return NextResponse.json(OPENAPI_SPEC, {
    status: 200,
    headers: {
      'Content-Type': 'application/openapi+json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
