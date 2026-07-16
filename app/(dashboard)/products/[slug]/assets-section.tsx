'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
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
import {
  Plus,
  Pencil,
  Trash2,
  Box,
  Server,
  Library,
  Database,
  Globe,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ExternalLink,
  X,
  UserPlus,
} from 'lucide-react'
import type { Asset, AssetType } from '@/lib/types'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { OwnerAvatars } from '@/components/owner-avatars'
import { createAssetAction, updateAssetAction, deleteAssetAction, setAssetOwnersAction } from '../../actions'

const assetTypeIcons: Record<AssetType, typeof Box> = {
  app: Box,
  service: Server,
  library: Library,
  datastore: Database,
  platform: Globe,
}

const assetTypeLabels: Record<AssetType, string> = {
  app: 'Application',
  service: 'Service',
  library: 'Library',
  datastore: 'Datastore',
  platform: 'Platform',
}

const ASSET_TYPES = (Object.keys(assetTypeLabels) as AssetType[]).map((value) => ({
  value,
  label: assetTypeLabels[value],
}))

const HEALTH_OPTIONS = [
  { value: 'healthy', label: 'Healthy' },
  { value: 'warning', label: 'Warning' },
  { value: 'critical', label: 'Critical' },
] as const

const healthIcons = {
  healthy: CheckCircle2,
  warning: AlertTriangle,
  critical: XCircle,
}

const healthStyles = {
  healthy: 'text-accent',
  warning: 'text-warning',
  critical: 'text-destructive',
}

