import Link from 'next/link'
import { WikiTime } from './time'
import { WikiMarkdown } from './markdown'
import { wikiOutline, sourceKey } from '@/lib/wiki/markdown'
import {
  kindLabels,
  plainText,
  wikiHref,
  type WikiData,
  type WikiDocument,
} from '@/lib/wiki/model'

export function DocumentList({
  data,
  docs,
  assetId,
  limit = 8,
  empty = 'Nothing recorded here yet.',
}: {
  data: WikiData
  docs: WikiDocument[]
  assetId?: string
  limit?: number
  empty?: string
}) {
  return docs.length ? (
    <ul className="wiki-document-list">
      {docs.slice(0, limit).map((d) => (
        <li key={d.key}>
          <div className="wiki-list-top">
            <span className="wiki-kind">
              {kindLabels[d.kind]}
              {d.specType ? ` / ${d.specType}` : ''}
            </span>
            <span
              className={`wiki-state ${d.needsReview ? 'wiki-review' : ''}`}
            >
              {d.placeholder
                ? 'Source reference'
                : d.needsReview
                  ? 'Needs review'
                  : d.status.replaceAll('_', ' ')}
            </span>
          </div>
          <Link href={wikiHref(data.product.slug, { doc: d.key })}>
            {d.title}
          </Link>
          <p>
            {plainText(d.body).slice(0, 170)}
            {d.body.length > 170 ? '…' : ''}
          </p>
          <div className="wiki-meta">
            {d.version && <span>Spec v{d.version} · </span>}
            {d.area && <span>{d.area} · </span>}
            <WikiTime value={d.updatedAt} />
          </div>
          {d.kind === 'spec' &&
            assetId &&
            (() => {
              const rs = data.receipts.filter(
                  (r) => r.assetId === assetId && r.specId === d.id,
                ),
                v = rs.length ? Math.max(...rs.map((r) => r.version)) : null
              return (
                <p className="wiki-meta">
                  {v === null
                    ? 'No delivery receipt recorded'
                    : `Highest receipt: v${v}${v < (d.version ?? 1) ? ' · Later revision unconfirmed' : ''}`}
                </p>
              )
            })()}
        </li>
      ))}
    </ul>
  ) : (
    <p className="wiki-empty">{empty}</p>
  )
}
export function ActivityList({
  data,
  assetId,
  limit = 12,
}: {
  data: WikiData
  assetId?: string
  limit?: number
}) {
  const events = data.activity
    .filter((e) => !assetId || e.assetIds.includes(assetId))
    .slice(0, limit)
  return events.length ? (
    <ol className="wiki-timeline">
      {events.map((e) => (
        <li key={e.id}>
          <div className="wiki-meta">
            {e.kind.replaceAll('_', ' ')} · <WikiTime value={e.date} />
          </div>
          {e.kind.startsWith('spec_') ? (
            <details>
              <summary>
                {e.title} <span className="wiki-meta">({e.count} events)</span>
              </summary>
              <ul>
                {e.documentKeys.map((k) => {
                  const d = data.documents.find((d) => d.key === k)
                  return d ? (
                    <li key={k}>
                      <Link href={wikiHref(data.product.slug, { doc: k })}>
                        {d.title}
                      </Link>
                    </li>
                  ) : null
                })}
              </ul>
            </details>
          ) : (
            <Link
              href={wikiHref(data.product.slug, { doc: e.documentKeys[0] })}
            >
              {e.title}
            </Link>
          )}
        </li>
      ))}
    </ol>
  ) : (
    <p className="wiki-empty">No recorded activity yet.</p>
  )
}
export function AssetReader({
  data,
  assetId,
}: {
  data: WikiData
  assetId: string
}) {
  const asset = data.assets.find((a) => a.id === assetId)!,
    slug = data.product.slug
  const docs = data.documents.filter((d) =>
      d.associations.some((a) => a.assetId === assetId),
    ),
    overview = docs.find((d) => d.key === `asset:${assetId}`)!
  const open = (d: WikiDocument) =>
    ['open', 'planned', 'in_progress'].includes(d.status)
  const sections = [
    {
      id: 'capabilities',
      title: 'Recorded capabilities',
      docs: docs.filter(
        (d) => d.kind === 'capability' && d.status === 'active',
      ),
      empty:
        'No capabilities recorded yet. Completed work and release status are listed separately below.',
    },
    {
      id: 'specs',
      title: 'Specs & intended changes',
      docs: docs.filter(
        (d) => d.kind === 'spec' && ['draft', 'active'].includes(d.status),
      ),
    },
    {
      id: 'notes',
      title: 'Notes & design decisions',
      docs: docs.filter((d) => ['asset-notes', 'note'].includes(d.kind)),
    },
    {
      id: 'plans',
      title: 'Work underway',
      docs: docs.filter(
        (d) => d.kind === 'plan' && ['draft', 'active'].includes(d.status),
      ),
    },
    {
      id: 'issues',
      title: 'Known issues & tech debt',
      docs: docs
        .filter(
          (d) =>
            d.kind === 'work-item' &&
            open(d) &&
            d.tags.some((t) => ['bug', 'ux', 'tech_debt'].includes(t)),
        )
        .sort(
          (a, b) =>
            ['critical', 'high', 'medium', 'low'].findIndex((t) =>
              a.tags.includes(t),
            ) -
            ['critical', 'high', 'medium', 'low'].findIndex((t) =>
              b.tags.includes(t),
            ),
        ),
    },
    {
      id: 'completed',
      title: 'Completed work',
      docs: docs.filter((d) => d.kind === 'plan' && d.status === 'completed'),
    },
    {
      id: 'releases',
      title: 'Releases',
      docs: docs.filter((d) => d.kind === 'release'),
    },
  ]
  const edges = data.dependencies.filter(
    (e) => e.sourceAssetId === assetId || e.targetAssetId === assetId,
  )
  return (
    <div className="wiki-reading-layout">
      <article>
        <p className="wiki-eyebrow">
          {asset.layer} / {asset.type}
        </p>
        <h1>{asset.name}</h1>
        <div className="wiki-badges">
          <span className="wiki-state">{asset.status}</span>
          <span>Recorded health: {asset.health}</span>
          <span>
            {asset.version
              ? `Latest stamped release version: ${asset.version}`
              : 'No shipped version recorded'}
          </span>
        </div>
        <WikiMarkdown body={overview.body} slug={slug} imported={{}} />
        <div className="wiki-asset-facts">
          <span>Owners: {asset.owners.join(', ') || 'Not assigned'}</span>
          {asset.repoPath && <code>{asset.repoPath}</code>}
          {asset.repositoryUrl && (
            <a href={asset.repositoryUrl} rel="noreferrer">
              Repository ↗
            </a>
          )}
          {asset.documentationUrl && (
            <a href={asset.documentationUrl} rel="noreferrer">
              External documentation ↗
            </a>
          )}
          <Link href={`/assets/${assetId}`}>Open in CodePlans ↗</Link>
        </div>
        <div className="wiki-meta">
          Created <WikiTime value={overview.createdAt} /> ·{' '}
          {overview.createdBy ?? 'Creator not recorded'}
          <br />
          Asset record updated <WikiTime value={overview.updatedAt} /> ·{' '}
          {overview.updatedBy ?? 'Editor not recorded'}
        </div>
        <div className="wiki-section-title">
          <h2>Explore this asset</h2>
          <Link href={wikiHref(slug, { view: 'documents', asset: assetId })}>
            All associated content ({docs.length}) →
          </Link>
        </div>
        <form className="wiki-inline-search" action={wikiHref(slug)}>
          <input type="hidden" name="asset" value={assetId} />
          <input type="hidden" name="view" value="documents" />
          <input
            name="q"
            aria-label={`Search ${asset.name}`}
            placeholder="Search this asset’s documents, areas, and work…"
          />
          <button>Search</button>
        </form>
        {sections.map((s) => (
          <section id={s.id} key={s.id} className="wiki-section">
            <div className="wiki-section-title">
              <h2>
                {s.title} <span>{s.docs.length}</span>
              </h2>
              {s.docs.length > 6 && (
                <Link
                  href={wikiHref(slug, {
                    view: 'documents',
                    asset: assetId,
                    kind: s.id === 'notes' ? 'note' : s.docs[0].kind,
                    status: s.id === 'completed' ? 'completed' : undefined,
                  })}
                >
                  View all →
                </Link>
              )}
            </div>
            {s.id === 'specs' && s.docs.length > 0 && (
              <p className="wiki-caption">
                Drafts and active specs describe intent. A delivery receipt
                confirms a version for a capability, not every requirement in
                the document.
              </p>
            )}
            <DocumentList
              data={data}
              docs={s.docs}
              assetId={assetId}
              limit={6}
              empty={s.empty}
            />
            {s.id === 'specs' &&
              s.docs.some((d) =>
                data.receipts.some(
                  (r) => r.assetId === assetId && r.specId === d.id,
                ),
              ) && (
                <details className="wiki-receipts">
                  <summary>
                    Spec versions confirmed by capability receipts
                  </summary>
                  {s.docs.map((d) => {
                    const receipts = data.receipts.filter(
                      (r) => r.assetId === assetId && r.specId === d.id,
                    )
                    return receipts.length ? (
                      <p key={d.id}>
                        <Link href={wikiHref(slug, { doc: d.key })}>
                          {d.title}
                        </Link>
                        : current v{d.version} · highest recorded receipt v
                        {Math.max(...receipts.map((r) => r.version))} (includes
                        removed capabilities)
                      </p>
                    ) : null
                  })}
                </details>
              )}
          </section>
        ))}
        <section id="history" className="wiki-section">
          <div className="wiki-section-title">
            <h2>Recent evolution</h2>
            <Link href={wikiHref(slug, { view: 'changes', asset: assetId })}>
              Full history →
            </Link>
          </div>
          <ActivityList data={data} assetId={assetId} />
        </section>
      </article>
      <aside className="wiki-context">
        <p className="wiki-eyebrow">On this page</p>
        <nav aria-label="On this page">
          {sections.map((s) => (
            <a key={s.id} href={`#${s.id}`}>
              {s.title}
            </a>
          ))}
          <a href="#history">Recent evolution</a>
        </nav>
        <p className="wiki-eyebrow">Architecture connections</p>
        {edges.length ? (
          edges.map((e) => {
            const upstream = e.sourceAssetId === assetId
            const a = data.assets.find(
              (a) => a.id === (upstream ? e.targetAssetId : e.sourceAssetId),
            )
            return a ? (
              <div
                className="wiki-connection"
                key={`${e.sourceAssetId}:${e.targetAssetId}`}
              >
                <small>{upstream ? 'Depends on' : 'Used by'}</small>
                <Link href={wikiHref(slug, { asset: a.id })}>{a.name}</Link>
                {e.description && <p>{e.description}</p>}
              </div>
            ) : null
          })
        ) : (
          <p className="wiki-meta">No dependencies recorded.</p>
        )}
      </aside>
    </div>
  )
}
export function DocumentReader({
  data,
  doc,
}: {
  data: WikiData
  doc: WikiDocument
}) {
  const slug = data.product.slug,
    outline = wikiOutline(doc.body),
    imported = Object.fromEntries(
      data.documents
        .filter((d) => d.kind === 'spec' && d.sourceUrl && !d.supersedes)
        .map((d) => [sourceKey(d.sourceUrl!), d.id]),
    )
  const receipts = data.receipts.filter(
    (r) => r.specId === doc.id || r.capabilityKey === doc.key,
  )
  return (
    <div className="wiki-reading-layout">
      <article>
        <p className="wiki-eyebrow">
          {kindLabels[doc.kind]}
          {doc.specType ? ` / ${doc.specType}` : ''}
          {doc.area ? ` / ${doc.area}` : ''}
        </p>
        <h1>{doc.title}</h1>
        <div className="wiki-badges">
          <span className="wiki-state">{doc.status.replaceAll('_', ' ')}</span>
          {doc.version && <span>Spec revision {doc.version}</span>}
          {doc.needsReview && (
            <Link className="wiki-review" href={doc.editUrl}>
              Needs review
            </Link>
          )}
        </div>
        <div className="wiki-byline">
          <div>
            {doc.sourceType === 'git_import'
              ? 'Imported into CodePlans'
              : 'Created'}{' '}
            <WikiTime value={doc.createdAt} /> ·{' '}
            {doc.createdBy ?? 'Creator not recorded'}
            {doc.createdByKind === 'agent' ? ' via agent' : ''}
          </div>
          <div>
            Record updated <WikiTime value={doc.updatedAt} /> ·{' '}
            {doc.updatedBy ?? 'Editor not recorded'}
            {doc.updatedByKind === 'agent' ? ' via agent' : ''}
          </div>
          {doc.sourceType === 'git_import' && (
            <p>
              Import dates describe this CodePlans record, not the original
              document’s authorship or last edit.
            </p>
          )}
        </div>
        <div className="wiki-document-actions">
          <Link href={doc.editUrl}>Open / edit in CodePlans ↗</Link>
          {doc.sourceUrl && (
            <a href={doc.sourceUrl} rel="noreferrer">
              Original source ↗
            </a>
          )}
          <a href={wikiHref(slug, { doc: doc.key })}>Permanent link</a>
        </div>
        {doc.supersededBy && (
          <p className="wiki-callout">
            This approach was superseded.{' '}
            <Link href={wikiHref(slug, { doc: `spec:${doc.supersededBy}` })}>
              Read its replacement →
            </Link>
          </p>
        )}
        {doc.supersedes && (
          <p className="wiki-callout">
            <Link href={wikiHref(slug, { doc: `spec:${doc.supersedes}` })}>
              Previous approach →
            </Link>
          </p>
        )}
        <details className="wiki-mobile-toc">
          <summary>On this page</summary>
          <nav aria-label="Document sections on small screens">
            {outline.map((h) => (
              <a key={h.id} href={`#${h.id}`}>
                {h.text}
              </a>
            ))}
          </nav>
        </details>
        {doc.placeholder ? (
          <p className="wiki-callout">
            Source reference only. Content has not been imported; use the
            original source or update this spec in CodePlans.
          </p>
        ) : doc.body.trim() ? (
          <WikiMarkdown
            body={doc.body}
            sourceUrl={doc.kind === 'spec' ? doc.sourceUrl : undefined}
            slug={slug}
            imported={imported}
          />
        ) : (
          <p className="wiki-empty">No document body recorded.</p>
        )}
        {receipts.length > 0 && (
          <section className="wiki-section">
            <h2>Delivery receipts</h2>
            {receipts.map((r) => (
              <p key={r.capabilityKey}>
                <Link href={wikiHref(slug, { doc: r.capabilityKey })}>
                  {data.documents.find((d) => d.key === r.capabilityKey)?.title}
                </Link>{' '}
                · spec v{r.version} ·{' '}
                {data.assets.find((a) => a.id === r.assetId)?.name}
                {r.removed ? ' · capability removed' : ''}
              </p>
            ))}
            <p className="wiki-caption">
              A receipt preserves the confirmed version. Historical spec bodies
              are not stored in v1.
            </p>
          </section>
        )}
      </article>
      <aside className="wiki-context">
        <p className="wiki-eyebrow">On this page</p>
        <nav aria-label="Document sections">
          {outline.map((h) => (
            <a
              key={h.id}
              href={`#${h.id}`}
              style={{ paddingLeft: Math.min(h.depth - 1, 3) * 10 }}
            >
              {h.text}
            </a>
          ))}
        </nav>
        <p className="wiki-eyebrow">Associated assets</p>
        {[...new Set(doc.associations.map((a) => a.assetId))].map((id) => (
          <div className="wiki-connection" key={id}>
            <Link href={wikiHref(slug, { asset: id })}>
              {data.assets.find((a) => a.id === id)?.name}
            </Link>
            <details>
              <summary>Why this appears here</summary>
              {doc.associations
                .filter((a) => a.assetId === id)
                .map((a, i) => (
                  <p key={i}>
                    {a.via ? (
                      <Link href={wikiHref(slug, { doc: a.via })}>
                        {a.label}
                      </Link>
                    ) : (
                      a.label
                    )}
                    {a.relationship ? ` · ${a.relationship}` : ''}
                  </p>
                ))}
            </details>
          </div>
        ))}
        {!doc.associations.length && (
          <p className="wiki-meta">
            Product-level content; no asset association.
          </p>
        )}
        <p className="wiki-eyebrow">Related content</p>
        <nav aria-label="Related content">
          {doc.related.map((k) => {
            const d = data.documents.find((d) => d.key === k)
            return d ? (
              <Link key={k} href={wikiHref(slug, { doc: k })}>
                <small>{kindLabels[d.kind]}</small>
                {d.title}
              </Link>
            ) : null
          })}
        </nav>
      </aside>
    </div>
  )
}
