import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'wtqubwdduzedmcvyhbgs.supabase.co',
        pathname: '/storage/v1/object/sign/**'
      }
    ]
  }
}

export default nextConfig
