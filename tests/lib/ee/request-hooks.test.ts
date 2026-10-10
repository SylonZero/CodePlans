import { describe, it, expect, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { proxy } from '@/proxy'
import { GET as eeApi } from '@/app/api/ee/[...path]/route'
import { registerEnterpriseHooks, resetEnterpriseHooks } from '@/lib/ee/registry'

afterEach(() => resetEnterpriseHooks())

const req = (url: string) => new NextRequest(url, { headers: { host: new URL(url).host } })

describe('proxy without an enterprise module', () => {
  it('sends a signed-out visitor to /login, as before', async () => {
    const res = await proxy(req('http://localhost:3000/plans'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost:3000/login')
  })

  it('lets /api/ee through without a session; the route itself 404s', async () => {
    const res = await proxy(req('http://localhost:3000/api/ee/billing/webhook'))
    expect(res.headers.get('x-middleware-next')).toBe('1')
    const api = await eeApi(new Request('http://localhost:3000/api/ee/billing/webhook'), { params: Promise.resolve({ path: ['billing', 'webhook'] }) })
    expect(api.status).toBe(404)
  })
})

describe('proxy with a routeRequest hook', () => {
  it('applies redirect, notFound and next decisions before the session check', async () => {
    registerEnterpriseHooks({
      routeRequest: ({ host, pathname }) => {
        if (host === 'codeplans.test' && pathname === '/') return { action: 'redirect', location: '/p/signup' }
        if (host === 'codeplans.test') return { action: 'next' }
        if (host === 'missing.codeplans.test') return { action: 'notFound' }
        return null
      },
    })

    const redirect = await proxy(req('http://codeplans.test/'))
    expect(redirect.headers.get('location')).toBe('http://codeplans.test/p/signup')

    const next = await proxy(req('http://codeplans.test/p/signup'))
    expect(next.headers.get('x-middleware-next')).toBe('1')

    expect((await proxy(req('http://missing.codeplans.test/'))).status).toBe(404)

    // null falls through to the normal session check
    const normal = await proxy(req('http://acme.codeplans.test/plans'))
    expect(normal.headers.get('location')).toBe('http://acme.codeplans.test/login')
  })
})

describe('/api/ee with a handleApi hook', () => {
  it('returns the module response', async () => {
    registerEnterpriseHooks({ handleApi: ({ path }) => Response.json({ path }) })
    const res = await eeApi(new Request('http://localhost/api/ee/a/b'), { params: Promise.resolve({ path: ['a', 'b'] }) })
    expect(await res.json()).toEqual({ path: ['a', 'b'] })
  })
})
