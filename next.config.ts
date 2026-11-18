import type { NextConfig } from 'next';
import { vendorRoot } from './lib/prepare-file/vendor';

const nextConfig: NextConfig = {
  output: 'standalone',
  devIndicators: process.env.APTUS_LOCAL_REVIEW === '1' ? false : undefined,
  distDir:
    process.env.APTUS_LOCAL_REVIEW === '1' ? '.next-design-review' : '.next',
  typescript: {
    tsconfigPath: 'tsconfig.next.json',
  },
  async headers() {
    return [
      {
        source: '/',
        headers: [
          {
            key: 'Link',
            value:
              '</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json", </api/openapi.json>; rel="service-desc", </how-it-works>; rel="service-doc"',
          },
        ],
      },
      {
        source: `${vendorRoot}/:path*`,
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/admin/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, no-store, no-cache, must-revalidate, max-age=0',
          },
          {
            key: 'Pragma',
            value: 'no-cache',
          },
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow',
          },
        ],
      },
      {
        source: '/profile',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, no-store, no-cache, must-revalidate, max-age=0',
          },
          {
            key: 'Pragma',
            value: 'no-cache',
          },
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow',
          },
        ],
      },
      {
        source: '/results',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, no-store, no-cache, must-revalidate, max-age=0',
          },
          {
            key: 'Pragma',
            value: 'no-cache',
          },
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow',
          },
        ],
      },
    ];
  },
  async rewrites() {
    const backendUrl =
      process.env.BACKEND_INTERNAL_URL || 'http://127.0.0.1:8081';
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
  // NodeNext imports keep the .js suffix. Webpack must map those specifiers
  // back to the TypeScript sources. https://webpack.js.org/configuration/resolve/#resolveextensionalias
  webpack(config) {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.js', '.ts', '.tsx'],
    };
    return config;
  },
};

export default nextConfig;
