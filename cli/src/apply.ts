// codeplans apply: bring a workspace in line with a setup manifest. Idempotent:
// products are matched by slug, assets by name within their product,
// dependencies by their endpoints and type, and responsibilities by person,
// role and area. Only what's missing is created; nothing is updated or deleted.
import { CliError, EXIT, type Client } from './client.js'

export type AssetSpec = {
  name: string
  type: 'app' | 'service' | 'library' | 'datastore' | 'platform'
  layer?: string
  description?: string
  tags?: string[]
  repositoryUrl?: string
  repoPath?: string
  documentationUrl?: string
  /** Code owners, by email. Applied only when the asset is created. */
  owners?: string[]
}
export type DependencySpec = { from: string; to: string; type?: 'depends_on' | 'integrates_with' | 'aggregates'; description?: string }
export type PersonSpec = { email: string; responsibility: 'eng_manager' | 'architect' | 'contributor'; area?: string }
export type ProductSpec = {
  name: string
  slug?: string
  description?: string
  tags?: string[]
  assets?: AssetSpec[]
  dependencies?: DependencySpec[]
  people?: PersonSpec[]
}
export type Manifest = { products: ProductSpec[] }

const ASSET_TYPES = ['app', 'service', 'library', 'datastore', 'platform']
const DEP_TYPES = ['depends_on', 'integrates_with', 'aggregates']
const RESPONSIBILITIES = ['eng_manager', 'architect', 'contributor']

export function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/** Checks a parsed manifest's shape, naming the path of the first problem. */
export function validateManifest(raw: unknown): Manifest {
  const fail = (path: string, msg: string): never => { throw new CliError(`Manifest ${path}: ${msg}`, EXIT.usage) }
  const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
  const optStr = (o: Record<string, unknown>, k: string, path: string) => { if (o[k] !== undefined && typeof o[k] !== 'string') fail(`${path}.${k}`, 'must be text') }
  const optStrs = (o: Record<string, unknown>, k: string, path: string) => {
    if (o[k] !== undefined && !(Array.isArray(o[k]) && (o[k] as unknown[]).every((x) => typeof x === 'string'))) fail(`${path}.${k}`, 'must be a list of text')
  }
  const reqStr = (o: Record<string, unknown>, k: string, path: string) => { if (typeof o[k] !== 'string' || !(o[k] as string).trim()) fail(`${path}.${k}`, 'is required') }
  const arr = (o: Record<string, unknown>, k: string, path: string) => {
    if (o[k] === undefined) return []
    if (!Array.isArray(o[k])) fail(`${path}.${k}`, 'must be a list')
    return o[k] as unknown[]
  }

  if (!isObj(raw)) fail('', 'must be a JSON object with a "products" list')
  const root = raw as Record<string, unknown>
  if (!Array.isArray(root.products) || !root.products.length) fail('products', 'must be a non-empty list')
  const slugs = new Set<string>()
  ;(root.products as unknown[]).forEach((p, i) => {
    const path = `products[${i}]`
    if (!isObj(p)) fail(path, 'must be an object')
    const prod = p as Record<string, unknown>
    reqStr(prod, 'name', path)
    optStr(prod, 'slug', path); optStr(prod, 'description', path); optStrs(prod, 'tags', path)
    const slug = (prod.slug as string | undefined) ?? slugify(prod.name as string)
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) fail(`${path}.slug`, `"${slug}" must be lowercase letters, digits and single hyphens`)
    if (slugs.has(slug)) fail(`${path}.slug`, `"${slug}" appears twice`)
    slugs.add(slug)
    const names = new Set<string>()
    arr(prod, 'assets', path).forEach((a, j) => {
      const ap = `${path}.assets[${j}]`
      if (!isObj(a)) fail(ap, 'must be an object')
      const asset = a as Record<string, unknown>
      reqStr(asset, 'name', ap)
      if (!ASSET_TYPES.includes(asset.type as string)) fail(`${ap}.type`, `must be one of ${ASSET_TYPES.join(', ')}`)
      for (const k of ['layer', 'description', 'repositoryUrl', 'repoPath', 'documentationUrl']) optStr(asset, k, ap)
      optStrs(asset, 'tags', ap); optStrs(asset, 'owners', ap)
      const key = (asset.name as string).toLowerCase()
      if (names.has(key)) fail(`${ap}.name`, `"${asset.name}" appears twice in this product`)
      names.add(key)
    })
    arr(prod, 'dependencies', path).forEach((d, j) => {
      const dp = `${path}.dependencies[${j}]`
      if (!isObj(d)) fail(dp, 'must be an object')
      const dep = d as Record<string, unknown>
      reqStr(dep, 'from', dp); reqStr(dep, 'to', dp); optStr(dep, 'description', dp)
      if (dep.type !== undefined && !DEP_TYPES.includes(dep.type as string)) fail(`${dp}.type`, `must be one of ${DEP_TYPES.join(', ')}`)
    })
    arr(prod, 'people', path).forEach((x, j) => {
      const pp = `${path}.people[${j}]`
      if (!isObj(x)) fail(pp, 'must be an object')
      const person = x as Record<string, unknown>
      reqStr(person, 'email', pp); optStr(person, 'area', pp)
      if (!RESPONSIBILITIES.includes(person.responsibility as string)) fail(`${pp}.responsibility`, `must be one of ${RESPONSIBILITIES.join(', ')}`)
    })
  })
  return raw as Manifest
}

export type ApplyResult = {
  kind: 'product' | 'asset' | 'dependency' | 'person'
  product: string
  name: string
  status: 'created' | 'exists' | 'would create' | 'failed' | 'skipped'
  error?: string
}

