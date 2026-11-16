import type { MetadataRoute } from 'next';
import {
  DEFAULT_PRODUCTION_ORIGIN,
  trustedPublicOrigin,
} from '../components/jobs/job-sharing';

export const PRIVATE_DISALLOW_PATHS = [
  '/profile',
  '/saved',
  '/results',
  '/sign-in',
  '/auth/',
  '/admin/',
  '/api/',
] as const;

export const CONTENT_SIGNAL_DIRECTIVE =
  'ai-train=no, search=yes, ai-input=yes';

export function buildRobots(
  origin = process.env.SITE_URL,
): MetadataRoute.Robots {
  const baseOrigin =
    trustedPublicOrigin(origin, {
      allowLocalhost: false,
      fallbackOrigin: DEFAULT_PRODUCTION_ORIGIN,
    }) ?? DEFAULT_PRODUCTION_ORIGIN;

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [...PRIVATE_DISALLOW_PATHS],
    },
    sitemap: new URL('/sitemap.xml', baseOrigin).href,
  };
}

export function formatRobotsTxt(origin = process.env.SITE_URL): string {
  const config = buildRobots(origin);
  const lines = [
    '# Content Signals (https://contentsignals.org/)',
    'User-Agent: *',
    `Content-Signal: ${CONTENT_SIGNAL_DIRECTIVE}`,
    'Allow: /',
    ...PRIVATE_DISALLOW_PATHS.map((p) => `Disallow: ${p}`),
    '',
    `Sitemap: ${config.sitemap}`,
    '',
  ];
  return lines.join('\n');
}

export default function robots(): MetadataRoute.Robots {
  return buildRobots(process.env.SITE_URL);
}
