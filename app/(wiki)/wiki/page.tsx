import Link from 'next/link'
import { redirect } from 'next/navigation'
import { authAdapter } from '@/lib/auth'
import { getProducts } from '@/lib/db/queries'
import { getProductScope } from '@/lib/product-scope'
import { wikiHref } from '@/lib/wiki/model'
// A ?q= query (e.g. from the global /search page's wiki link) carries on to
// the product wiki's search.
export default async function WikiIndex({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams
  const q = typeof raw.q === 'string' ? raw.q.slice(0, 250) : undefined
  const user = await authAdapter.getUser()
  if (!user) redirect('/login')
  const products = await getProducts(user.id),
    scope = await getProductScope()
  const selected =
    products.find((p) => p.id === scope) ??
    (products.length === 1 ? products[0] : undefined)
  if (selected) redirect(wikiHref(selected.slug, { q }))
  return (
    <main id="wiki-content" className="wiki-product-picker">
      <p className="wiki-eyebrow">CodePlans / Wiki</p>
      <h1>Your product library</h1>
      <p>
        Explore the architecture, documents, decisions, and work behind a
        product.
      </p>
      <div className="wiki-cards">
        {products.map((p) => (
          <Link className="wiki-card" key={p.id} href={wikiHref(p.slug, { q })}>
            <h2>{p.name}</h2>
            <p>{p.description}</p>
            <span>{p.assetCount} assets →</span>
          </Link>
        ))}
      </div>
      {!products.length && <p>No products are visible to your account yet.</p>}
      <Link href="/">Back to CodePlans</Link>
    </main>
  )
}
