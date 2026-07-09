'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Pencil, Trash2, ArrowUpRight, Link2, Unlink, ExternalLink, FileText } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import type { WorkItemStatus } from '@/lib/types'
import type { WorkItemWithContext } from '@/lib/db/queries'
import { cn } from '@/lib/utils'
import {
  createWorkItemAction,
  updateWorkItemAction,
  deleteWorkItemAction,
  linkWorkItemToPlanAction,
  unlinkWorkItemFromPlanAction,
} from '../actions'

export type PlanOption = { id: string; title: string }
export type ProductOption = { id: string; name: string }
export type AssetOption = { id: string; name: string; productId: string }

export const TYPES = [
  { value: 'feature', label: 'Feature' },
  { value: 'bug', label: 'Bug' },
  { value: 'enhancement', label: 'Enhancement' },
  { value: 'ux', label: 'UX' },
  { value: 'tech_debt', label: 'Tech Debt' },
] as const

export const STATUSES = [
  { value: 'open', label: 'Open' },
  { value: 'planned', label: 'Planned' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'wont_do', label: "Won't Do" },
] as const

export const SEVERITIES = [
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
] as const

export const typeStyles: Record<string, string> = {
  feature: 'bg-chart-4/20 text-chart-4',
  bug: 'bg-destructive/20 text-destructive',
  enhancement: 'bg-chart-1/20 text-chart-1',
  ux: 'bg-chart-2/20 text-chart-2',
  tech_debt: 'bg-warning/20 text-warning',
}

export const severityStyles: Record<string, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-chart-2/20 text-chart-2',
  high: 'bg-warning/20 text-warning',
  critical: 'bg-destructive/20 text-destructive',
}

export const statusStyles: Record<WorkItemStatus, string> = {
  open: 'bg-muted text-muted-foreground',
  planned: 'bg-chart-4/20 text-chart-4',
  in_progress: 'bg-chart-1/20 text-chart-1',
  resolved: 'bg-accent/20 text-accent',
  wont_do: 'bg-muted text-muted-foreground line-through',
}

export function typeLabel(value: string) {
  return TYPES.find((t) => t.value === value)?.label ?? value
}

export function statusLabel(value: string) {
  return STATUSES.find((s) => s.value === value)?.label ?? value
}

type WorkItemPanelProps = {
  open: boolean
  mode: 'create' | 'view'
  item: WorkItemWithContext | null
  plans: PlanOption[]
  products: ProductOption[]
  assets: AssetOption[]
  scopedProductId?: string | null
  onClose: () => void
}

