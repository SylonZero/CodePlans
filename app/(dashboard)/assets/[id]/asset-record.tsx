'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { BadgeCheck, GraduationCap, ChevronDown, ChevronUp, Pencil, Archive } from 'lucide-react'
import { cn, formatDateShort } from '@/lib/utils'
import { graduateWorkItemAction, updateCapabilityAction, removeCapabilityAction } from '../../actions'
import type { AssetRecord, AssetCapability } from '@/lib/db/queries'
import type { WorkItemSeverity } from '@/lib/types'

const severityStyles: Record<WorkItemSeverity, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-chart-2/20 text-chart-2',
  high: 'bg-warning/20 text-warning',
  critical: 'bg-destructive/20 text-destructive',
}

export function AssetRecordSection({
  assetId,
  record,
  canEdit,
}: {
  assetId: string
  record: AssetRecord
  canEdit: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const active = record.capabilities.filter((c) => c.status === 'active')
  const removed = record.capabilities.filter((c) => c.status === 'removed')

  const graduate = (workItemId: string) =>
    startTransition(async () => {
      await graduateWorkItemAction(workItemId, assetId)
      router.refresh()
    })

  return (
    <div className="space-y-4">
      {canEdit && record.candidates.length > 0 && (
        <Card className="bg-card border-accent/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              {record.candidates.length} resolved feature{record.candidates.length === 1 ? '' : 's'} can join
              this asset&apos;s record
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {record.candidates.map((c) => (
                <li key={c.workItemId} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <Link
                      href={`/work-items?item=${c.workItemId}`}
                      className="text-sm font-medium truncate block hover:text-accent transition-colors"
                    >
                      {c.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">resolved {formatDateShort(c.resolvedAt)}</p>
                  </div>
                  <Button size="sm" variant="outline" disabled={isPending} onClick={() => graduate(c.workItemId)}>
                    <GraduationCap className="mr-1.5 h-3.5 w-3.5" />
                    Add to record
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Capabilities */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Capabilities ({active.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {active.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Nothing recorded yet. Capabilities enter the record when resolved feature work items graduate —
              the record captures delivered reality, never plans.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {active.map((cap) => (
                <CapabilityRow key={cap.id} capability={cap} assetId={assetId} canEdit={canEdit} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Known issues (derived) */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Known issues ({record.knownIssues.length}) <span className="font-normal">— open bugs &amp; UX items</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {record.knownIssues.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">No open bugs or UX issues on this asset.</p>
          ) : (
            <ul className="divide-y divide-border">
              {record.knownIssues.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-2">
                  <Link
                    href={`/work-items?item=${item.id}`}
                    className="text-sm truncate hover:text-accent transition-colors"
                  >
                    {item.title}
                  </Link>
                  <Badge variant="secondary" className={cn('text-xs capitalize shrink-0', severityStyles[item.severity])}>
                    {item.severity}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Debt register (derived) */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Debt register ({record.debt.length}) <span className="font-normal">— open tech debt</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {record.debt.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">No open tech debt on this asset.</p>
          ) : (
            <ul className="divide-y divide-border">
              {record.debt.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-2">
                  <Link
                    href={`/work-items?item=${item.id}`}
                    className="text-sm truncate hover:text-accent transition-colors"
                  >
                    {item.title}
                  </Link>
                  <Badge variant="secondary" className={cn('text-xs capitalize shrink-0', severityStyles[item.severity])}>
                    {item.severity}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {removed.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Previously ({removed.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {removed.map((cap) => (
                <li key={cap.id} className="py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-muted-foreground line-through truncate">{cap.title}</span>
                    {cap.removedAt && (
                      <span className="text-xs text-muted-foreground shrink-0">
                        removed {formatDateShort(cap.removedAt)}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function CapabilityRow({
  capability,
  assetId,
  canEdit,
}: {
  capability: AssetCapability
  assetId: string
  canEdit: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [reason, setReason] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      await updateCapabilityAction(capability.id, assetId, fd)
      setEditing(false)
      router.refresh()
    })
  }

  const confirmRemove = () =>
    startTransition(async () => {
      await removeCapabilityAction(capability.id, assetId, reason)
      setRemoving(false)
      router.refresh()
    })

  return (
    <li className="py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <BadgeCheck className="h-4 w-4 shrink-0 text-accent" />
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-sm font-medium truncate hover:text-accent transition-colors text-left"
          >
            {capability.title}
          </button>
          {capability.area && <span className="text-xs text-muted-foreground">{capability.area}</span>}
          {capability.originSummary && (
            <Badge variant="outline" className="text-xs max-w-72 truncate" title={capability.originSummary}>
              {capability.originSummary}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={cn('h-2 w-2 rounded-full', capability.verifiedAt ? 'bg-accent' : 'bg-muted-foreground/40')}
            title={capability.verifiedAt ? `verified ${formatDateShort(capability.verifiedAt)}` : 'not yet verified against code'}
          />
          {canEdit && (
            <>
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRemoving(true)}>
                <Archive className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-muted-foreground hover:text-foreground"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
      {expanded && capability.description && (
        <div className="mt-2 rounded-md border border-border bg-muted/30 px-3 py-2 prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{capability.description}</ReactMarkdown>
        </div>
      )}

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit capability</DialogTitle>
            <DialogDescription>Refine the claim — edits never detach its delivery lineage.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor={`cap-title-${capability.id}`}>Title</Label>
              <Input id={`cap-title-${capability.id}`} name="title" defaultValue={capability.title} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`cap-area-${capability.id}`}>Area</Label>
              <Input id={`cap-area-${capability.id}`} name="area" defaultValue={capability.area ?? ''} placeholder="module, path, domain" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`cap-desc-${capability.id}`}>Description (markdown)</Label>
              <Textarea id={`cap-desc-${capability.id}`} name="description" defaultValue={capability.description} rows={5} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
              <Button type="submit" disabled={isPending}>{isPending ? 'Saving…' : 'Save'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={removing} onOpenChange={setRemoving}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove from the record?</DialogTitle>
            <DialogDescription>
              The capability becomes a tombstone under &quot;Previously&quot; — &quot;used to do X&quot; is
              record too. Add a one-line reason for the trail.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Replaced by the new export pipeline"
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRemoving(false)}>Cancel</Button>
            <Button onClick={confirmRemove} disabled={isPending}>
              <Archive className="mr-1.5 h-3.5 w-3.5" />
              {isPending ? 'Removing…' : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  )
}
