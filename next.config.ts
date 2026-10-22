import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000'],
    },
  },
  // Ensure server-only modules never leak to client
  serverExternalPackages: [],
}

export default nextConfig