export function WorkItemPanel({
  open,
  mode,
  item,
  plans,
  products,
  assets,
  scopedProductId,
  onClose,
}: WorkItemPanelProps) {
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    setEditing(false)
  }, [item?.id, open])

  const showForm = mode === 'create' || editing

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {mode === 'create' ? (
          <>
            <SheetHeader>
              <SheetTitle>New Work Item</SheetTitle>
              <SheetDescription>Capture a feature, bug, UX issue, or tech-debt item.</SheetDescription>
            </SheetHeader>
            <WorkItemForm
              products={products}
              assets={assets}
              scopedProductId={scopedProductId}
              onDone={onClose}
            />
          </>
        ) : item ? (
          showForm ? (
            <>
              <SheetHeader>
                <SheetTitle>Edit Work Item</SheetTitle>
                <SheetDescription>Update the work item details.</SheetDescription>
              </SheetHeader>
              <WorkItemForm
                item={item}
                products={products}
                assets={assets}
                onDone={() => setEditing(false)}
              />
            </>
          ) : (
            <WorkItemDetails
              item={item}
              plans={plans}
              onEdit={() => setEditing(true)}
              onDeleted={onClose}
            />
          )
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

function WorkItemDetails({
  item,
  plans,
  onEdit,
  onDeleted,
}: {
  item: WorkItemWithContext
  plans: PlanOption[]
  onEdit: () => void
  onDeleted: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [linkPlanId, setLinkPlanId] = useState('')

  const isMirrored = item.source !== 'native'
  const linkedIds = new Set(item.linkedPlans.map((p) => p.id))
  const linkablePlans = plans.filter((p) => !linkedIds.has(p.id))

  function handleDelete() {
    startTransition(async () => {
      await deleteWorkItemAction(item.id)
      onDeleted()
    })
  }

  function handleLink() {
    if (!linkPlanId) return
    const planId = linkPlanId
    setLinkPlanId('')
    startTransition(() => linkWorkItemToPlanAction(item.id, planId))
  }

  return (
    <>
      <SheetHeader>
        <div className="flex items-center gap-2 pr-8 flex-wrap">
          <Badge variant="secondary" className={cn('text-xs', typeStyles[item.type])}>
            {typeLabel(item.type)}
          </Badge>
          <Badge variant="secondary" className={cn('text-xs', statusStyles[item.status])}>
            {statusLabel(item.status)}
          </Badge>
          <Badge variant="secondary" className={cn('text-xs capitalize', severityStyles[item.severity])}>
            {item.severity}
          </Badge>
          {isMirrored && (
            <Badge variant="outline" className="text-xs capitalize">
              {item.source}
              {item.externalKey ? ` · ${item.externalKey}` : ''}
            </Badge>
          )}
        </div>
        <SheetTitle className="text-lg">{item.title}</SheetTitle>
        <SheetDescription asChild>
          <span className="flex items-center gap-2">
            <Link
              href={`/products/${item.productSlug}`}
              className="flex items-center gap-1 hover:text-accent transition-colors w-fit"
            >
              {item.productName}
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
            {item.externalUrl && (
              <a
                href={item.externalUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 hover:text-accent transition-colors w-fit"
              >
                View in {item.source}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </span>
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-5 px-4">
        {item.description && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1.5">Description</p>
            <p className="text-sm whitespace-pre-wrap">{item.description}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1.5">Asset</p>
            <span className="text-sm">{item.assetName ?? <span className="text-muted-foreground">None</span>}</span>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1.5">Area</p>
            <span className="text-sm">{item.area ?? <span className="text-muted-foreground">—</span>}</span>
          </div>
        </div>

        {item.specUrl && <SpecSection specUrl={item.specUrl} />}

        {item.tags.length > 0 && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1.5">Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {item.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
              ))}
            </div>
          </div>
        )}

        {/* Linked code plans */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1.5">Code Plans</p>
          {item.linkedPlans.length > 0 ? (
            <ul className="space-y-1.5 mb-3">
              {item.linkedPlans.map((plan) => (
                <li key={plan.id} className="flex items-center justify-between gap-2 text-sm">
                  <Link
                    href={`/plans/${plan.id}`}
                    className="flex items-center gap-1 hover:text-accent transition-colors truncate"
                  >
                    {plan.title}
                    <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
                  </Link>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge variant="secondary" className="text-xs">{plan.status}</Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      title="Unlink from plan"
                      disabled={isPending}
                      onClick={() => startTransition(() => unlinkWorkItemFromPlanAction(item.id, plan.id))}
                    >
                      <Unlink className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground mb-3">Not linked to any plan yet.</p>
          )}
          {linkablePlans.length > 0 && (
            <div className="flex items-center gap-2">
              <Select value={linkPlanId} onValueChange={setLinkPlanId}>
                <SelectTrigger className="h-8 flex-1 text-sm">
                  <SelectValue placeholder="Link to a plan…" />
                </SelectTrigger>
                <SelectContent>
                  {linkablePlans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" disabled={!linkPlanId || isPending} onClick={handleLink}>
                <Link2 className="mr-1.5 h-3.5 w-3.5" />
                Link
              </Button>
            </div>
          )}
        </div>
      </div>

      <SheetFooter className="flex-row justify-end gap-2">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete work item?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete &ldquo;{item.title}&rdquo; and its plan links. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isPending ? 'Deleting…' : 'Delete'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {!isMirrored && (
          <Button size="sm" onClick={onEdit}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Button>
        )}
      </SheetFooter>
    </>
  )
}

function SpecSection({ specUrl }: { specUrl: string }) {
  const [markdown, setMarkdown] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    setLoaded(false)
    setMarkdown(null)
    fetch(`/api/spec?url=${encodeURIComponent(specUrl)}`)
      .then((r) => r.json())
      .then((d) => { if (alive) { setMarkdown(d.markdown ?? null); setLoaded(true) } })
      .catch(() => { if (alive) setLoaded(true) })
    return () => { alive = false }
  }, [specUrl])

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
        <FileText className="h-3.5 w-3.5" />
        Design Spec
        <a
          href={specUrl}
          target="_blank"
          rel="noreferrer"
          className="ml-auto flex items-center gap-1 font-normal normal-case tracking-normal hover:text-accent transition-colors"
        >
          Open source file
          <ExternalLink className="h-3 w-3" />
        </a>
      </p>
      {markdown ? (
        <div className="prose prose-sm prose-invert max-w-none max-h-64 overflow-y-auto rounded-md border border-border p-3 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_pre]:bg-muted [&_pre]:p-2 [&_pre]:rounded [&_code]:text-xs [&_table]:text-xs">
          <ReactMarkdown>{markdown}</ReactMarkdown>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {loaded
            ? 'Not renderable here — open the source file. (Private repos render when a connection covers them.)'
            : 'Loading spec…'}
        </p>
      )}
    </div>
  )
}

function WorkItemForm({
  item,
  products,
  assets,
  scopedProductId,
  onDone,
}: {
  item?: WorkItemWithContext
  products: ProductOption[]
  assets: AssetOption[]
  scopedProductId?: string | null
  onDone: () => void
}) {
  const isEdit = !!item
  const [productId, setProductId] = useState(item?.productId ?? scopedProductId ?? products[0]?.id ?? '')
  const [type, setType] = useState<string>(item?.type ?? 'feature')
  const [status, setStatus] = useState<string>(item?.status ?? 'open')
  const [severity, setSeverity] = useState<string>(item?.severity ?? 'medium')
  const [assetId, setAssetId] = useState<string>(item?.assetId ?? 'none')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const productAssets = assets.filter((a) => a.productId === productId)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!isEdit && !productId) { setError('Please select a product.'); return }
    setError(null)
    const fd = new FormData(e.currentTarget)
    fd.set('type', type)
    fd.set('severity', severity)
    fd.set('assetId', assetId === 'none' ? '' : assetId)
    if (isEdit) fd.set('status', status)
    else fd.set('productId', productId)
    startTransition(async () => {
      try {
        if (isEdit) {
          await updateWorkItemAction(item.id, fd)
        } else {
          await createWorkItemAction(fd)
        }
        onDone()
      } catch (err: unknown) {
        if (err instanceof Error) setError(err.message)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 px-4 pb-4">
      {!isEdit && (
        <div className="space-y-2">
          <Label htmlFor="wi-product">Product <span className="text-destructive">*</span></Label>
          <Select value={productId} onValueChange={(v) => { setProductId(v); setAssetId('none') }}>
            <SelectTrigger id="wi-product">
              <SelectValue placeholder="Select a product" />
            </SelectTrigger>
            <SelectContent>
              {products.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="wi-title">Title <span className="text-destructive">*</span></Label>
        <Input id="wi-title" name="title" defaultValue={item?.title} placeholder="e.g. Export plans to CSV" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="wi-description">Description</Label>
        <Textarea
          id="wi-description"
          name="description"
          defaultValue={item?.description}
          placeholder="What is being asked for, or what is wrong?"
          rows={3}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="wi-type">Type</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger id="wi-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="wi-severity">Severity</Label>
          <Select value={severity} onValueChange={setSeverity}>
            <SelectTrigger id="wi-severity">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEVERITIES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {isEdit && (
          <div className="space-y-2">
            <Label htmlFor="wi-status">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="wi-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="wi-asset">Asset</Label>
          <Select value={assetId} onValueChange={setAssetId}>
            <SelectTrigger id="wi-asset">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {productAssets.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="wi-area">
          Area
          <span className="ml-1 text-xs text-muted-foreground">(module, path, or domain within the asset)</span>
        </Label>
        <Input id="wi-area" name="area" defaultValue={item?.area} placeholder="e.g. billing/invoices" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="wi-spec">
          Spec URL
          <span className="ml-1 text-xs text-muted-foreground">(optional)</span>
        </Label>
        <Input id="wi-spec" name="specUrl" type="url" defaultValue={item?.specUrl} placeholder="https://github.com/org/repo/blob/main/docs/specs/item.md" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="wi-tags">
          Tags
          <span className="ml-2 text-xs text-muted-foreground">(comma-separated)</span>
        </Label>
        <Input id="wi-tags" name="tags" defaultValue={item?.tags.join(', ')} placeholder="auth, backend" />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Item'}
        </Button>
      </div>
    </form>
  )
}
