import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { runMigrations } from '@/tests/helpers/db'
import { GET } from '@/app/api/health/route'
import { registerEnterpriseHooks, resetEnterpriseHooks } from '@/lib/ee/registry'

beforeAll(async () => {
  await runMigrations()
})

afterEach(() => resetEnterpriseHooks())

describe('/api/health', () => {
  it('checks the database by default', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'ok', database: 'sqlite' })
  })

  it('uses the health hook when an enterprise module supplies one', async () => {
    registerEnterpriseHooks({ health: () => Promise.resolve(true), workspaceDatabase: () => { throw new Error('no workspace') } })
    expect((await GET()).status).toBe(200)

    registerEnterpriseHooks({ health: () => Promise.resolve(false) })
    const down = await GET()
    expect(down.status).toBe(503)
    expect(await down.json()).toMatchObject({ status: 'error' })

    registerEnterpriseHooks({ health: () => Promise.reject(new Error('control db gone')) })
    expect((await GET()).status).toBe(503)
  })
})
