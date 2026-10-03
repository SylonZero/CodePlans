import { NextResponse, type NextRequest } from 'next/server'
import { authAdapter } from '@/lib/auth'

export async function proxy(request: NextRequest) {
  // MCP and cron endpoints do their own auth — session redirects would break
  // them. The health check is for platform probes and must stay public.
  const { pathname } = request.nextUrl
  if (pathname.startsWith('/api/mcp') || pathname.startsWith('/api/cron/') || pathname === '/api/health') {
    return NextResponse.next()
  }
  return authAdapter.refreshSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.*|apple-icon.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
