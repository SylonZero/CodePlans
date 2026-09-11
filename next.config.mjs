/** @type {import('next').NextConfig} */

// Allow remote hosts to access Next.js dev resources (HMR, error overlays).
// Set ALLOWED_DEV_ORIGINS=host1,host2 in .env.local when running on a remote server.
const allowedDevOrigins = process.env.ALLOWED_DEV_ORIGINS
  ? process.env.ALLOWED_DEV_ORIGINS.split(',').map((s) => s.trim())
  : []

const nextConfig = {
  ...(allowedDevOrigins.length > 0 && { allowedDevOrigins }),
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Optional enterprise module (see lib/ee/load.ts): listing it here tells
  // Next.js to leave it as a plain runtime require instead of tracing/
  // bundling it at build time, so a community build never fails just
  // because the private package isn't installed.
  serverExternalPackages: ['@codeplans/enterprise'],
}

export default nextConfig
