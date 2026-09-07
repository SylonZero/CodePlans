import { and, eq, isNotNull, isNull } from 'drizzle-orm'
import { db } from './index'
import { codePlans, workItems, products, specs, specLinks } from './schema'
import { linkSpecInTransaction } from './specs'
import { fetchSpecMarkdown } from '@/lib/specs'

export const IMPORT_PLACEHOLDER = 'Content not yet imported — see sourceUrl.'
export function inferSpecType(text: string) {
  const lower = text.toLowerCase()
  for (const type of ['schema', 'test', 'workflow', 'architecture', 'integration', 'api', 'ux', 'ops']) {
    if (new RegExp(`(?:^|[^a-z])${type}(?:$|[^a-z])`).test(lower)) return type
  }
  return 'feature'
}

/** Dry-run by default, scoped to one product, idempotent by exact original URL within that product. */
export async function migrateLegacySpecs(productId: string, options: {
  apply?: boolean
  fetchBody?: (url: string, organizationId: string | null) => Promise<string | null>
} = {}) {
  const [product] = await db.select().from(products).where(eq(products.id, productId))
  if (!product) throw new Error('Product not found')
  const plans = await db.select({ id: codePlans.id, title: codePlans.title, sourceUrl: codePlans.specUrl }).from(codePlans)
    .where(and(eq(codePlans.productId, productId), isNotNull(codePlans.specUrl)))
  const items = await db.select({ id: workItems.id, title: workItems.title, sourceUrl: workItems.specUrl }).from(workItems)
    .where(and(eq(workItems.productId, productId), isNotNull(workItems.specUrl)))
  type Source = { id: string; title: string; targetType: 'code_plan' | 'work_item' }
  const groups = new Map<string, Source[]>()
  for (const source of [...plans.map((p) => ({ ...p, targetType: 'code_plan' as const })), ...items.map((i) => ({ ...i, targetType: 'work_item' as const }))]) {
    if (!source.sourceUrl) continue
    groups.set(source.sourceUrl, [...(groups.get(source.sourceUrl) ?? []), source])
  }
  const entries = []
  for (const [sourceUrl, sources] of groups) {
    const where = and(eq(specs.productId, productId), eq(specs.sourceType, 'git_import'), eq(specs.sourceUrl, sourceUrl), isNull(specs.supersedes))
    const [existing] = await db.select().from(specs).where(where)
    let fetched: string | null = null
    if (!existing) {
      try { fetched = await (options.fetchBody ?? fetchSpecMarkdown)(sourceUrl, product.organizationId) } catch { /* broken imports remain reviewable */ }
    }
    const body = existing?.body ?? fetched ?? IMPORT_PLACEHOLDER
    const specType = existing?.specType ?? inferSpecType(`${sources[0].title} ${sourceUrl}`)
    let specId = existing?.id
    if (options.apply) {
      specId = await db.transaction(async (tx) => {
        const [created] = existing ? [] : await tx.insert(specs).values({
          productId, title: sources[0].title, body: body.slice(0, 500_000), specType,
          sourceType: 'git_import', sourceUrl, needsReview: true, authorType: 'agent',
        }).onConflictDoNothing().returning()
        const row = existing ?? created ?? (await tx.select().from(specs).where(where))[0]
        if (!row) throw new Error('Could not create or resolve imported spec')
        for (const source of sources) {
          const [linked] = await tx.select({ id: specLinks.id }).from(specLinks).where(and(eq(specLinks.specId, row.id), eq(specLinks.targetType, source.targetType), eq(specLinks.targetId, source.id)))
          if (!linked) await linkSpecInTransaction(tx, row.id, source.targetType, source.id, source.targetType === 'code_plan' ? 'creates' : undefined)
        }
        return row.id
      })
    }
    entries.push({ sourceUrl, specId: specId ?? null, action: existing ? 'reuse' : 'create',
      specType, needsReview: existing?.needsReview ?? true, placeholder: body === IMPORT_PLACEHOLDER,
      collapsedDuplicates: sources.length - 1, targets: sources.map(({ id, targetType }) => ({ id, targetType })),
    })
  }
  return { dryRun: !options.apply, productId, sourceCount: plans.length + items.length,
    uniqueUrls: groups.size, createCount: entries.filter((e) => e.action === 'create').length,
    collapsedDuplicates: entries.reduce((n, e) => n + e.collapsedDuplicates, 0),
    placeholderCount: entries.filter((e) => e.placeholder).length, entries }
}
