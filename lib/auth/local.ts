import { redirect } from 'next/navigation'
import NextAuth, { AuthError } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { decode } from 'next-auth/jwt'
import bcrypt from 'bcryptjs'
import { NextResponse, type NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { db as _db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import type { AuthAdapter } from './types'
import { getEnterpriseHooks } from '@/lib/ee/registry'
import { bumpSessionVersion, currentSessionVersion, sessionUserId } from './session-version'

// Local auth runs on either database (users comes from the schema barrel, so it
// matches the active driver). Cast db to any to avoid pg/sqlite type conflicts.
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
  unstable_update: _nextAuthUpdate,
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

        return { id: user.id, email: user.email, sessionVersion: user.sessionVersion ?? 0 }
      },
    }),
  ],
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user?.id) {
        token.id = user.id
        token.sv = (user as { sessionVersion?: number }).sessionVersion ?? 0
        // Where the session was issued (null in the community edition); a
        // session read anywhere else carries no user. See sessionScope in
        // lib/ee/types.ts.
        token.scope = getEnterpriseHooks().sessionScope()
      }
      // After a password change, this session moves to the new version and stays signed in.
      if (trigger === 'update' && token.id) token.sv = (await currentSessionVersion(token.id as string)) ?? 0
      return token
    },
    async session({ session, token }) {
      const userId = await sessionUserId(token)
      if (userId && session.user) session.user.id = userId
      return session
    },
  },
})

/**
 * Ends every session of an account issued before now: call after its
 * password changes. With `keepCurrent`, the session making the request is
 * moved to the new version so its owner stays signed in.
 */
export async function endOtherSessions(userId: string, { keepCurrent = false } = {}) {
  await bumpSessionVersion(userId)
  if (keepCurrent) await _nextAuthUpdate({})
}

// ---------------------------------------------------------------------------
// Auth adapter implementation
// ---------------------------------------------------------------------------

// Auth.js v5 names the cookie by whether the public URL is https, not by
// NODE_ENV — accept either so plain-http deployments don't loop on /login.
const SESSION_COOKIES = ['__Secure-authjs.session-token', 'authjs.session-token']

/** The secrets Auth.js decrypts sessions with: AUTH_SECRET, then AUTH_SECRET_1..3 (rotation). */
function authSecrets(env = process.env): string[] {
  return [env.AUTH_SECRET, env.AUTH_SECRET_1, env.AUTH_SECRET_2, env.AUTH_SECRET_3].filter((s): s is string => !!s)
}

/**
 * Whether the request carries a session cookie this server can decrypt, and
 * which session cookies it can't (wrong secret, expired, malformed). The
 * cookie name is the decryption salt, as in Auth.js.
 */
export async function readSessionCookies(request: NextRequest): Promise<{ valid: boolean; stale: string[] }> {
  const secrets = authSecrets()
  let valid = false
  const stale: string[] = []
  for (const name of SESSION_COOKIES) {
    const token = request.cookies.get(name)?.value
    if (!token) continue
    try {
      if (secrets.length > 0 && (await decode({ token, secret: secrets, salt: name }))) valid = true
      else stale.push(name)
    } catch {
      stale.push(name)
    }
  }
  return { valid, stale }
}

function isAuthRoute(pathname: string) {
  return pathname.startsWith('/login') || pathname.startsWith('/signup') || pathname.startsWith('/accept-invite')
    || pathname.startsWith('/setup') || pathname.startsWith('/forgot-password') || pathname.startsWith('/reset-password')
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

    const { valid: hasSession, stale } = await readSessionCookies(request)
    // A cookie this server can't decrypt (another AUTH_SECRET, e.g. after
    // rotating it or moving an instance) or that has expired is cleared, so
    // the visitor can sign in again instead of being treated as signed in.
    const clearStale = (res: NextResponse) => {
      for (const name of stale) res.cookies.delete(name)
      return res
    }

    if (!hasSession && !isAuthR) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return clearStale(NextResponse.redirect(url))
    }

    // A signed-in visitor on an auth page is sent home by the auth layout,
    // which checks the account; here a cookie that decrypts may still belong
    // to a session ended by a password change.

    return clearStale(NextResponse.next())
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
