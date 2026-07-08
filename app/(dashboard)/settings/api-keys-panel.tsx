'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { KeyRound, Plus, Trash2, Copy } from 'lucide-react'
import { formatDateShort } from '@/lib/utils'
import { createApiKeyAction, revokeApiKeyAction } from '../actions'

export type ApiKeyRow = {
  id: string
  name: string
  keyPrefix: string
  scope: string
  revoked: boolean
  lastUsedAt: string | null
  createdAt: string
}

export function ApiKeysPanel({ keys }: { keys: ApiKeyRow[] }) {
  const [name, setName] = useState('')
  const [scope, setScope] = useState('read')
  const [minted, setMinted] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleCreate() {
    if (!name.trim()) return
    const fd = new FormData()
    fd.set('name', name.trim())
    fd.set('scope', scope)
    setName('')
    startTransition(async () => {
      const key = await createApiKeyAction(fd)
      setMinted(key.plaintext)
    })
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">API Keys</CardTitle>
        </div>
        <CardDescription>
          Connect AI agents over MCP. Point Claude Code at{' '}
          <code className="text-xs">/api/mcp/mcp</code> with{' '}
          <code className="text-xs">Authorization: Bearer &lt;key&gt;</code>. Keys act as your
          user — they see and change exactly what you can.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Key name, e.g. Claude Code – laptop"
            className="flex-1"
          />
          <Select value={scope} onValueChange={setScope}>
            <SelectTrigger className="sm:w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="read">Read-only</SelectItem>
              <SelectItem value="write">Read + write</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleCreate} disabled={!name.trim() || isPending}>
            <Plus className="mr-2 h-4 w-4" />
            Create Key
          </Button>
        </div>

        {minted && (
          <div className="rounded-md border border-warning/40 bg-warning/10 p-3 space-y-2">
            <p className="text-sm font-medium">Copy this key now — it won&apos;t be shown again.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all rounded bg-muted px-2 py-1 text-xs">{minted}</code>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 shrink-0"
                title="Copy to clipboard"
                onClick={() => navigator.clipboard.writeText(minted)}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setMinted(null)}>Done</Button>
          </div>
        )}

        {keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">No API keys yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {keys.map((key) => (
              <li key={key.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{key.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {key.keyPrefix}… · {key.lastUsedAt ? `last used ${formatDateShort(new Date(key.lastUsedAt))}` : 'never used'}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="secondary" className="text-xs">{key.scope}</Badge>
                  {key.revoked ? (
                    <Badge variant="secondary" className="text-xs bg-destructive/20 text-destructive">revoked</Badge>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      title="Revoke key"
                      disabled={isPending}
                      onClick={() => startTransition(() => revokeApiKeyAction(key.id))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
