import { NextResponse, type NextRequest } from 'next/server'
import { authAdapter } from '@/lib/auth'

export async function proxy(request: NextRequest) {
  // MCP endpoint does its own API-key auth — session redirects would break it.
  if (request.nextUrl.pathname.startsWith('/api/mcp')) {
    return NextResponse.next()
  }
  return authAdapter.refreshSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.*|apple-icon.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