type AssetCreatePanelProps = {
  productId: string
  productSlug: string
  /** Omit to render the default Add Asset trigger button; pass open/onOpenChange to control externally. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function AssetCreatePanel({ productId, productSlug, open: controlledOpen, onOpenChange }: AssetCreatePanelProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {controlledOpen === undefined && (
        <SheetTrigger asChild>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Asset
          </Button>
        </SheetTrigger>
      )}
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Add Asset</SheetTitle>
          <SheetDescription>Add a component to this product&apos;s architecture.</SheetDescription>
        </SheetHeader>
        <AssetForm productId={productId} productSlug={productSlug} onDone={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}

export type MemberOption = { id: string; name: string }

export function AssetsSection({
  assets,
  productId,
  productSlug,
  members = [],
}: {
  assets: Asset[]
  productId: string
  productSlug: string
  members?: MemberOption[]
}) {
  const [openAsset, setOpenAsset] = useState<Asset | null>(null)

  // Keep the panel in sync with refreshed server data after an edit
  const currentAsset = openAsset ? assets.find((a) => a.id === openAsset.id) ?? null : null

  const assetsByType = assets.reduce((acc, asset) => {
    if (!acc[asset.type]) acc[asset.type] = []
    acc[asset.type].push(asset)
    return acc
  }, {} as Record<AssetType, Asset[]>)

  return (
    <>
      {(Object.keys(assetTypeIcons) as AssetType[]).map((type) => {
        const typeAssets = assetsByType[type] || []
        if (typeAssets.length === 0) return null
        return (
          <div key={type}>
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-lg font-semibold">{assetTypeLabels[type]}s</h2>
              <Badge variant="secondary">{typeAssets.length}</Badge>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {typeAssets.map((asset) => (
                <AssetCard key={asset.id} asset={asset} onOpen={setOpenAsset} />
              ))}
            </div>
          </div>
        )
      })}

      {assets.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Box className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1">No assets yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Add your first asset to start tracking your architecture
            </p>
            <AssetCreatePanel productId={productId} productSlug={productSlug} />
          </CardContent>
        </Card>
      )}

      <Sheet open={!!currentAsset} onOpenChange={(o) => { if (!o) setOpenAsset(null) }}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {currentAsset && (
            <AssetEditor key={currentAsset.id} asset={currentAsset} productSlug={productSlug} members={members} onDeleted={() => setOpenAsset(null)} />
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}

function AssetCard({ asset, onOpen }: { asset: Asset; onOpen: (asset: Asset) => void }) {
  const Icon = assetTypeIcons[asset.type]
  const HealthIcon = healthIcons[asset.health]

  return (
    <Card
      className="bg-card border-border hover:border-muted-foreground/30 transition-colors cursor-pointer"
      onClick={() => onOpen(asset)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Icon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <CardTitle className="text-base">{asset.name}</CardTitle>
              <p className="text-sm text-muted-foreground">{assetTypeLabels[asset.type]}</p>
            </div>
          </div>
          <div className={cn('flex items-center gap-1', healthStyles[asset.health])}>
            <HealthIcon className="h-4 w-4" />
            <span className="text-xs capitalize">{asset.health}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground line-clamp-2">{asset.description}</p>
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {asset.tags.slice(0, 4).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
            ))}
          </div>
          <OwnerAvatars owners={asset.owners ?? []} className="shrink-0" />
        </div>
        {(() => {
          const score = asset.techDebtScore ?? asset.derivedTechDebtScore
          if (score === undefined) return null
          const derived = asset.techDebtScore === undefined
          return (
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <span className="text-xs text-muted-foreground">
                Tech Debt Score
                {derived && asset.openDebtCount ? ` · ${asset.openDebtCount} open item${asset.openDebtCount > 1 ? 's' : ''}` : ''}
              </span>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-24 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full',
                      score < 25 ? 'bg-accent' : score < 50 ? 'bg-warning' : 'bg-destructive'
                    )}
                    style={{ width: `${Math.min(score, 100)}%` }}
                  />
                </div>
                <span className="text-xs font-medium">{score}</span>
              </div>
            </div>
          )
        })()}
      </CardContent>
    </Card>
  )
}

function AssetEditor({
  asset,
  productSlug,
  members,
  onDeleted,
}: {
  asset: Asset
  productSlug: string
  members: MemberOption[]
  onDeleted: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)
  const [type, setType] = useState<string>(asset.type)
  const [health, setHealth] = useState<string>(asset.health)
  const [addOwnerId, setAddOwnerId] = useState('')
  const lastSaved = useRef<string>('')

  const owners = asset.owners ?? []
  const ownerIds = new Set(owners.map((o) => o.id))
  const addableMembers = members.filter((m) => !ownerIds.has(m.id))

  function saveOwners(userIds: string[]) {
    startTransition(async () => {
      await setAssetOwnersAction(asset.id, productSlug, userIds)
      toast.success('Owners updated')
    })
  }

  // Baseline the dirty-check on mount: focusing/blurring without edits must not save.
  useEffect(() => {
    const form = formRef.current
    if (form) lastSaved.current = JSON.stringify([...new FormData(form).entries()])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const Icon = assetTypeIcons[asset.type]

  function commit(overrides: Record<string, string> = {}) {
    const form = formRef.current
    if (!form) return
    const fd = new FormData(form)
    fd.set('type', overrides.type ?? type)
    fd.set('health', overrides.health ?? health)
    const isSelectChange = Object.keys(overrides).length > 0
    const snapshot = JSON.stringify([...new FormData(form).entries()])
    if (!isSelectChange && snapshot === lastSaved.current) return
    lastSaved.current = snapshot
    startTransition(async () => {
      await updateAssetAction(asset.id, productSlug, fd)
      toast.success('Saved')
    })
  }

  function handleDelete() {
    startTransition(async () => {
      await deleteAssetAction(asset.id, productSlug)
      onDeleted()
    })
  }

  return (
    <>
      <SheetHeader>
        <div className="flex items-center gap-3 pr-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <SheetTitle className="text-lg">{asset.name}</SheetTitle>
            <SheetDescription>{assetTypeLabels[asset.type]}</SheetDescription>
          </div>
        </div>
      </SheetHeader>

      {/* Auto-save: selects commit on change, inputs commit on blur */}
      <form ref={formRef} onBlur={() => commit()} onSubmit={(e) => e.preventDefault()} className="space-y-4 px-4">
        <Input name="name" defaultValue={asset.name} className="font-medium" aria-label="Name" />
        <Textarea name="description" defaultValue={asset.description} rows={3} placeholder="Description" aria-label="Description" />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Type</Label>
            <Select value={type} onValueChange={(v) => { setType(v); commit({ type: v }) }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(assetTypeLabels) as AssetType[]).map((t) => (
                  <SelectItem key={t} value={t}>{assetTypeLabels[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Health</Label>
            <Select value={health} onValueChange={(v) => { setHealth(v); commit({ health: v }) }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="healthy">Healthy</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ae-debt" className="text-xs">
            Tech Debt Score (0–100; blank = derived from open debt items{asset.openDebtCount ? ` — currently ${asset.derivedTechDebtScore ?? 0} from ${asset.openDebtCount}` : ''})
          </Label>
          <Input id="ae-debt" name="techDebtScore" type="number" min="0" max="100" defaultValue={asset.techDebtScore ?? ''} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ae-tags" className="text-xs">Tags (comma-separated)</Label>
          <Input id="ae-tags" name="tags" defaultValue={asset.tags.join(', ')} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ae-repo" className="text-xs">Repository URL</Label>
            <Input id="ae-repo" name="repositoryUrl" type="url" defaultValue={asset.repositoryUrl ?? ''} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ae-path" className="text-xs">Repo Path</Label>
            <Input id="ae-path" name="repoPath" defaultValue={asset.repoPath ?? ''} placeholder="apps/web" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ae-docs" className="text-xs">Documentation URL</Label>
          <Input id="ae-docs" name="documentationUrl" type="url" defaultValue={asset.documentationUrl ?? ''} />
        </div>
        <p className="text-xs text-muted-foreground">{isPending ? 'Saving…' : 'Changes save automatically'}</p>
      </form>

      {/* Owners — routing and visibility (like code owners), not permissions */}
      <div className="px-4 space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Owners</p>
        {owners.length > 0 ? (
          <ul className="space-y-1.5">
            {owners.map((owner) => (
              <li key={owner.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2 min-w-0">
                  <OwnerAvatars owners={[owner]} max={1} />
                  <span className="truncate">{owner.name}</span>
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  title="Remove owner"
                  disabled={isPending}
                  onClick={() => saveOwners(owners.filter((o) => o.id !== owner.id).map((o) => o.id))}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No owners yet — assign someone to route work here.</p>
        )}
        {addableMembers.length > 0 && (
          <div className="flex items-center gap-2">
            <Select value={addOwnerId} onValueChange={setAddOwnerId}>
              <SelectTrigger className="h-8 flex-1 text-sm"><SelectValue placeholder="Add an owner…" /></SelectTrigger>
              <SelectContent>
                {addableMembers.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              disabled={!addOwnerId || isPending}
              onClick={() => { const id = addOwnerId; setAddOwnerId(''); saveOwners([...owners.map((o) => o.id), id]) }}
            >
              <UserPlus className="mr-1.5 h-3.5 w-3.5" />
              Add
            </Button>
          </div>
        )}
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
              <AlertDialogTitle>Delete asset?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete &ldquo;{asset.name}&rdquo;. Tasks and work items pointing at it lose their asset link. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} disabled={isPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {isPending ? 'Deleting…' : 'Delete'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetFooter>
    </>
  )
}

function AssetForm({
  asset,
  productId,
  productSlug,
  onDone,
}: {
  asset?: Asset
  productId: string
  productSlug: string
  onDone: () => void
}) {
  const isEdit = !!asset
  const [type, setType] = useState<string>(asset?.type ?? 'app')
  const [health, setHealth] = useState<string>(asset?.health ?? 'healthy')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    fd.set('type', type)
    if (isEdit) fd.set('health', health)
    startTransition(async () => {
      try {
        if (isEdit) {
          await updateAssetAction(asset.id, productSlug, fd)
        } else {
          await createAssetAction(productId, productSlug, fd)
        }
        onDone()
      } catch (err: unknown) {
        if (err instanceof Error) setError(err.message)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 px-4 pb-4">
      <div className="space-y-2">
        <Label htmlFor="ap-name">Asset Name <span className="text-destructive">*</span></Label>
        <Input id="ap-name" name="name" defaultValue={asset?.name} placeholder="e.g. Auth Service" required />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="ap-type">Type <span className="text-destructive">*</span></Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger id="ap-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASSET_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {isEdit && (
          <div className="space-y-2">
            <Label htmlFor="ap-health">Health</Label>
            <Select value={health} onValueChange={setHealth}>
              <SelectTrigger id="ap-health">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HEALTH_OPTIONS.map((h) => (
                  <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="ap-description">Description <span className="text-destructive">*</span></Label>
        <Textarea
          id="ap-description"
          name="description"
          defaultValue={asset?.description}
          placeholder="What does this asset do?"
          rows={3}
          required
        />
      </div>

      {isEdit && (
        <div className="space-y-2">
          <Label htmlFor="ap-debt">
            Tech Debt Score
            <span className="ml-1 text-xs text-muted-foreground">(0–100, optional)</span>
          </Label>
          <Input
            id="ap-debt"
            name="techDebtScore"
            type="number"
            min="0"
            max="100"
            defaultValue={asset?.techDebtScore ?? ''}
            placeholder="e.g. 35"
          />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="ap-tags">
          Tags
          <span className="ml-2 text-xs text-muted-foreground">(comma-separated)</span>
        </Label>
        <Input id="ap-tags" name="tags" defaultValue={asset?.tags.join(', ')} placeholder="node, rest, postgres" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="ap-repo">Repository URL</Label>
        <Input
          id="ap-repo"
          name="repositoryUrl"
          type="url"
          defaultValue={asset?.repositoryUrl ?? ''}
          placeholder="https://github.com/org/repo"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="ap-repo-path">
          Repo Path
          <span className="ml-1 text-xs text-muted-foreground">(monorepo folder, optional)</span>
        </Label>
        <Input
          id="ap-repo-path"
          name="repoPath"
          defaultValue={asset?.repoPath ?? ''}
          placeholder="e.g. apps/web or packages/ui"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="ap-docs">Documentation URL</Label>
        <Input
          id="ap-docs"
          name="documentationUrl"
          type="url"
          defaultValue={asset?.documentationUrl ?? ''}
          placeholder="https://docs.example.com"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Asset'}
        </Button>
      </div>
    </form>
  )
}
