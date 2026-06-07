// Auth.js v5 route handler — only active in local (AUTH_PROVIDER=local) mode.
// Dynamic import prevents local.ts from loading (and requiring AUTH_SECRET)
// in Supabase mode.
import type { NextRequest } from 'next/server'

async function handler(request: NextRequest) {
  if (process.env.AUTH_PROVIDER !== 'local') {
    return new Response('Not found', { status: 404 })
  }
  const { handlers } = await import('@/lib/auth/local')
  const method = request.method.toUpperCase()
  if (method === 'GET') return handlers.GET(request)
  if (method === 'POST') return handlers.POST(request)
  return new Response('Method not allowed', { status: 405 })
}

export { handler as GET, handler as POST }
