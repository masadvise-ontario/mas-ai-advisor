import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Next.js treats folders starting with '.' as private and won't route to
  // them, but RFC-defined discovery endpoints live under /.well-known/*.
  // Rewrite them onto normal routes under /api/well-known/*.
  async rewrites() {
    return [
      {
        source: '/.well-known/oauth-authorization-server',
        destination: '/api/well-known/oauth-authorization-server',
      },
      {
        source: '/.well-known/oauth-protected-resource',
        destination: '/api/well-known/oauth-protected-resource',
      },
      {
        source: '/.well-known/jwks.json',
        destination: '/api/well-known/jwks.json',
      },
    ];
  },
};

export default nextConfig;
