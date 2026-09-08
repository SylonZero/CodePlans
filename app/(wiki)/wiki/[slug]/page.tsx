import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { authAdapter } from '@/lib/auth'
import { getProducts } from '@/lib/db/queries'
import { getWikiProduct } from '@/lib/db/wiki'
import {
  kindLabels,
  inactiveStatuses,
  wikiKinds,
  searchWiki,
  wikiHref,
  plainText,
} from '@/lib/wiki/model'
import {
  AssetReader,
  DocumentReader,
  DocumentList,
  ActivityList,
} from '@/components/wiki/views'
import { ThemeToggle } from '@/components/theme-toggle'
import { WikiTime } from '@/components/wiki/time'
export const dynamic = 'force-dynamic'
type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}
export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  return {
    title: `${slug} · CodePlans Wiki`,
    robots: { index: false, follow: false },
  }
}
function Highlight({ text, query }: { text: string; query: string }) {
  const terms = query.trim().split(/\s+/).filter(Boolean).slice(0, 20)
  if (!terms.length) return <>{text}</>
  const pattern = new RegExp(
    `(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
    'ig',
  )
  return (
    <>
      {text
        .split(pattern)
        .map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p))}
    </>
  )
}
export default async function WikiProduct({ params, searchParams }: Props) {
  const user = await authAdapter.getUser()
  if (!user) redirect('/login')
  const { slug } = await params,
    raw = await searchParams
  const read = (k: string) =>
    typeof raw[k] === 'string' ? (raw[k] as string) : ''
  const q = read('q').slice(0, 250),
    assetId = read('asset'),
    docKey = read('doc'),
    view = read('view'),
    kind = read('kind'),
    status = read('status'),
    since = read('since'),
    area = read('area')
  const [data, products] = await Promise.all([
    getWikiProduct(slug, user.id),
    getProducts(user.id),
  ])
  if (!data) notFound()
  const asset = data.assets.find((a) => a.id === assetId),
    doc = data.documents.find((d) => d.key === docKey)
  if ((assetId && !asset) || (docKey && !doc)) notFound()
  const listing =
    view === 'documents' ||
    view === 'review' ||
    !!q ||
    !!kind ||
    !!status ||
    !!since ||
    !!area
  const filters = {
    q,
    asset: assetId,
    kind,
    status,
    since,
    area,
    archived: read('archived') === '1',
    review: view === 'review',
  }
  const results = listing ? searchWiki(data.documents, filters) : []
  const page = Math.max(
    1,
    Math.min(
      Math.ceil(results.length / 20) || 1,
      Number.parseInt(read('page'), 10) || 1,
    ),
  )
  const layers = [...new Set(data.assets.map((a) => a.layer))]
  const order = [
    'edge',
    'frontend',
    'backend',
    'domain',
    'data',
    'infra',
    'shared',
  ]
  layers.sort(
    (a, b) =>
      (order.includes(a) ? order.indexOf(a) : 99) -
        (order.includes(b) ? order.indexOf(b) : 99) || a.localeCompare(b),
  )
  const review = data.documents.filter(
      (d) => d.needsReview && !inactiveStatuses.has(d.status),
    ),
    unassigned = data.documents.filter(
      (d) => !d.associations.length && !inactiveStatuses.has(d.status),
    ),
    areas = [
      ...new Set(
        data.documents
          .filter(
            (d) =>
              !assetId || d.associations.some((a) => a.assetId === assetId),
          )
          .map((d) => d.area)
          .filter((a): a is string => !!a),
      ),
    ].sort()
  const pageLink = (n: number) =>
    wikiHref(slug, {
      view: view || 'documents',
      q,
      asset: assetId,
      kind,
      status,
      since,
      area,
      archived: filters.archived ? '1' : undefined,
      page: String(n),
    })
  return (
    <>
      <header className="wiki-topbar">
        <Link className="wiki-brand" href="/wiki">
          CodePlans <span>Wiki</span>
        </Link>
        <details className="wiki-product-menu">
          <summary>
            {data.product.name} <span aria-hidden>⌄</span>
          </summary>
          <nav aria-label="Choose product">
            {products.map((p) => (
              <Link
                key={p.id}
                href={wikiHref(p.slug)}
                aria-current={p.id === data.product.id ? 'page' : undefined}
              >
                {p.name}
              </Link>
            ))}
          </nav>
        </details>
        <form
          role="search"
          action={wikiHref(slug)}
          className="wiki-global-search"
        >
          <input type="hidden" name="view" value="documents" />
          <input
            name="q"
            aria-label="Search this product"
            placeholder={`Search ${data.product.name}…`}
            defaultValue={q}
          />
          <button aria-label="Search product">Search</button>
        </form>
        <ThemeToggle />
        <Link className="wiki-back" href={`/products/${slug}`}>
          Open CodePlans ↗
        </Link>
      </header>
      <div className="wiki-workspace">
        <aside className="wiki-sidebar">
          <details className="wiki-navigation" open>
            <summary>Browse {data.product.name}</summary>
            <nav aria-label="Wiki navigation">
              <Link
                className={!asset && !doc && !view ? 'selected' : ''}
                href={wikiHref(slug)}
              >
                Product overview
              </Link>
              <Link
                className={view === 'documents' && !asset ? 'selected' : ''}
                href={wikiHref(slug, { view: 'documents' })}
              >
                All content <small>{data.documents.length}</small>
              </Link>
              <Link
                className={view === 'changes' ? 'selected' : ''}
                href={wikiHref(slug, { view: 'changes' })}
              >
                Recent changes
              </Link>
              <Link
                className={view === 'review' ? 'selected' : ''}
                href={wikiHref(slug, { view: 'review' })}
              >
                Needs review <small>{review.length}</small>
              </Link>
              {layers.map((layer) => (
                <details key={layer} open className="wiki-layer">
                  <summary>
                    {layer}
                    <small>
                      {data.assets.filter((a) => a.layer === layer).length}
                    </small>
                  </summary>
                  {data.assets
                    .filter((a) => a.layer === layer)
                    .map((a) => (
                      <Link
                        key={a.id}
                        className={assetId === a.id ? 'selected' : ''}
                        href={wikiHref(slug, { asset: a.id })}
                      >
                        {a.name}
                      </Link>
                    ))}
                </details>
              ))}
            </nav>
          </details>
          <p className="wiki-sidebar-note">
            Assembled from your product’s records. Layers use type defaults when
            unset.
          </p>
        </aside>
        <main id="wiki-content" className="wiki-main">
          <div className="wiki-breadcrumb">
            <Link href={wikiHref(slug)}>{data.product.name}</Link>
            <span>/</span>
            <span>
              {doc?.title ??
                asset?.name ??
                (view === 'review'
                  ? 'Needs review'
                  : view === 'changes'
                    ? 'Recent changes'
                    : listing
                      ? 'Documents'
                      : 'Overview')}
            </span>
          </div>
          {doc ? (
            <DocumentReader data={data} doc={doc} />
          ) : listing ? (
            <>
              <p className="wiki-eyebrow">
                {view === 'review' ? 'Document readiness' : 'Product library'}
                {asset ? ` / ${asset.name}` : ''}
              </p>
              <h1>
                {view === 'review'
                  ? 'Specs needing review'
                  : q
                    ? `Search results`
                    : 'Explore the documents'}
              </h1>
              <p className="wiki-lead">
                {view === 'review'
                  ? 'Review content, titles, classification, and source references in CodePlans. Imported drafts are not automatically delivered capabilities.'
                  : 'Search content, headings, areas, repository paths, and technical identifiers.'}
              </p>
              <details className="wiki-filter-disclosure">
                <summary>
                  Filter by asset, content type, status, area, or date
                  {[
                    assetId,
                    kind,
                    status,
                    since,
                    area,
                    filters.archived,
                  ].filter(Boolean).length
                    ? ` · ${[assetId, kind, status, since, area, filters.archived].filter(Boolean).length} applied`
                    : ''}
                </summary>
                <form action={wikiHref(slug)} className="wiki-search-filters">
                  <input
                    type="hidden"
                    name="view"
                    value={view === 'review' ? 'review' : 'documents'}
                  />
                  <label className="wiki-query-label">
                    Search
                    <input
                      name="q"
                      defaultValue={q}
                      placeholder="Words, paths, or configuration names"
                    />
                  </label>
                  <label>
                    Asset
                    <select name="asset" defaultValue={assetId}>
                      <option value="">
                        All assets & product-level content
                      </option>
                      {data.assets.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Content
                    <select name="kind" defaultValue={kind}>
                      <option value="">All types</option>
                      {wikiKinds.map((k) => (
                        <option key={k} value={k}>
                          {kindLabels[k]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Status
                    <select name="status" defaultValue={status}>
                      <option value="">Current content</option>
                      {[...new Set(data.documents.map((d) => d.status))]
                        .sort()
                        .map((s) => (
                          <option key={s} value={s}>
                            {s.replaceAll('_', ' ')}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Area
                    <select name="area" defaultValue={area}>
                      <option value="">All areas</option>
                      {areas.map((a) => (
                        <option key={a}>{a}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Modified since
                    <input type="date" name="since" defaultValue={since} />
                  </label>
                  <label className="wiki-check">
                    <input
                      type="checkbox"
                      name="archived"
                      value="1"
                      defaultChecked={filters.archived}
                    />
                    Include archived / superseded
                  </label>
                  <button>Apply filters</button>
                  <Link href={wikiHref(slug, { view: view || 'documents' })}>
                    Reset
                  </Link>
                </form>
              </details>
              <p className="wiki-caption">
                {results.length} result{results.length === 1 ? '' : 's'}
                {q ? ` for “${q}”` : ''} · Showing{' '}
                {results.length ? (page - 1) * 20 + 1 : 0}–
                {Math.min(page * 20, results.length)}
              </p>
              <ul className="wiki-search-results">
                {results
                  .slice((page - 1) * 20, page * 20)
                  .map(({ document: d, excerpt }) => (
                    <li key={d.key}>
                      <div className="wiki-list-top">
                        <span className="wiki-kind">
                          {kindLabels[d.kind]}
                          {d.version ? ` · Spec v${d.version}` : ''}
                        </span>
                        <span className="wiki-state">
                          {d.needsReview
                            ? 'Needs review'
                            : d.status.replaceAll('_', ' ')}
                        </span>
                      </div>
                      <Link
                        href={wikiHref(
                          slug,
                          d.kind === 'asset' ? { asset: d.id } : { doc: d.key },
                        )}
                      >
                        <Highlight text={d.title} query={q} />
                      </Link>
                      <p>
                        <Highlight text={excerpt} query={q} />
                      </p>
                      <div className="wiki-meta">
                        {[
                          ...new Set(
                            d.associations.map(
                              (a) =>
                                data.assets.find((x) => x.id === a.assetId)
                                  ?.name,
                            ),
                          ),
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'Product-level'}{' '}
                        · <WikiTime value={d.updatedAt} />
                      </div>
                    </li>
                  ))}
              </ul>
              {!results.length && (
                <p className="wiki-empty">
                  No matching content. Try fewer filters or include archived
                  documents.
                </p>
              )}
              <nav className="wiki-pagination" aria-label="Search result pages">
                {page > 1 && <Link href={pageLink(page - 1)}>← Previous</Link>}
                <span>
                  Page {page} of {Math.ceil(results.length / 20) || 1}
                </span>
                {page * 20 < results.length && (
                  <Link href={pageLink(page + 1)}>Next →</Link>
                )}
              </nav>
            </>
          ) : view === 'changes' ? (
            <>
              <p className="wiki-eyebrow">
                Recorded evolution{asset ? ` / ${asset.name}` : ''}
              </p>
              <h1>Recent changes</h1>
              <p className="wiki-lead">
                Decisions, completed work, shipped releases, and grouped spec
                associations. Import activity records when content arrived, not
                when it was originally written.
              </p>
              <ActivityList
                data={data}
                assetId={assetId}
                limit={Math.max(20, Number.parseInt(read('limit'), 10) || 20)}
              />
              {data.activity.filter(
                (e) => !assetId || e.assetIds.includes(assetId),
              ).length > (Number.parseInt(read('limit'), 10) || 20) && (
                <Link
                  className="wiki-more"
                  href={wikiHref(slug, {
                    view: 'changes',
                    asset: assetId,
                    limit: String(
                      (Number.parseInt(read('limit'), 10) || 20) + 20,
                    ),
                  })}
                >
                  Show more history →
                </Link>
              )}
            </>
          ) : asset ? (
            <AssetReader data={data} assetId={asset.id} />
          ) : (
            <>
              <p className="wiki-eyebrow">Product knowledge</p>
              <h1>{data.product.name}</h1>
              <p className="wiki-lead">
                {data.product.description ||
                  'Explore the architecture, documents, decisions, and work behind this product.'}
              </p>
              <div className="wiki-stats">
                <div>
                  <strong>{data.assets.length}</strong>
                  <span>Assets</span>
                </div>
                <div>
                  <strong>
                    {data.documents.filter((d) => d.kind === 'spec').length}
                  </strong>
                  <span>Specs</span>
                </div>
                <div>
                  <strong>
                    {
                      data.documents.filter(
                        (d) => d.kind === 'plan' && d.status === 'active',
                      ).length
                    }
                  </strong>
                  <span>Active plans</span>
                </div>
                <div>
                  <strong>{data.dependencies.length}</strong>
                  <span>Connections</span>
                </div>
              </div>
              {review.length > 0 && (
                <Link
                  className="wiki-callout"
                  href={wikiHref(slug, { view: 'review' })}
                >
                  {review.length} spec
                  {review.length === 1 ? ' needs' : 's need'} review
                  {review.some((d) => d.placeholder)
                    ? ` · ${review.filter((d) => d.placeholder).length} source references awaiting content`
                    : ''}{' '}
                  →
                </Link>
              )}
              <section className="wiki-section">
                <div className="wiki-section-title">
                  <h2>Explore the architecture</h2>
                  <span className="wiki-caption">
                    Select an asset to read its story
                  </span>
                </div>
                <div className="wiki-cards">
                  {data.assets.map((a) => (
                    <Link
                      className="wiki-card"
                      key={a.id}
                      href={wikiHref(slug, { asset: a.id })}
                    >
                      <span className="wiki-eyebrow">
                        {a.layer} / {a.type}
                      </span>
                      <h3>{a.name}</h3>
                      <p>
                        {plainText(
                          data.documents.find((d) => d.key === `asset:${a.id}`)
                            ?.body ?? '',
                        ).slice(0, 150)}
                      </p>
                      <span className="wiki-meta">
                        {
                          data.documents.filter(
                            (d) =>
                              d.kind !== 'asset' &&
                              d.associations.some((x) => x.assetId === a.id),
                          ).length
                        }{' '}
                        associated documents →
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
              {unassigned.length > 0 && (
                <section className="wiki-section">
                  <h2>Product-level content</h2>
                  <p className="wiki-caption">
                    These records have no asset association and remain
                    discoverable here and in search.
                  </p>
                  <DocumentList data={data} docs={unassigned} />
                </section>
              )}
              <section className="wiki-section">
                <div className="wiki-section-title">
                  <h2>Recent evolution</h2>
                  <Link href={wikiHref(slug, { view: 'changes' })}>
                    View history →
                  </Link>
                </div>
                <ActivityList data={data} />
              </section>
            </>
          )}
        </main>
      </div>
    </>
  )
}
