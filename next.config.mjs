/** @type {import('next').NextConfig} */

// Allow remote hosts to access Next.js dev resources (HMR, error overlays).
// Set ALLOWED_DEV_ORIGINS=host1,host2 in .env.local when running on a remote server.
const allowedDevOrigins = process.env.ALLOWED_DEV_ORIGINS
  ? process.env.ALLOWED_DEV_ORIGINS.split(',').map((s) => s.trim())
  : []

const nextConfig = {
  // Self-contained server in .next/standalone for the Docker image (see
  // Dockerfile). `next start` keeps working for non-container installs.
  output: 'standalone',
  // Migrations are read from disk at boot (lib/db/migrate.ts), so ship them
  // with the traced server files.
  outputFileTracingIncludes: {
    '/*': ['./lib/db/migrations/**/*'],
  },
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
  // Addresses people (and agents) guess. Query strings carry over.
  async redirects() {
    return [
      { source: '/code-plans', destination: '/plans', permanent: false },
      { source: '/code-plans/:path*', destination: '/plans/:path*', permanent: false },
      { source: '/work-items/:id', destination: '/work-items?item=:id', permanent: false },
      { source: '/search', destination: '/wiki', permanent: false },
    ]
  },
}

export default nextConfig
