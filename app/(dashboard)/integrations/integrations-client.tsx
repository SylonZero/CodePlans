'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
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
import { Github, Gitlab, Plus, RefreshCw, Trash2, AlertCircle, Plug } from 'lucide-react'
import type { IntegrationSummary } from '@/lib/db/queries'
import { cn, formatDateShort } from '@/lib/utils'
import { createIntegrationAction, deleteIntegrationAction, syncIntegrationAction } from '../actions'

type ProductOption = { id: string; name: string }

const statusStyles: Record<string, string> = {
  active: 'bg-accent/20 text-accent',
  paused: 'bg-muted text-muted-foreground',
  error: 'bg-destructive/20 text-destructive',
}

const PROVIDERS = [
  {
    value: 'github',
    label: 'GitHub Issues',
    icon: Github,
    repoLabel: 'Repository',
    repoPlaceholder: 'owner/repo',
    tokenHint: 'GitHub token with repo read access',
    hasBaseUrl: false,
  },
  {
    value: 'gitlab',
    label: 'GitLab Issues',
    icon: Gitlab,
    repoLabel: 'Project path',
    repoPlaceholder: 'group/project',
    tokenHint: 'GitLab token with read_api scope',
    hasBaseUrl: true,
  },
] as const

function providerMeta(provider: string) {
  return PROVIDERS.find((p) => p.value === provider) ?? PROVIDERS[0]
}

export function IntegrationsClient({
  connections,
  products,
  hasOrg,
}: {
  connections: IntegrationSummary[]
  products: ProductOption[]
  hasOrg: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [syncMessage, setSyncMessage] = useState<string | null>(null)

  function handleSync(id: string, name: string) {
    setSyncMessage(null)
    startTransition(async () => {
      const result = await syncIntegrationAction(id)
      if (result.error) {
        setSyncMessage(`${name}: ${result.error}`)
      } else {
        setSyncMessage(
          `${name}: ${result.created} created, ${result.updated} updated, ${result.unchanged} unchanged.`,
        )
      }
    })
  }

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Integrations</h1>
          <p className="text-muted-foreground">
            Mirror work items from external trackers. Mirrored fields stay read-only here — the tracker remains the source of truth.
          </p>
        </div>
        {hasOrg && <NewConnectionDialog products={products} />}
      </div>

      {syncMessage && (
        <Card className="bg-card border-border mb-6">
          <CardContent className="py-3 text-sm">{syncMessage}</CardContent>
        </Card>
      )}

      {!hasOrg ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Plug className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1">No workspace</h3>
            <p className="text-sm text-muted-foreground">Join a workspace to configure integrations</p>
          </CardContent>
        </Card>
      ) : connections.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Plug className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1">No connections yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Connect a GitHub or GitLab repository to mirror its issues as work items
            </p>
            <NewConnectionDialog
              products={products}
              trigger={
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  New Connection
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {connections.map((conn) => (
            <Card key={conn.id} className="bg-card border-border">
              <CardContent className="pt-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted shrink-0">
                      {(() => { const Icon = providerMeta(conn.provider).icon; return <Icon className="h-5 w-5" /> })()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium">{conn.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {String(conn.config.repo ?? '')} · {conn.mirroredCount} mirrored item{conn.mirroredCount === 1 ? '' : 's'}
                        {conn.lastSyncAt
                          ? ` · last sync ${formatDateShort(new Date(conn.lastSyncAt))}`
                          : ' · never synced — serving as docs credential for this repo'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="secondary" className={cn('text-xs capitalize', statusStyles[conn.status])}>
                      {conn.status}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      onClick={() => handleSync(conn.id, conn.name)}
                    >
                      <RefreshCw className={cn('mr-2 h-3.5 w-3.5', isPending && 'animate-spin')} />
                      Sync now
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove connection?</AlertDialogTitle>
                          <AlertDialogDescription>
                            &ldquo;{conn.name}&rdquo; will be removed. Mirrored work items are kept but stop syncing.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => startTransition(() => deleteIntegrationAction(conn.id))}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Remove
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
                {conn.lastError && (
                  <div className="mt-3 flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span className="break-all">{conn.lastError}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}

function NewConnectionDialog({
  products,
  trigger,
}: {
  products: ProductOption[]
  trigger?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [provider, setProvider] = useState<string>('github')
  const [productId, setProductId] = useState(products[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const meta = providerMeta(provider)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    fd.set('provider', provider)
    fd.set('productId', productId)
    startTransition(async () => {
      const result = await createIntegrationAction(fd)
      if (result?.error) {
        setError(result.error)
      } else {
        setOpen(false)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Connection
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect an issue tracker</DialogTitle>
          <DialogDescription>
            Issues from one repository/project are mirrored as work items under a product. Pull-only: nothing is written back — and nothing syncs until you press &ldquo;Sync now&rdquo;. Connections also serve as the credential for rendering linked spec markdown from this repo.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ic-provider">Provider</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger id="ic-provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ic-name">Connection name <span className="text-destructive">*</span></Label>
            <Input id="ic-name" name="name" placeholder="e.g. Web App issues" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ic-repo">{meta.repoLabel} <span className="text-destructive">*</span></Label>
            <Input id="ic-repo" name="repo" placeholder={meta.repoPlaceholder} required />
          </div>
          {meta.hasBaseUrl && (
            <div className="space-y-2">
              <Label htmlFor="ic-baseurl">
                Instance URL
                <span className="ml-1 text-xs text-muted-foreground">(self-hosted only, optional)</span>
              </Label>
              <Input id="ic-baseurl" name="baseUrl" type="url" placeholder="https://gitlab.example.com" />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="ic-product">Target product <span className="text-destructive">*</span></Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger id="ic-product">
                <SelectValue placeholder="Select a product" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ic-authref">
              Token env var <span className="text-destructive">*</span>
            </Label>
            <Input id="ic-authref" name="authRef" placeholder="e.g. GITHUB_SYNC_TOKEN" required />
            <p className="text-xs text-muted-foreground">
              Name of an environment variable on the server holding a {meta.tokenHint}. The token itself is never stored in the database.
            </p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending || !productId}>
              {isPending ? 'Connecting…' : 'Connect'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
