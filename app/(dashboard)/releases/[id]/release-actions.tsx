'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Rocket, Play, Undo2, XCircle } from 'lucide-react'
import { setReleaseStatusAction } from '../../actions'
import type { ReleaseStatus } from '@/lib/types'

export function ReleaseActions({
  releaseId,
  status,
  unversionedAssets,
}: {
  releaseId: string
  status: ReleaseStatus
  unversionedAssets: string[]
}) {
  const [confirmShip, setConfirmShip] = useState(false)
  const [isPending, startTransition] = useTransition()

  const setStatus = (next: ReleaseStatus) =>
    startTransition(async () => {
      await setReleaseStatusAction(releaseId, next)
      setConfirmShip(false)
    })

  return (
    <div className="flex items-center gap-2">
      {status === 'planned' && (
        <Button size="sm" onClick={() => setStatus('in_progress')} disabled={isPending}>
          <Play className="mr-1.5 h-3.5 w-3.5" />
          Start
        </Button>
      )}
      {(status === 'planned' || status === 'in_progress') && (
        <>
          <Button size="sm" onClick={() => setConfirmShip(true)} disabled={isPending}>
            <Rocket className="mr-1.5 h-3.5 w-3.5" />
            Mark Shipped
          </Button>
          <Button size="sm" variant="outline" onClick={() => setStatus('abandoned')} disabled={isPending}>
            <XCircle className="mr-1.5 h-3.5 w-3.5" />
            Abandon
          </Button>
        </>
      )}
      {(status === 'shipped' || status === 'abandoned') && (
        <Button size="sm" variant="outline" onClick={() => setStatus('in_progress')} disabled={isPending}>
          <Undo2 className="mr-1.5 h-3.5 w-3.5" />
          Reopen
        </Button>
      )}

      <Dialog open={confirmShip} onOpenChange={setConfirmShip}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ship this release?</DialogTitle>
            <DialogDescription>
              {unversionedAssets.length > 0 ? (
                <>
                  These assets have no version stamp yet:{' '}
                  <span className="font-medium text-foreground">{unversionedAssets.join(', ')}</span>. You can
                  ship without versions, but the asset history timeline won&apos;t get version tick marks for
                  them.
                </>
              ) : (
                'All assets on this release carry a version stamp. Shipping records the release in each asset’s history.'
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmShip(false)}>
              Cancel
            </Button>
            <Button onClick={() => setStatus('shipped')} disabled={isPending}>
              <Rocket className="mr-1.5 h-3.5 w-3.5" />
              {isPending ? 'Shipping…' : 'Ship Release'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