type ProductList = { id: string; slug: string }[]
type ProductDetail = { id: string; slug: string; assets: { id: string; name: string }[]; dependencies: { sourceAssetId: string; targetAssetId: string; dependencyType: string }[] }
type People = { members: { email: string; responsibility: string; area: string | null }[] }

/** Applies the manifest, reporting each step as it happens. */
export async function applyManifest(
  client: Client,
  manifest: Manifest,
  opts: { dryRun?: boolean; onResult?: (r: ApplyResult) => void } = {},
): Promise<ApplyResult[]> {
  const results: ApplyResult[] = []
  const report = (r: ApplyResult) => { results.push(r); opts.onResult?.(r) }
  const errorOf = (err: unknown) => (err instanceof Error ? err.message : String(err))
  const create = opts.dryRun ? 'would create' : 'created'

  const existing = await client.call<ProductList>('list_products')
  for (const spec of manifest.products) {
    const slug = spec.slug ?? slugify(spec.name)
    const label = slug
    let detail: ProductDetail | null = null
    let people: People | null = null

    const found = existing.find((p) => p.slug === slug)
    if (found) {
      detail = await client.call<ProductDetail>('get_product', { slug })
      if (spec.people?.length) people = await client.call<People>('list_product_people', { productId: detail.id })
      report({ kind: 'product', product: label, name: spec.name, status: 'exists' })
    } else if (opts.dryRun) {
      report({ kind: 'product', product: label, name: spec.name, status: 'would create' })
    } else {
      try {
        await client.call('create_product', { name: spec.name, slug, description: spec.description ?? '', tags: spec.tags ?? [] })
        detail = await client.call<ProductDetail>('get_product', { slug })
        people = { members: [] }
        report({ kind: 'product', product: label, name: spec.name, status: 'created' })
      } catch (err) {
        report({ kind: 'product', product: label, name: spec.name, status: 'failed', error: errorOf(err) })
        for (const a of spec.assets ?? []) report({ kind: 'asset', product: label, name: a.name, status: 'skipped' })
        for (const d of spec.dependencies ?? []) report({ kind: 'dependency', product: label, name: `${d.from} → ${d.to}`, status: 'skipped' })
        for (const p of spec.people ?? []) report({ kind: 'person', product: label, name: `${p.email} (${p.responsibility})`, status: 'skipped' })
        continue
      }
    }

    // Assets by name, case-insensitive. New ones in a dry run have no id yet.
    const assetIds = new Map<string, string | null>((detail?.assets ?? []).map((a) => [a.name.toLowerCase(), a.id]))
    for (const a of spec.assets ?? []) {
      const key = a.name.toLowerCase()
      if (assetIds.has(key)) { report({ kind: 'asset', product: label, name: a.name, status: 'exists' }); continue }
      if (opts.dryRun || !detail) { assetIds.set(key, null); report({ kind: 'asset', product: label, name: a.name, status: 'would create' }); continue }
      try {
        const created = await client.call<{ id: string }>('create_asset', {
          productId: detail.id, name: a.name, type: a.type, description: a.description ?? '', tags: a.tags ?? [],
          ...(a.layer ? { layer: a.layer } : {}), ...(a.repositoryUrl ? { repositoryUrl: a.repositoryUrl } : {}),
          ...(a.repoPath ? { repoPath: a.repoPath } : {}), ...(a.documentationUrl ? { documentationUrl: a.documentationUrl } : {}),
          ...(a.owners?.length ? { ownerEmails: a.owners } : {}),
        })
        assetIds.set(key, created.id)
        report({ kind: 'asset', product: label, name: a.name, status: create })
      } catch (err) {
        report({ kind: 'asset', product: label, name: a.name, status: 'failed', error: errorOf(err) })
      }
    }

    for (const d of spec.dependencies ?? []) {
      const name = `${d.from} → ${d.to}`
      const type = d.type ?? 'depends_on'
      const from = assetIds.get(d.from.toLowerCase())
      const to = assetIds.get(d.to.toLowerCase())
      if (from === undefined || to === undefined) {
        report({ kind: 'dependency', product: label, name, status: 'failed', error: `No asset named "${from === undefined ? d.from : d.to}" in ${label}` })
        continue
      }
      if (from && to && detail?.dependencies.some((e) => e.sourceAssetId === from && e.targetAssetId === to && e.dependencyType === type)) {
        report({ kind: 'dependency', product: label, name, status: 'exists' })
        continue
      }
      if (opts.dryRun || !from || !to) { report({ kind: 'dependency', product: label, name, status: 'would create' }); continue }
      try {
        await client.call('add_asset_dependency', { sourceAssetId: from, targetAssetId: to, dependencyType: type, ...(d.description ? { description: d.description } : {}) })
        report({ kind: 'dependency', product: label, name, status: create })
      } catch (err) {
        report({ kind: 'dependency', product: label, name, status: 'failed', error: errorOf(err) })
      }
    }

    for (const p of spec.people ?? []) {
      const name = `${p.email} (${p.responsibility}${p.area ? `, ${p.area}` : ''})`
      const has = people?.members.some((m) => m.email.toLowerCase() === p.email.toLowerCase() && m.responsibility === p.responsibility && (m.area ?? null) === (p.area ?? null))
      if (has) { report({ kind: 'person', product: label, name, status: 'exists' }); continue }
      if (opts.dryRun || !detail) { report({ kind: 'person', product: label, name, status: 'would create' }); continue }
      try {
        await client.call('assign_responsibility', { productId: detail.id, email: p.email, responsibility: p.responsibility, ...(p.area ? { area: p.area } : {}) })
        report({ kind: 'person', product: label, name, status: create })
      } catch (err) {
        report({ kind: 'person', product: label, name, status: 'failed', error: errorOf(err) })
      }
    }
  }
  return results
}
