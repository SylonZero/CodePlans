'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ConfirmRemoveButton } from '@/components/confirm-remove-button'
import { Lock, Plus } from 'lucide-react'
import {
  grantProductAccessAction,
  revokeProductAccessGrantAction,
  setProductAccessRestrictedAction,
} from '../../actions'
import type { ProductAccessGrantRow } from '@/lib/db/product-access'

export function ProductAccessSection({
  productId,
  productSlug,
  accessRestricted,
  grants,
  candidates,
  canManage,
}: {
  productId: string
  productSlug: string
  accessRestricted: boolean
  grants: ProductAccessGrantRow[]
  candidates: { id: string; name: string }[]
  canManage: boolean
}) {
  const [restricted, setRestricted] = useState(accessRestricted)
  const [grantRows, setGrantRows] = useState(grants)
  const [pending, startTransition] = useTransition()
  const [userId, setUserId] = useState('')
  const [error, setError] = useState('')

  const grantedIds = new Set(grantRows.map((g) => g.userId))
  const addCandidates = candidates.filter((c) => !grantedIds.has(c.id))

  function toggleRestricted(checked: boolean) {
    setError('')
    startTransition(async () => {
      const res = await setProductAccessRestrictedAction(productId, productSlug, checked)
      if ('error' in res && res.error) {
        setError(res.error)
        return
      }
      setRestricted(checked)
      if (checked && 'grants' in res && res.grants) setGrantRows(res.grants)
    })
  }

  function grant() {
    if (!userId) return
    setError('')
    startTransition(async () => {
      const res = await grantProductAccessAction(productId, productSlug, userId)
      if ('error' in res && res.error) {
        setError(res.error)
        return
      }
      const person = candidates.find((c) => c.id === userId)
      if (person && 'id' in res) {
        setGrantRows((rows) => [
          ...rows,
          {
            id: res.id,
            userId,
            name: person.name,
            email: '',
            createdAt: new Date().toISOString(),
          },
        ])
      }
      setUserId('')
    })
  }

  function revoke(grantId: string) {
    setError('')
    startTransition(async () => {
      const res = await revokeProductAccessGrantAction(grantId, productSlug)
      if ('error' in res && res.error) {
        setError(res.error)
        return
      }
      setGrantRows((rows) => rows.filter((r) => r.id !== grantId))
    })
  }

  return (
    <Card className="bg-card border-border">
      <CardContent className="space-y-4">
        <div className="flex items-start gap-3">
          <Lock className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
          <div className="flex-1 space-y-1">
            <h3 className="font-semibold">Product access</h3>
            <p className="text-sm text-muted-foreground max-w-3xl">
              Workspace roles still control what someone can change. This list controls whether they can see this product at all
              (including in MCP tools). Org owners and admins always have access.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Switch
            id="product-access-restricted"
            checked={restricted}
            disabled={!canManage || pending}
            onCheckedChange={toggleRestricted}
          />
          <Label htmlFor="product-access-restricted" className="text-sm font-normal cursor-pointer">
            Limit visibility to selected members
          </Label>
        </div>

        {!restricted && (
          <p className="text-sm text-muted-foreground">Every joined workspace member can see this product.</p>
        )}

        {restricted && (
          <div className="space-y-3 pt-2 border-t border-border">
            {canManage && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Select value={userId} onValueChange={setUserId}>
                  <SelectTrigger className="sm:w-[240px]" aria-label="Member to grant">
                    <SelectValue placeholder="Add member…" />
                  </SelectTrigger>
                  <SelectContent>
                    {addCandidates.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" onClick={grant} disabled={!userId || pending}>
                  <Plus className="mr-2 h-4 w-4" />
                  Grant access
                </Button>
              </div>
            )}
            {grantRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No members granted yet — only owners, admins, and the creator can see this product.</p>
            ) : (
              <ul className="space-y-2">
                {grantRows.map((g) => (
                  <li key={g.id} className="flex items-center gap-2 text-sm">
                    <span className="font-medium">{g.name}</span>
                    {canManage && (
                      <ConfirmRemoveButton
                        className="h-6 w-6 ml-auto"
                        label={`Revoke access for ${g.name}`}
                        title={`Revoke access for ${g.name}?`}
                        description={`${g.name} will lose visibility to this product (MCP keys included) unless they are an org owner or admin.`}
                        disabled={pending}
                        onConfirm={() => revoke(g.id)}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
