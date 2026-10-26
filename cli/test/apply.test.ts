import { describe, expect, it } from 'vitest'
import { Client } from '../src/client'
import { applyManifest, slugify, validateManifest, type Manifest } from '../src/apply'
import { fakeServer } from './helpers'

describe('validateManifest', () => {
  it('accepts a minimal manifest', () => {
    expect(validateManifest({ products: [{ name: 'Web' }] }).products).toHaveLength(1)
  })

  it.each([
    [null, /products/],
    [{ products: [] }, /products: must be a non-empty list/],
    [{ products: [{}] }, /products\[0\]\.name: is required/],
    [{ products: [{ name: 'A', assets: [{ name: 'x', type: 'robot' }] }] }, /products\[0\]\.assets\[0\]\.type/],
  ])('names the problem in %j', (raw, message) => {
    expect(() => validateManifest(raw)).toThrow(message)
  })
})

describe('slugify', () => {
  it('lowercases and dashes', () => expect(slugify('  Payments API v2 ')).toBe('payments-api-v2'))
})

/** An in-memory workspace behind the fake MCP endpoint. */
function workspace() {
  const products: { id: string; name: string; slug: string }[] = [{ id: 'p1', name: 'Web', slug: 'web' }]
  const assets: { id: string; productId: string; name: string }[] = [{ id: 'a1', productId: 'p1', name: 'Frontend' }]
  const deps: { sourceAssetId: string; targetAssetId: string; dependencyType: string }[] = []
  const people: { productId: string; email: string; responsibility: string; area: string | null }[] = []
  let n = 0
  const server = fakeServer({
    list_products: () => products,
    get_product: ({ slug }) => {
      const p = products.find((x) => x.slug === slug)!
      const ids = assets.filter((a) => a.productId === p.id).map((a) => a.id)
      return { ...p, assets: assets.filter((a) => a.productId === p.id), dependencies: deps.filter((d) => ids.includes(d.sourceAssetId)) }
    },
    list_product_people: ({ productId }) => ({ members: people.filter((m) => m.productId === productId) }),
    create_product: ({ name, slug }) => { const p = { id: `p${++n + 1}`, name: String(name), slug: String(slug) }; products.push(p); return p },
    create_asset: ({ productId, name }) => {
      if (name === 'Broken') return { error: 'Asset name is not allowed' }
      const a = { id: `a${++n + 1}`, productId: String(productId), name: String(name) }; assets.push(a); return a
    },
    add_asset_dependency: (args) => { deps.push(args as (typeof deps)[number]); return { ok: true } },
    assign_responsibility: ({ productId, email, responsibility, area }) => {
      people.push({ productId: String(productId), email: String(email), responsibility: String(responsibility), area: (area as string) ?? null }); return { ok: true }
    },
  })
  return { client: new Client('https://x.test', 'k', server.fetch), server }
}

const manifest: Manifest = {
  products: [
    {
      name: 'Web',
      assets: [{ name: 'frontend', type: 'app' }, { name: 'API', type: 'service' }],
      dependencies: [{ from: 'Frontend', to: 'API' }],
      people: [{ email: 'ana@example.com', responsibility: 'architect' }],
    },
    { name: 'Mobile App', assets: [{ name: 'iOS', type: 'app' }] },
  ],
}

describe('applyManifest', () => {
  it('reports what a dry run would create without writing', async () => {
    const { client, server } = workspace()
    const results = await applyManifest(client, manifest, { dryRun: true })
    expect(results.map((r) => `${r.kind} ${r.name} ${r.status}`)).toEqual([
      'product Web exists', 'asset frontend exists', 'asset API would create', 'dependency Frontend → API would create',
      'person ana@example.com (architect) would create', 'product Mobile App would create', 'asset iOS would create',
    ])
    expect(server.calls.filter((c) => /^(create|add|assign)_/.test(c.name))).toEqual([])
  })

  it('creates only what is missing, and is a no-op the second time', async () => {
    const { client } = workspace()
    const first = await applyManifest(client, manifest)
    expect(first.filter((r) => r.status === 'created')).toHaveLength(5)
    expect(first.find((r) => r.name === 'Mobile App')?.product).toBe('mobile-app')
    const second = await applyManifest(client, manifest)
    expect(second.every((r) => r.status === 'exists')).toBe(true)
  })

  it('keeps going after a failure and reports it', async () => {
    const { client } = workspace()
    const results = await applyManifest(client, {
      products: [{ name: 'Web', assets: [{ name: 'Broken', type: 'app' }, { name: 'Ok', type: 'app' }], dependencies: [{ from: 'Ok', to: 'Ghost' }] }],
    })
    expect(results.find((r) => r.name === 'Broken')).toMatchObject({ status: 'failed', error: 'Asset name is not allowed' })
    expect(results.find((r) => r.name === 'Ok')?.status).toBe('created')
    expect(results.find((r) => r.kind === 'dependency')).toMatchObject({ status: 'failed', error: 'No asset named "Ghost" in web' })
  })
})
