'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { GitBranch, GitPullRequest, Plus, X, Pencil, ExternalLink } from 'lucide-react'
import type { PlanAsset, PrStatus } from '@/lib/types'
import { cn } from '@/lib/utils'
import { addPlanAssetAction, removePlanAssetAction, updatePlanAssetAction } from '../../actions'

const PR_STATUSES: { value: PrStatus; label: string }[] = [
  { value: 'none', label: 'No PR' },
  { value: 'draft', label: 'Draft' },
  { value: 'open', label: 'Open' },
  { value: 'merged', label: 'Merged' },
  { value: 'closed', label: 'Closed' },
]

const prStatusStyles: Record<PrStatus, string> = {
  none: 'bg-muted text-muted-foreground',
  draft: 'bg-muted text-muted-foreground',
  open: 'bg-chart-1/20 text-chart-1',
  merged: 'bg-accent/20 text-accent',
  closed: 'bg-destructive/20 text-destructive',
}

type AssetOption = { id: string; name: string }

export function PlanAssetsSection({
  planId,
  planAssets,
  assetOptions,
}: {
  planId: string
  planAssets: PlanAsset[]
  assetOptions: AssetOption[]
}) {
  const [isPending, startTransition] = useTransition()
  const [addAssetId, setAddAssetId] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  const targeted = new Set(planAssets.map((pa) => pa.assetId))
  const addable = assetOptions.filter((a) => !targeted.has(a.id))

  function handleAdd() {
    if (!addAssetId) return
    const assetId = addAssetId
    setAddAssetId('')
    startTransition(() => addPlanAssetAction(planId, assetId))
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Target Assets &amp; PRs
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {planAssets.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No target assets yet. Add the assets this plan changes — each gets its own branch and PR.
          </p>
        )}

        {planAssets.map((pa) =>
          editingId === pa.assetId ? (
            <PlanAssetEditForm
              key={pa.id}
              planId={planId}
              planAsset={pa}
              onDone={() => setEditingId(null)}
            />
          ) : (
            <div
              key={pa.id}
              className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-medium text-sm">{pa.assetName}</p>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  {pa.branch && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
                      <GitBranch className="h-3 w-3" />
                      {pa.branch}
                    </span>
                  )}
                  {pa.prUrl ? (
                    <a
                      href={pa.prUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-xs hover:text-accent transition-colors"
                    >
                      <GitPullRequest className="h-3 w-3" />
                      View PR
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <GitPullRequest className="h-3 w-3" />
                      No PR yet
                    </span>
                  )}
                  {pa.notes && <span className="text-xs text-muted-foreground truncate">{pa.notes}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="secondary" className={cn('text-xs capitalize', prStatusStyles[pa.prStatus])}>
                  {PR_STATUSES.find((s) => s.value === pa.prStatus)?.label}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  title="Edit branch/PR"
                  onClick={() => setEditingId(pa.assetId)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  title="Remove asset from plan"
                  disabled={isPending}
                  onClick={() => startTransition(() => removePlanAssetAction(planId, pa.assetId))}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ),
        )}

        {addable.length > 0 && (
          <div className="flex items-center gap-2 pt-1">
            <Select value={addAssetId} onValueChange={setAddAssetId}>
              <SelectTrigger className="h-8 flex-1 text-sm">
                <SelectValue placeholder="Add a target asset…" />
              </SelectTrigger>
              <SelectContent>
                {addable.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" disabled={!addAssetId || isPending} onClick={handleAdd}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function PlanAssetEditForm({
  planId,
  planAsset,
  onDone,
}: {
  planId: string
  planAsset: PlanAsset
  onDone: () => void
}) {
  const [prStatus, setPrStatus] = useState<string>(planAsset.prStatus)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.set('prStatus', prStatus)
    startTransition(async () => {
      await updatePlanAssetAction(planId, planAsset.assetId, fd)
      onDone()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-md border border-border p-3 space-y-3">
      <p className="font-medium text-sm">{planAsset.assetName}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`pa-branch-${planAsset.id}`} className="text-xs">Branch</Label>
          <Input
            id={`pa-branch-${planAsset.id}`}
            name="branch"
            defaultValue={planAsset.branch ?? ''}
            placeholder="feature/auth-refresh"
            className="h-8 font-mono text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`pa-status-${planAsset.id}`} className="text-xs">PR Status</Label>
          <Select value={prStatus} onValueChange={setPrStatus}>
            <SelectTrigger id={`pa-status-${planAsset.id}`} className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PR_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`pa-pr-${planAsset.id}`} className="text-xs">PR URL</Label>
        <Input
          id={`pa-pr-${planAsset.id}`}
          name="prUrl"
          type="url"
          defaultValue={planAsset.prUrl ?? ''}
          placeholder="https://github.com/org/repo/pull/123"
          className="h-8 text-xs"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`pa-notes-${planAsset.id}`} className="text-xs">Notes</Label>
        <Input
          id={`pa-notes-${planAsset.id}`}
          name="notes"
          defaultValue={planAsset.notes ?? ''}
          placeholder="e.g. blocked on schema migration"
          className="h-8 text-xs"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDone}>Cancel</Button>
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  )
}
