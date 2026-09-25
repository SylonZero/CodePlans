'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Users } from 'lucide-react'
import { ConfirmRemoveButton } from '@/components/confirm-remove-button'
import { addProductMemberAction, removeProductMemberAction } from '../../actions'
import type { ProductMemberRow, CodeOwnerRow } from '@/lib/db/responsibilities'

const GROUPS = [
  { value: 'eng_manager', label: 'Engineering managers', singular: 'Engineering manager', hint: 'Triage demand, agree coordinated changes, declare releases.' },
  { value: 'architect', label: 'Architects', singular: 'Architect', hint: 'Review specs in their area. Leave the area blank to cover the whole product.' },
  { value: 'contributor', label: 'Contributors', singular: 'Contributor', hint: 'Follow this product\'s changes in My Work.' },
] as const

const groupStyles: Record<string, string> = {
  eng_manager: 'bg-chart-2/20 text-chart-2',
  architect: 'bg-chart-4/20 text-chart-4',
  contributor: 'bg-muted text-muted-foreground',
}

export function PeopleSection({
  productId,
  productSlug,
  members,
  codeOwners,
  candidates,
  canManage,
}: {
  productId: string
  productSlug: string
  members: ProductMemberRow[]
  codeOwners: CodeOwnerRow[]
  candidates: { id: string; name: string }[]
  canManage: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [userId, setUserId] = useState('')
  const [responsibility, setResponsibility] = useState<string>('eng_manager')
  const [area, setArea] = useState('')
  const [error, setError] = useState('')

  function add() {
    const fd = new FormData()
    fd.set('userId', userId)
    fd.set('responsibility', responsibility)
    fd.set('area', area)
    setError('')
    startTransition(async () => {
      const res = await addProductMemberAction(productId, productSlug, fd)
      if (res.error) setError(res.error)
      else { setUserId(''); setArea('') }
    })
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await removeProductMemberAction(id, productSlug)
      if (res.error) setError(res.error)
    })
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground max-w-3xl">
        Responsibilities decide who is asked to review, who is notified and what shows up in My Work.
        They don&apos;t change permissions: those come from each person&apos;s workspace role.
      </p>

      {canManage && (
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <p className="text-sm font-medium mb-3">Assign a responsibility</p>
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger className="lg:w-[220px]" aria-label="Person">
                  <SelectValue placeholder="Person" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={responsibility} onValueChange={setResponsibility}>
                <SelectTrigger className="lg:w-[220px]" aria-label="Responsibility">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GROUPS.map((g) => <SelectItem key={g.value} value={g.value}>{g.singular}</SelectItem>)}
                </SelectContent>
              </Select>
              {responsibility === 'architect' && (
                <Input
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  placeholder="Area, e.g. schema (optional)"
                  aria-label="Area"
                  className="lg:w-[240px]"
                />
              )}
              <Button onClick={add} disabled={!userId || pending}>
                <Plus className="mr-2 h-4 w-4" />
                Assign
              </Button>
            </div>
            {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      )}
      {!canManage && error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-4 md:grid-cols-2">
        {GROUPS.map((g) => {
          const rows = members.filter((m) => m.responsibility === g.value)
          return (
            <Card key={g.value} className="bg-card border-border">
              <CardContent className="pt-6">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-semibold">{g.label}</h3>
                  <span className="text-xs text-muted-foreground">{rows.length}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 mb-3">{g.hint}</p>
                {rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nobody assigned.</p>
                ) : (
                  <ul className="space-y-2">
                    {rows.map((m) => (
                      <li key={m.id} className="flex items-center gap-2 text-sm">
                        <span className="font-medium">{m.name}</span>
                        {m.area && <Badge variant="secondary" className={groupStyles[g.value]}>{m.area}</Badge>}
                        {!m.area && g.value === 'architect' && <span className="text-xs text-muted-foreground">whole product</span>}
                        {canManage && (
                          <ConfirmRemoveButton
                            className="h-6 w-6 ml-auto"
                            label={`Remove ${m.name} as ${g.singular.toLowerCase()}`}
                            title={`Remove ${m.name}?`}
                            description={`${m.name} will no longer be ${g.singular.toLowerCase()} on this product.`}
                            disabled={pending}
                            onConfirm={() => remove(m.id)}
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )
        })}

        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="font-semibold">Code owners</h3>
              <span className="text-xs text-muted-foreground">{codeOwners.length}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 mb-3">Set on each asset. Review changes that touch their assets.</p>
            {codeOwners.length === 0 ? (
              <p className="text-sm text-muted-foreground">No asset has an owner yet.</p>
            ) : (
              <ul className="space-y-2">
                {codeOwners.map((o) => (
                  <li key={o.userId} className="text-sm">
                    <span className="font-medium">{o.name}</span>
                    <span className="text-muted-foreground"> · </span>
                    {o.assets.map((a, i) => (
                      <span key={a.id}>
                        {i > 0 && <span className="text-muted-foreground">, </span>}
                        <Link href={`/assets/${a.id}`} className="text-muted-foreground hover:text-foreground hover:underline">{a.name}</Link>
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {members.length === 0 && codeOwners.length === 0 && !canManage && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-10">
            <Users className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No responsibilities assigned on this product yet.</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
