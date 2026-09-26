import { NextResponse, type NextRequest } from 'next/server'
import { authAdapter } from '@/lib/auth'

export async function proxy(request: NextRequest) {
  // MCP and cron endpoints do their own auth — session redirects would break them.
  if (request.nextUrl.pathname.startsWith('/api/mcp') || request.nextUrl.pathname.startsWith('/api/cron/')) {
    return NextResponse.next()
  }
  return authAdapter.refreshSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.*|apple-icon.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
