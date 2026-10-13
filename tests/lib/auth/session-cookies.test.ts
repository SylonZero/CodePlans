import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { encode } from 'next-auth/jwt'
import { proxy } from '@/proxy'

const COOKIE = 'authjs.session-token'
const secret = process.env.AUTH_SECRET!

const token = (opts: { secret?: string; maxAge?: number } = {}) =>
  encode({ token: { id: 'user-1', email: 'a@example.com' }, secret: opts.secret ?? secret, salt: COOKIE, maxAge: opts.maxAge })

const req = (path: string, cookie?: string) =>
  new NextRequest(`http://localhost:3000${path}`, { headers: cookie ? { cookie: `${COOKIE}=${cookie}` } : {} })

const deletesCookie = (res: Response) => (res.headers.get('set-cookie') ?? '').includes(`${COOKIE}=;`)

describe('proxy session check', () => {
  it('lets a valid session through and keeps it away from the sign-in page', async () => {
    const valid = await token()
    const page = await proxy(req('/plans', valid))
    expect(page.headers.get('x-middleware-next')).toBe('1')
    expect(deletesCookie(page)).toBe(false)

    const login = await proxy(req('/login', valid))
    expect(login.status).toBe(307)
    expect(login.headers.get('location')).toBe('http://localhost:3000/')
  })

  it('treats a cookie from another AUTH_SECRET as signed out and clears it', async () => {
    const foreign = await token({ secret: 'another-secret-at-least-32-bytes-yyyy' })

    // The sign-in page is reachable instead of bouncing to /.
    const login = await proxy(req('/login', foreign))
    expect(login.headers.get('x-middleware-next')).toBe('1')
    expect(deletesCookie(login)).toBe(true)

    const page = await proxy(req('/plans', foreign))
    expect(page.headers.get('location')).toBe('http://localhost:3000/login')
    expect(deletesCookie(page)).toBe(true)
  })

  it('treats expired and malformed cookies the same way', async () => {
    const expired = await token({ maxAge: -60 })
    const login = await proxy(req('/login', expired))
    expect(login.headers.get('x-middleware-next')).toBe('1')
    expect(deletesCookie(login)).toBe(true)

    const garbage = await proxy(req('/login', 'not-a-jwt'))
    expect(garbage.headers.get('x-middleware-next')).toBe('1')
    expect(deletesCookie(garbage)).toBe(true)
  })

  it('still sends visitors without a session to /login', async () => {
    const res = await proxy(req('/plans'))
    expect(res.headers.get('location')).toBe('http://localhost:3000/login')
    expect(deletesCookie(res)).toBe(false)
  })
})
