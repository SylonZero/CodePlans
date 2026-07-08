'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
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
import { Github, Link2, Unlink, ExternalLink } from 'lucide-react'
import { listPlanScopesAction, linkPlanScopeAction, unlinkPlanScopeAction } from '../../actions'

type ConnectionOption = { id: string; name: string; provider: string }
type Scope = { id: string; title: string; state: string }

export function PlanSyncDialog({
  planId,
  source,
  externalKey,
  externalUrl,
  connections,
}: {
  planId: string
  source?: string
  externalKey?: string
  externalUrl?: string
  connections: ConnectionOption[]
}) {
  const [open, setOpen] = useState(false)
  const [connectionId, setConnectionId] = useState(connections[0]?.id ?? '')
  const [scopes, setScopes] = useState<Scope[] | null>(null)
  const [scopeId, setScopeId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const isLinked = source && source !== 'native'

  if (isLinked) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="gap-1.5">
          <Github className="h-3.5 w-3.5" />
          {externalKey ?? source}
          {externalUrl && (
            <a href={externalUrl} target="_blank" rel="noreferrer" title="Open milestone">
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </Badge>
        <Button
          variant="outline"
          size="sm"
          disabled={isPending}
          title="Unlink — mirrored tasks become native"
          onClick={() => startTransition(() => unlinkPlanScopeAction(planId))}
        >
          <Unlink className="mr-2 h-3.5 w-3.5" />
          Unlink
        </Button>
      </div>
    )
  }

  if (connections.length === 0) return null

  function loadScopes() {
    setError(null)
    setScopes(null)
    startTransition(async () => {
      const result = await listPlanScopesAction(connectionId)
      if (result.error) setError(result.error)
      else setScopes(result.scopes ?? [])
    })
  }

  function handleLink() {
    const scope = scopes?.find((s) => s.id === scopeId)
    if (!scope) return
    setError(null)
    startTransition(async () => {
      const result = await linkPlanScopeAction(planId, connectionId, scope.id, scope.title)
      if (result?.error) {
        setError(result.error)
      } else {
        setOpen(false)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setScopes(null); setScopeId(''); setError(null) } }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Github className="mr-2 h-4 w-4" />
          Link Milestone
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Link a GitHub milestone</DialogTitle>
          <DialogDescription>
            Issues in the milestone are mirrored as this plan&apos;s tasks (read-only here). Native tasks you add locally are kept alongside them.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ps-connection">Connection</Label>
            <div className="flex items-center gap-2">
              <Select value={connectionId} onValueChange={(v) => { setConnectionId(v); setScopes(null); setScopeId('') }}>
                <SelectTrigger id="ps-connection" className="flex-1">
                  <SelectValue placeholder="Select a connection" />
                </SelectTrigger>
                <SelectContent>
                  {connections.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" disabled={!connectionId || isPending} onClick={loadScopes}>
                {isPending && !scopes ? 'Loading…' : 'Load milestones'}
              </Button>
            </div>
          </div>

          {scopes && (
            <div className="space-y-2">
              <Label htmlFor="ps-scope">Milestone</Label>
              {scopes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No milestones found in this repository.</p>
              ) : (
                <Select value={scopeId} onValueChange={setScopeId}>
                  <SelectTrigger id="ps-scope">
                    <SelectValue placeholder="Select a milestone" />
                  </SelectTrigger>
                  <SelectContent>
                    {scopes.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.title} {s.state === 'closed' ? '(closed)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!scopeId || isPending} onClick={handleLink}>
            <Link2 className="mr-2 h-4 w-4" />
            {isPending && scopeId ? 'Linking…' : 'Link & Sync'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
