import type { NextRequest } from 'next/server'
import { authAdapter } from '@/lib/auth'

export async function proxy(request: NextRequest) {
  return authAdapter.refreshSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.*|apple-icon.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
