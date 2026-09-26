'use client'

import { useState, useTransition } from 'react'
import { Bell, BellOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { setMutedAction } from '@/app/(dashboard)/settings/notifications/actions'

/** Personal mute for a product or asset. Required events (reviews, mentions) still arrive. */
export function MuteButton({ subjectType, subjectId, muted: initial }: { subjectType: 'product' | 'asset'; subjectId: string; muted: boolean }) {
  const [muted, setMuted] = useState(initial)
  const [error, setError] = useState('')
  const [pending, start] = useTransition()
  const noun = subjectType === 'product' ? 'product' : 'asset'
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" size="sm" disabled={pending} aria-pressed={muted}
          onClick={() => start(async () => {
            setError('')
            const r = await setMutedAction(subjectType, subjectId, !muted)
            if (r.ok) setMuted(r.muted)
            else setError(r.error)
          })}>
          {muted ? <BellOff className="mr-1.5 h-4 w-4" /> : <Bell className="mr-1.5 h-4 w-4" />}
          {muted ? 'Muted' : 'Mute'}
        </Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-[260px]">
        {error || (muted
          ? `You won't be notified about this ${noun}, except for review requests and mentions. Click to unmute.`
          : `Stop notifications about this ${noun}. Review requests and mentions still reach you.`)}
      </TooltipContent>
    </Tooltip>
  )
}
