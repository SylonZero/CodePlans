'use client'
import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RichTextEditor } from '@/components/rich-text-editor'
import { createSpecAction, listSpecsAction, linkSpecAction, unlinkSpecAction, updateSpecAction, supersedeSpecAction } from '@/app/(dashboard)/specs/actions'
import type { Spec, SpecLink, SpecTargetType, SpecRelationshipType } from '@/lib/db/specs'

const selectClass = 'w-full rounded-md border border-input bg-background p-2 text-sm'
const starterTypes = ['feature', 'ux', 'test', 'workflow', 'schema', 'api', 'architecture', 'integration', 'ops']

/** Also usable inside a parent form: writes the chosen id to FormData. */
export function SpecPicker({ productId, onSelect, name = 'specId' }: { productId: string; onSelect?: (id: string) => void; name?: string }) {
  const [options, setOptions] = useState<Spec[]>([])
  const [selected, setSelected] = useState('')
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [specType, setSpecType] = useState('feature')
  const [area, setArea] = useState('')
  const [error, setError] = useState('')
  const [pending, start] = useTransition()
  useEffect(() => {
    let cancelled = false
    setSelected(''); setCreating(false); setOptions([])
    if (productId) listSpecsAction(productId).then((rows) => { if (!cancelled) setOptions(rows) }).catch((e) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [productId])
  function choose(id: string) { setSelected(id); onSelect?.(id) }
  return <div className="space-y-2">
    <label className="text-sm font-medium">Spec
      <select aria-label="Spec" className={selectClass} name={name} value={selected} onChange={(e) => choose(e.target.value)}>
        <option value="">Choose a spec (optional)</option>
        {options.filter((s) => ['draft', 'active'].includes(s.status)).map((s) => <option key={s.id} value={s.id}>{s.specType} · {s.title} · v{s.version}</option>)}
      </select>
    </label>
    <Button type="button" size="sm" variant="outline" disabled={!productId} onClick={() => setCreating(!creating)}>{creating ? 'Cancel new spec' : 'Create a spec'}</Button>
    {creating && <div className="space-y-3 rounded-md border p-3">
      <Input aria-label="Spec title" placeholder="Spec title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <label className="block text-sm">Type<Input aria-label="Spec type" value={specType} onChange={(e) => setSpecType(e.target.value)} placeholder={starterTypes.join(', ')} /></label>
      <Input aria-label="Spec area" placeholder="Area (optional)" value={area} onChange={(e) => setArea(e.target.value)} />
      <RichTextEditor value={body} onChange={setBody} />
      <Button type="button" disabled={pending || !title.trim() || !specType.trim()} onClick={() => start(async () => {
        setError('')
        try { const spec = await createSpecAction({ productId, title, body, specType, area: area || undefined }); setOptions((rows) => [...rows, spec]); choose(spec.id); setCreating(false) }
        catch (e) { setError(e instanceof Error ? e.message : 'Could not create spec') }
      })}>{pending ? 'Saving…' : 'Save spec and select'}</Button>
    </div>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>
}

export function NativeSpecsPanel({ productId, targetType, targetId }: { productId: string; targetType: SpecTargetType; targetId: string }) {
  const [rows, setRows] = useState<(Spec & { links: SpecLink[] })[]>([])
  const [selected, setSelected] = useState('')
  const [relationship, setRelationship] = useState<SpecRelationshipType>('references')
  const [error, setError] = useState('')
  const [pending, start] = useTransition()
  const router = useRouter()
  async function reload() { setRows(await listSpecsAction(productId, targetType, targetId)) }
  useEffect(() => { let active = true; listSpecsAction(productId, targetType, targetId).then((r) => { if (active) setRows(r) }).catch((e) => { if (active) setError(e.message) }); return () => { active = false } }, [productId, targetType, targetId])
  function run(action: () => Promise<unknown>) { start(async () => { setError(''); try { await action(); await reload(); router.refresh() } catch (e) { setError(e instanceof Error ? e.message : 'Could not save') } }) }
  return <section className="space-y-4 rounded-lg border bg-card p-5">
    <h2 className="text-base font-semibold">Specs</h2>
    <p className="text-sm text-muted-foreground">Design intent, versioned independently of delivered capabilities.</p>
    {rows.length === 0 && <p className="text-sm text-muted-foreground">No specs linked yet.</p>}
    <ul className="divide-y">{rows.map((s) => <li key={s.id} className="flex items-start justify-between gap-3 py-3">
      <div><Link className="font-medium hover:underline" href={`/specs/${s.id}`}>{s.title}</Link><p className="text-xs text-muted-foreground">{s.specType}{s.area ? ` · ${s.area}` : ''} · v{s.version} · {s.status}</p></div>
      {s.links.filter((l) => l.targetType === targetType && l.targetId === targetId).map((l) => <Button type="button" key={l.id} size="sm" variant="ghost" disabled={pending} onClick={() => run(() => unlinkSpecAction(l.id))}>Unlink{l.relationshipType ? ` (${l.relationshipType})` : ''}</Button>)}
    </li>)}</ul>
    <SpecPicker key={productId} productId={productId} name="linkedSpecId" onSelect={setSelected} />
    {targetType === 'code_plan' && <select aria-label="Spec relationship" className={selectClass} value={relationship} onChange={(e) => setRelationship(e.target.value as SpecRelationshipType)}><option value="creates">Creates</option><option value="revises">Revises</option><option value="references">References</option></select>}
    <Button type="button" disabled={pending || !selected} onClick={() => run(() => linkSpecAction(selected, targetType, targetId, targetType === 'code_plan' ? relationship : undefined))}>Link spec</Button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>
}

export function SpecEditor({ spec }: { spec: Spec }) {
  const [body, setBody] = useState(spec.body)
  const [status, setStatus] = useState(spec.status)
  const [title, setTitle] = useState(spec.title)
  const [specType, setSpecType] = useState(spec.specType)
  const [area, setArea] = useState(spec.area ?? '')
  const [needsReview, setNeedsReview] = useState(spec.needsReview)
  const [error, setError] = useState('')
  const [pending, start] = useTransition()
  const router = useRouter()
  if (spec.status === 'superseded') return null
  function save(replace: boolean) { start(async () => {
    setError('')
    try {
      if (replace) { const next = await supersedeSpecAction(spec.id, body, title); router.push(`/specs/${next.id}`) }
      else { await updateSpecAction(spec.id, { body, title, specType, area: area || null, needsReview, status: status as 'draft' | 'active' | 'archived', expectedVersion: spec.version }); router.refresh() }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save') }
  }) }
  return <details className="rounded-lg border p-4"><summary className="cursor-pointer font-medium">Edit or replace this spec</summary><div className="mt-4 space-y-4">
    <label className="block text-sm">Title<Input aria-label="Spec title" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
    <label className="block text-sm">Type<Input aria-label="Spec type" value={specType} onChange={(e) => setSpecType(e.target.value)} /></label>
    <Input aria-label="Spec area" placeholder="Area (optional)" value={area} onChange={(e) => setArea(e.target.value)} />
    {spec.sourceType === 'git_import' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={needsReview} onChange={(e) => setNeedsReview(e.target.checked)} />Needs import review</label>}
    <RichTextEditor value={spec.body} onChange={setBody} size="tall" />
    <label className="block text-sm">Status<select aria-label="Spec status" className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}><option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option></select></label>
    <Button disabled={pending || !title.trim() || !specType.trim()} onClick={() => save(false)}>Save as v{spec.version + 1}</Button>
    <div className="space-y-2 border-t pt-4"><p className="text-sm text-muted-foreground">Changed the approach? Replace this spec with a new draft. Existing delivery receipts stay with this version.</p>
    <Button variant="outline" disabled={pending || !title.trim()} onClick={() => save(true)}>Supersede with new spec</Button></div>
    {error && <p role="alert" className="text-destructive">{error}</p>}
  </div></details>
}
