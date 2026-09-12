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
import { Rocket, Play, Undo2, XCircle, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { setReleaseStatusAction, deleteReleaseAction } from '../../actions'
import type { ReleaseStatus } from '@/lib/types'

export function DeleteReleaseButton({
  releaseId,
  releaseName,
  assetCount,
  planCount,
}: {
  releaseId: string
  releaseName: string
  assetCount: number
  planCount: number
}) {
  const [isPending, startTransition] = useTransition()
  const parts: string[] = []
  if (assetCount > 0) parts.push(`${assetCount} version stamp${assetCount === 1 ? '' : 's'}`)
  if (planCount > 0) parts.push(`detach ${planCount} attached plan${planCount === 1 ? '' : 's'} (not delete them)`)

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" className="text-destructive hover:text-destructive">
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &ldquo;{releaseName}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete this release{parts.length > 0 ? ` and ${parts.join(', and ')}` : ''}. This
            action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={isPending}
            onClick={() => startTransition(async () => {
              const result = await deleteReleaseAction(releaseId)
              if (result?.error) toast.error(result.error)
            })}
          >
            {isPending ? 'Deleting…' : 'Delete Release'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

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
