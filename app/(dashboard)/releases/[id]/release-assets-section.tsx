'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { GitBranch, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { setReleaseAssetAction, removeReleaseAssetAction } from '../../actions'
import type { ReleaseAssetChip } from '@/lib/db/queries'
import type { PrStatus } from '@/lib/types'

const prStatusStyles: Record<PrStatus, string> = {
  none: 'bg-muted text-muted-foreground',
  draft: 'bg-muted text-muted-foreground',
  open: 'bg-chart-1/20 text-chart-1',
  merged: 'bg-accent/20 text-accent',
  closed: 'bg-destructive/20 text-destructive',
}

type PrChip = { branch?: string; prUrl?: string; prStatus: PrStatus }

export function ReleaseAssetsSection({
  releaseId,
  assets,
  suggestions,
  prChips,
  editable,
}: {
  releaseId: string
  assets: ReleaseAssetChip[]
  suggestions: ReleaseAssetChip[]
  prChips: Record<string, PrChip[]>
  editable: boolean
}) {
  const [isPending, startTransition] = useTransition()

  const addAsset = (assetId: string) =>
    startTransition(async () => {
      await setReleaseAssetAction(releaseId, assetId, new FormData())
    })

  const removeAsset = (assetId: string) =>
    startTransition(async () => {
      await removeReleaseAssetAction(releaseId, assetId)
    })

  return (
    <div className="space-y-4">
      {editable && suggestions.length > 0 && (
        <Card className="bg-card border-accent/40">
          <CardContent className="py-3 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-muted-foreground">
              {suggestions.length} asset{suggestions.length === 1 ? ' is' : 's are'} targeted by attached plans
              but not on this release:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <Button
                  key={s.assetId}
                  size="sm"
                  variant="outline"
                  onClick={() => addAsset(s.assetId)}
                  disabled={isPending}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  {s.assetName}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {assets.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No assets on this release yet. Attach plans to get suggestions, or the release can version assets
            directly.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {assets.map((asset) => (
            <AssetVersionRow
              key={asset.assetId}
              releaseId={releaseId}
              asset={asset}
              chips={prChips[asset.assetId] ?? []}
              editable={editable}
              onRemove={() => removeAsset(asset.assetId)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function AssetVersionRow({
  releaseId,
  asset,
  chips,
  editable,
  onRemove,
}: {
  releaseId: string
  asset: ReleaseAssetChip
  chips: PrChip[]
  editable: boolean
  onRemove: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      await setReleaseAssetAction(releaseId, asset.assetId, fd)
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    })
  }

  return (
    <Card className="bg-card border-border">
      <CardContent className="py-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href={`/assets/${asset.assetId}`}
              className="text-sm font-medium truncate hover:text-accent transition-colors"
            >
              {asset.assetName}
            </Link>
            <Badge variant="secondary" className="text-xs capitalize">
              {asset.assetType}
            </Badge>
            {chips.map((c, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {c.branch && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
                    <GitBranch className="h-3 w-3" />
                    {c.branch}
                  </span>
                )}
                {c.prStatus !== 'none' &&
                  (c.prUrl ? (
                    <a href={c.prUrl} target="_blank" rel="noreferrer">
                      <Badge variant="secondary" className={cn('text-xs', prStatusStyles[c.prStatus])}>
                        PR {c.prStatus}
                      </Badge>
                    </a>
                  ) : (
                    <Badge variant="secondary" className={cn('text-xs', prStatusStyles[c.prStatus])}>
                      PR {c.prStatus}
                    </Badge>
                  ))}
              </span>
            ))}
          </div>
          {editable ? (
            <form onSubmit={handleSubmit} className="flex items-center gap-2 shrink-0">
              <Input
                name="version"
                defaultValue={asset.version ?? ''}
                placeholder="v1.2.0"
                className="h-8 w-28 font-mono text-xs"
              />
              <Input
                name="notes"
                defaultValue={asset.notes ?? ''}
                placeholder="note"
                className="h-8 w-40 text-xs"
              />
              <Button type="submit" size="sm" variant="outline" disabled={isPending}>
                {saved ? 'Saved' : 'Save'}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={onRemove} disabled={isPending}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </form>
          ) : (
            <div className="flex items-center gap-2 shrink-0">
              {asset.version ? (
                <Badge variant="outline" className="text-xs font-mono text-accent">
                  {asset.version}
                </Badge>
              ) : (
                <span className="text-xs text-muted-foreground">no version</span>
              )}
              {asset.notes && <span className="text-xs text-muted-foreground">{asset.notes}</span>}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
