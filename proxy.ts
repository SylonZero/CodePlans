import { NextResponse, type NextRequest } from 'next/server'
import { authAdapter } from '@/lib/auth'
import { getEnterpriseHooks } from '@/lib/ee/registry'

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  // An enterprise module may route a request first (e.g. a hosted sign-up
  // site). The community default returns null and changes nothing.
  const decision = getEnterpriseHooks().routeRequest({ host: request.headers.get('host') ?? '', pathname, search })
  if (decision?.action === 'next') return NextResponse.next()
  if (decision?.action === 'redirect') return NextResponse.redirect(new URL(decision.location, request.url))
  if (decision?.action === 'notFound') return new NextResponse('Not found', { status: 404 })

  // MCP and cron endpoints do their own auth — session redirects would break
  // them. The health check is for platform probes and must stay public.
  // Enterprise API routes (/api/ee) check the session themselves.
  if (pathname.startsWith('/api/mcp') || pathname.startsWith('/api/cron/') || pathname.startsWith('/api/ee/') || pathname === '/api/health') {
    return NextResponse.next()
  }
  return authAdapter.refreshSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.*|apple-icon.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
