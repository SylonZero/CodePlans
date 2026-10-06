// Auth.js v5 route handler for local accounts.
import type { NextRequest } from 'next/server'
import { handlers } from '@/lib/auth/local'

async function handler(request: NextRequest) {
  const method = request.method.toUpperCase()
  if (method === 'GET') return handlers.GET(request)
  if (method === 'POST') return handlers.POST(request)
  return new Response('Method not allowed', { status: 405 })
}

export { handler as GET, handler as POST }
