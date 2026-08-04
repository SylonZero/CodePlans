'use client'

import { useTransition } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Rocket } from 'lucide-react'
import { setPlanReleaseAction } from '../../actions'

type ReleaseOption = { id: string; name: string }

/** "Ships in" picker on plan detail — a plan belongs to at most one release. */
export function PlanReleasePicker({
  planId,
  releaseId,
  releases,
}: {
  planId: string
  releaseId?: string
  releases: ReleaseOption[]
}) {
  const [isPending, startTransition] = useTransition()

  if (releases.length === 0 && !releaseId) return null

  return (
    <div className="flex items-center gap-1.5">
      <Rocket className="h-4 w-4" />
      <Select
        value={releaseId ?? 'none'}
        disabled={isPending}
        onValueChange={(v) =>
          startTransition(async () => {
            await setPlanReleaseAction(planId, v === 'none' ? null : v)
          })
        }
      >
        <SelectTrigger className="h-7 w-44 border-none bg-transparent px-1 text-sm shadow-none">
          <SelectValue placeholder="No release" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No release</SelectItem>
          {releases.map((r) => (
            <SelectItem key={r.id} value={r.id}>
              {r.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
