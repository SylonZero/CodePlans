'use client'
import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RichTextEditor } from '@/components/rich-text-editor'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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

type EditorSection = 'revise' | 'details' | 'supersede'

/**
 * The spec editor: a panel that slides in from the right when the action bar
 * asks for it. Content (title and text) saves as the next version, or replaces
 * the spec outright; Details (type and area) save in place on this version.
 * Lifecycle moves live in the action bar at the top of the page.
 */
export function SpecEditor({ spec }: { spec: Spec }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'content' | 'details'>('content')
  const [intent, setIntent] = useState<'revise' | 'supersede'>('revise')
  const [body, setBody] = useState(spec.body)
  const [title, setTitle] = useState(spec.title)
  const [specType, setSpecType] = useState(spec.specType)
  const [area, setArea] = useState(spec.area ?? '')
  const [changeSummary, setChangeSummary] = useState('')
  const [confirmingClose, setConfirmingClose] = useState(false)
  const [saved, setSaved] = useState('')
  const [error, setError] = useState('')
  const [pending, start] = useTransition()
  const router = useRouter()

  const contentChanged = body !== spec.body || title.trim() !== spec.title
  const detailsChanged = specType.trim() !== spec.specType || (area.trim() || null) !== (spec.area ?? null)
  const dirty = contentChanged || detailsChanged

  useEffect(() => {
    function onOpen(e: Event) {
      const section = (e as CustomEvent<EditorSection>).detail
      setTab(section === 'details' ? 'details' : 'content')
      setIntent(section === 'supersede' ? 'supersede' : 'revise')
      setError('')
      setSaved('')
      setOpen(true)
    }
    window.addEventListener('spec-editor:open', onOpen)
    return () => window.removeEventListener('spec-editor:open', onOpen)
  }, [])
  // Leaving the page with unsaved edits in the panel asks first.
  useEffect(() => {
    if (!open || !dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [open, dirty])

  if (spec.status === 'superseded') return null

  function discard() {
    setBody(spec.body); setTitle(spec.title); setSpecType(spec.specType); setArea(spec.area ?? ''); setChangeSummary('')
    setConfirmingClose(false); setError(''); setOpen(false)
  }
  function requestClose(next: boolean) {
    if (next) return setOpen(true)
    if (dirty && !pending) return setConfirmingClose(true)
    discard()
  }
  function run(fn: () => Promise<void>) { start(async () => {
    setError(''); setSaved('')
    try { await fn() } catch (e) { setError(e instanceof Error ? e.message : 'Could not save') }
  }) }
  // A new version remounts this component (it's keyed by version), which closes the panel.
  const saveContent = () => run(async () => {
    await updateSpecAction(spec.id, { body, title, expectedVersion: spec.version, changeSummary: changeSummary.trim() || undefined })
    router.refresh()
  })
  const saveDetails = () => run(async () => {
    await updateSpecAction(spec.id, { specType, area: area.trim() || null, expectedVersion: spec.version })
    setSaved('Details saved.')
    router.refresh()
  })
  const supersede = () => run(async () => { const next = await supersedeSpecAction(spec.id, body, title); router.push(`/specs/${next.id}`) })

  return <Sheet open={open} onOpenChange={requestClose}>
    <SheetContent aria-label="Edit spec" className="w-full gap-0 p-0 sm:max-w-4xl"
      onInteractOutside={(e) => { if (dirty) { e.preventDefault(); setConfirmingClose(true) } }}>
      <SheetHeader className="border-b pr-12">
        <SheetTitle>Edit spec</SheetTitle>
        <SheetDescription>
          {tab === 'details'
            ? `Type and area are saved on v${spec.version} without creating a new version.`
            : intent === 'supersede'
              ? 'Replace this spec with a new draft using the text below. Existing delivery receipts stay with this spec.'
              : `Saving creates v${spec.version + 1} and keeps v${spec.version} in the history. Reviewers who approved v${spec.version} will be asked to look again.`}
        </SheetDescription>
      </SheetHeader>
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'content' | 'details')} className="min-h-0 flex-1 gap-0">
        <div className="border-b px-4 py-2">
          <TabsList>
            <TabsTrigger value="content">Content{contentChanged && <span aria-label="unsaved" className="ml-1.5 h-1.5 w-1.5 rounded-full bg-primary" />}</TabsTrigger>
            <TabsTrigger value="details">Details{detailsChanged && <span aria-label="unsaved" className="ml-1.5 h-1.5 w-1.5 rounded-full bg-primary" />}</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="content" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          <Input aria-label="Spec title" value={title} onChange={(e) => setTitle(e.target.value)} className="h-10 text-base font-semibold" placeholder="Title" />
          <RichTextEditor value={body} onChange={setBody} size="fill" className="flex-1" autoFocus />
          <p className="text-xs text-muted-foreground">Pasted markdown is converted to formatting. Use Markdown in the toolbar to edit the source directly.</p>
        </TabsContent>
        <TabsContent value="details" className="flex-1 space-y-4 overflow-y-auto p-4">
          <label className="block space-y-1.5 text-sm font-medium">Type<Input aria-label="Spec type" value={specType} onChange={(e) => setSpecType(e.target.value)} /></label>
          <label className="block space-y-1.5 text-sm font-medium">Area<Input aria-label="Spec area" placeholder="Area (optional)" value={area} onChange={(e) => setArea(e.target.value)} /></label>
        </TabsContent>
      </Tabs>
      <div className="space-y-3 border-t bg-muted/30 p-4">
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {saved && !error && <p role="status" className="text-sm text-muted-foreground">{saved}</p>}
        {confirmingClose ? (
          <div role="alertdialog" aria-label="Discard changes" className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm">You have unsaved changes. Discard them?</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setConfirmingClose(false)}>Keep editing</Button>
              <Button size="sm" variant="destructive" onClick={discard}>Discard</Button>
            </div>
          </div>
        ) : tab === 'details' ? (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => requestClose(false)}>Close</Button>
            <Button disabled={pending || !specType.trim() || !detailsChanged} onClick={saveDetails}>Save details</Button>
          </div>
        ) : intent === 'supersede' ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="link" className="h-auto justify-start p-0 text-sm" onClick={() => setIntent('revise')}>Save as a new version instead</Button>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => requestClose(false)}>Cancel</Button>
              <Button disabled={pending || !title.trim()} onClick={supersede}>Supersede with new spec</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input aria-label="Change summary" placeholder="What changed in this version? (optional)" value={changeSummary} onChange={(e) => setChangeSummary(e.target.value)} maxLength={500} className="sm:flex-1" />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" title="Replace this spec with a new one when the approach changes" onClick={() => setIntent('supersede')}>Supersede…</Button>
              <Button disabled={pending || !title.trim() || !contentChanged} onClick={saveContent}>Save as v{spec.version + 1}</Button>
            </div>
          </div>
        )}
      </div>
    </SheetContent>
  </Sheet>
}
