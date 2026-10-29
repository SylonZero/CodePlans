import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { runMigrations, seedFixtures, clearTables, F } from '@/tests/helpers/db'
import { db } from '@/lib/db'
import { assets, assetDependencies, products } from '@/lib/db/schema.sqlite'
import { getWikiProduct } from '@/lib/db/wiki'
import { getAssetInventory } from '@/lib/db/queries'
import { createSpec, linkSpec } from '@/lib/db/specs'
import {
  MAP,
  buildWikiMap,
  layoutMap,
  reachEdge,
  reachFrom,
} from '@/lib/wiki/map'
const d = db as any

// web → api → db, worker → db, and a cycle api ↔ cache.
const edges = [
  { source: 'web', target: 'api' },
  { source: 'api', target: 'db' },
  { source: 'worker', target: 'db' },
  { source: 'api', target: 'cache' },
  { source: 'cache', target: 'api' },
]
const node = (id: string, layer: string, productId = 'p1') => ({
  id,
  name: id,
  layer,
  productId,
  productName: productId.toUpperCase(),
})

describe('map reach', () => {
  it('follows dependencies upstream and dependents downstream with shortest depth, through cycles', () => {
    expect(Object.fromEntries(reachFrom('web', edges, 'upstream'))).toEqual({
      web: 0,
      api: 1,
      db: 2,
      cache: 2,
    })
    expect(Object.fromEntries(reachFrom('db', edges, 'downstream'))).toEqual(
      { db: 0, api: 1, worker: 1, web: 2, cache: 2 },
    )
    expect(Object.fromEntries(reachFrom('api', edges, 'direct'))).toEqual({
      api: 0,
      web: 1,
      db: 1,
      cache: 1,
    })
    expect([...reachFrom('worker', edges, 'downstream').keys()]).toEqual([
      'worker',
    ])
  })
  it('highlights only edges that run along the traced direction', () => {
    const up = reachFrom('web', edges, 'upstream')
    const on = edges.filter((e) => reachEdge(e, 'web', 'upstream', up))
    expect(on).toContainEqual({ source: 'api', target: 'db' })
    expect(on).not.toContainEqual({ source: 'worker', target: 'db' })
    expect(
      edges.filter((e) =>
        reachEdge(e, 'db', 'direct', reachFrom('db', edges, 'direct')),
      ),
    ).toHaveLength(2)
  })
})

describe('map layout', () => {
  const nodes = [
    node('web', 'frontend'),
    node('db', 'data'),
    node('api', 'backend'),
    node('worker', 'backend'),
    node('cache', 'data'),
    node('ops', 'tooling'),
  ]
  it('orders layer columns by taxonomy with unknown layers last, independent of input order', () => {
    const a = layoutMap(nodes, edges, 'layer')
    const b = layoutMap([...nodes].reverse(), [...edges].reverse(), 'layer')
    expect(a.columns.map((c) => c.key)).toEqual([
      'frontend',
      'backend',
      'data',
      'tooling',
    ])
    expect([...a.positions.entries()].sort()).toEqual(
      [...b.positions.entries()].sort(),
    )
    expect(a.width).toBe(
      MAP.pad * 2 + 4 * MAP.colW + 3 * MAP.colGap + MAP.trail,
    )
  })
  it('keeps connected assets near each other and places the wiki product first', () => {
    const layout = layoutMap(nodes, edges, 'layer')
    // api's neighbours are cache and db; worker only reaches db.
    expect(layout.positions.get('api')!.y).toBeLessThan(
      layout.positions.get('worker')!.y,
    )
    expect(layout.bands).toHaveLength(1)
    expect(layout.bands[0].label).toBe('')
  })
  it('stacks one non-overlapping band per product over shared layer columns, wiki product first', () => {
    const byProduct = layoutMap(
      [
        node('a', 'backend', 'zeta'),
        node('a2', 'backend', 'zeta'),
        node('b', 'backend', 'alpha'),
        node('c', 'frontend', 'alpha'),
      ],
      [{ source: 'c', target: 'a' }],
      'product',
      'zeta',
    )
    expect(byProduct.bands.map((b) => b.label)).toEqual(['ZETA', 'ALPHA'])
    expect(byProduct.columns.map((c) => c.key)).toEqual([
      'frontend',
      'backend',
    ])
    const [zeta, alpha] = byProduct.bands
    expect(alpha.y).toBeGreaterThanOrEqual(zeta.y + zeta.height)
    for (const id of ['a', 'a2'])
      expect(byProduct.positions.get(id)!.y).toBeLessThan(alpha.y)
    expect(byProduct.positions.get('b')!.y).toBe(
      byProduct.positions.get('c')!.y,
    )
    expect(byProduct.height).toBeGreaterThan(alpha.y + alpha.height)
  })
})

describe('wiki map data', () => {
  beforeAll(runMigrations)
  beforeEach(seedFixtures)
  afterEach(clearTables)
  it('maps every visible product while keeping documents to the wiki product and bodies off the client', async () => {
    await d.insert(products).values({
      id: 'product-billing',
      name: 'Billing',
      slug: 'billing',
      description: '',
      tags: [],
      organizationId: F.org,
      creatorId: F.alice,
    })
    await d.insert(assets).values({
      id: 'asset-billing',
      productId: 'product-billing',
      name: 'Billing Service',
      type: 'service',
      description: 'Charges customers',
      tags: [],
      health: 'critical',
      status: 'active',
      metadata: {},
    })
    await d.insert(assetDependencies).values([
      {
        id: 'edge-api-db',
        sourceAssetId: F.assetApi,
        targetAssetId: F.assetDb,
        dependencyType: 'depends_on',
      },
      {
        id: 'edge-billing-api',
        sourceAssetId: 'asset-billing',
        targetAssetId: F.assetApi,
        dependencyType: 'integrates_with',
        description: 'Usage export',
      },
    ])
    const spec = await createSpec(
      {
        productId: F.productShared,
        title: 'API contract',
        body: 'SECRET_BODY_TEXT',
        specType: 'api',
      },
      F.alice,
    )
    await linkSpec(spec.id, 'asset', F.assetApi, undefined, F.alice)
    const data = (await getWikiProduct('shared-product', F.alice))!
    const map = buildWikiMap(data, await getAssetInventory(F.alice))
    expect(map.nodes.map((n) => n.name).sort()).toEqual([
      'API Service',
      'Billing Service',
      'Database',
    ])
    expect(map.edges).toHaveLength(2)
    const api = map.nodes.find((n) => n.id === F.assetApi)!
    expect(api.summary).toBe('Main API')
    expect(api.activePlans).toBe(1)
    expect(api.documents.map((x) => x.key)).toContain(`spec:${spec.id}`)
    expect(api.documentCounts.spec).toBe(1)
    const billing = map.nodes.find((n) => n.id === 'asset-billing')!
    expect(billing).toMatchObject({
      productSlug: 'billing',
      summary: '',
      documents: [],
    })
    expect(JSON.stringify(map)).not.toContain('SECRET_BODY_TEXT')
    const carol = (await getWikiProduct('carol-product', F.carol))!
    const carolMap = buildWikiMap(carol, await getAssetInventory(F.carol))
    expect(carolMap.nodes.some((n) => n.id === 'asset-billing')).toBe(false)
  })
})
