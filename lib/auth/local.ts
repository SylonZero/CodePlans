import { redirect } from 'next/navigation'
import NextAuth, { AuthError } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { NextResponse, type NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { db as _db } from '@/lib/db'
import { users } from '@/lib/db/schema.sqlite'
import type { AuthAdapter } from './types'

// local.ts is only loaded in SQLite mode. Cast db to any to avoid pg/sqlite
// type conflicts — all runtime operations use the correct libsql Drizzle instance.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = _db as any

// ---------------------------------------------------------------------------
// Auth.js configuration
// ---------------------------------------------------------------------------

export const {
  handlers,
  signIn: _nextAuthSignIn,
  signOut: _nextAuthSignOut,
  auth,
} = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const user = await db.query.users.findFirst({
          where: eq(users.email, credentials.email as string),
        })

        if (!user?.passwordHash) return null

        const valid = await bcrypt.compare(credentials.password as string, user.passwordHash)
        if (!valid) return null

        return { id: user.id, email: user.email }
      },
    }),
  ],
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.id = user.id
      return token
    },
    session({ session, token }) {
      if (token.id && session.user) {
        session.user.id = token.id as string
      }
      return session
    },
  },
})

// ---------------------------------------------------------------------------
// Auth adapter implementation
// ---------------------------------------------------------------------------

function isAuthRoute(pathname: string) {
  return pathname.startsWith('/login') || pathname.startsWith('/signup') || pathname.startsWith('/accept-invite')
}

export const localAdapter: AuthAdapter = {
  async getUser() {
    const session = await auth()
    if (!session?.user?.id) return null
    return { id: session.user.id, email: session.user.email! }
  },

  async signIn(email, password) {
    try {
      await _nextAuthSignIn('credentials', { email, password, redirectTo: '/' })
    } catch (error) {
      if (error instanceof AuthError) {
        return { error: 'Invalid email or password' }
      }
      throw error // re-throw NEXT_REDIRECT
    }
    return {}
  },

  async signUp(email, password, name) {
    const existing = await db.query.users.findFirst({
      where: eq(users.email, email),
    })
    if (existing) return { error: 'An account with that email already exists' }

    const id = crypto.randomUUID()
    const passwordHash = await bcrypt.hash(password, 10)
    await db.insert(users).values({ id, email, name, passwordHash })

    try {
      await _nextAuthSignIn('credentials', { email, password, redirectTo: '/' })
    } catch (error) {
      if (error instanceof AuthError) {
        return { error: 'Account created but sign-in failed — please try logging in' }
      }
      throw error
    }
    return {}
  },

  async signOut() {
    await _nextAuthSignOut({ redirectTo: '/login' })
    redirect('/login') // unreachable; satisfies Promise<never>
  },

  async refreshSession(request: NextRequest): Promise<NextResponse> {
    const { pathname } = request.nextUrl
    const isAuthR = isAuthRoute(pathname)

    // Cookie name matches Auth.js v5 default convention
    const cookieName =
      process.env.NODE_ENV === 'production'
        ? '__Secure-authjs.session-token'
        : 'authjs.session-token'

    const hasSession = request.cookies.has(cookieName)

    if (!hasSession && !isAuthR) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }

    if (hasSession && isAuthR) {
      const url = request.nextUrl.clone()
      url.pathname = '/'
      return NextResponse.redirect(url)
    }

    return NextResponse.next()
  },

  async adminCreateUser(email, password, name) {
    const existing = await db.query.users.findFirst({
      where: eq(users.email, email),
    })
    if (existing) {
      console.log(`  user exists: ${email}`)
      return existing.id
    }

    const id = crypto.randomUUID()
    const passwordHash = await bcrypt.hash(password, 10)
    await db.insert(users).values({ id, email, name, passwordHash })
    console.log(`  created user: ${email}`)
    return id
  },
}
