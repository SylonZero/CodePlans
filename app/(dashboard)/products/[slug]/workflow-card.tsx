'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { setProductWorkflowAction } from '../../collab-actions'
import type { WorkflowLevel } from '@/lib/db/schema.sqlite'

export const WORKFLOW_COPY: Record<WorkflowLevel, { label: string; description: string }> = {
  open: { label: 'Open', description: 'Anyone can request a review; nothing waits on one.' },
  guided: { label: 'Guided', description: 'Reviewers are added from responsibilities automatically, and activating unapproved work asks for confirmation.' },
  gated: { label: 'Gated', description: 'Specs and plans need approval before they become active.' },
}

export function WorkflowCard({ productId, productSlug, level, inherited, orgDefault, available, canManage }: {
  productId: string
  productSlug: string
  level: WorkflowLevel
  inherited: boolean
  orgDefault: WorkflowLevel
  available: WorkflowLevel[]
  canManage: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
  const value = inherited ? 'inherit' : level
  return (
    <Card className="bg-card border-border">
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">Review workflow: {WORKFLOW_COPY[level].label}{inherited ? ' (workspace default)' : ''}</p>
          <p className="text-sm text-muted-foreground">{WORKFLOW_COPY[level].description}</p>
        </div>
        {canManage && (
          <Select value={value} disabled={pending} onValueChange={(v) => start(async () => {
            setError('')
            const r = await setProductWorkflowAction(productId, v === 'inherit' ? null : (v as WorkflowLevel), `/products/${productSlug}`)
            if (!r.ok) setError(r.error)
            else router.refresh()
          })}>
            <SelectTrigger className="sm:w-[260px]" aria-label="Review workflow"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="inherit">Workspace default ({WORKFLOW_COPY[orgDefault].label})</SelectItem>
              {available.map((l) => <SelectItem key={l} value={l}>{WORKFLOW_COPY[l].label}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </CardContent>
      {error && <p role="alert" className="px-6 text-sm text-destructive">{error}</p>}
    </Card>
  )
}
