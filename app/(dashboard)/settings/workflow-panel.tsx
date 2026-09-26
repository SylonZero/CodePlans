'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { setOrgWorkflowAction } from '../collab-actions'
import { WORKFLOW_COPY } from '../products/[slug]/workflow-card'
import type { WorkflowLevel } from '@/lib/db/schema.sqlite'

/** Org owners/admins pick the review workflow products use unless they set their own. */
export function WorkflowPanel({ organizationId, level, available }: { organizationId: string; level: WorkflowLevel; available: WorkflowLevel[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle>Review workflow</CardTitle>
        <CardDescription>The default for every product in this workspace. Products can override it on their People &amp; reviews tab.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Select value={level} disabled={pending} onValueChange={(v) => start(async () => {
          setError('')
          const r = await setOrgWorkflowAction(organizationId, v as WorkflowLevel)
          if (!r.ok) setError(r.error)
          else router.refresh()
        })}>
          <SelectTrigger className="w-[240px]" aria-label="Default review workflow"><SelectValue /></SelectTrigger>
          <SelectContent>{available.map((l) => <SelectItem key={l} value={l}>{WORKFLOW_COPY[l].label}</SelectItem>)}</SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">{WORKFLOW_COPY[level].description}</p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}
