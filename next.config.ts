import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000'],
    },
  },
  // Ensure server-only modules never leak to client
  serverExternalPackages: [],
  async redirects() {
    return [
      {
        source: '/running-needle',
        destination: '/regular-needle/daily-report',
        permanent: true,
      },
      {
        source: '/running-needle/:path*',
        destination: '/regular-needle/:path*',
        permanent: true,
      },
    ]
  },
}

export default nextConfig
