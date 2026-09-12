'use client'

import { useState, useTransition } from 'react'
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
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { archiveProductAction } from '../actions'

type BlastRadius = {
  assetCount: number
  planCount?: number
  releaseCount?: number
  workItemCount?: number
  specCount?: number
}

function blastRadiusLine(counts: BlastRadius): string {
  const parts = [
    [counts.assetCount, 'asset'],
    [counts.planCount ?? 0, 'code plan'],
    [counts.releaseCount ?? 0, 'release'],
    [counts.workItemCount ?? 0, 'work item'],
    [counts.specCount ?? 0, 'spec'],
  ] as const
  const nonZero = parts.filter(([count]) => count > 0)
  if (nonZero.length === 0) return 'This product has no assets, plans, releases, work items, or specs yet.'
  return `This will archive ${nonZero.map(([count, label]) => `${count} ${label}${count === 1 ? '' : 's'}`).join(', ')}.`
}

export function DeleteProductButton({
  id,
  slug,
  name,
  ...counts
}: { id: string; slug: string; name: string } & BlastRadius) {
  const [isPending, startTransition] = useTransition()
  const [confirmText, setConfirmText] = useState('')
  const matches = confirmText.trim() === name

  function handleArchive() {
    startTransition(async () => {
      const result = await archiveProductAction(id, slug)
      if (result?.error) toast.error(result.error)
      setConfirmText('')
    })
  }

  return (
    <AlertDialog onOpenChange={(open) => { if (!open) setConfirmText('') }}>
      <AlertDialogTrigger asChild>
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onSelect={(e) => e.preventDefault()}
        >
          Archive
        </DropdownMenuItem>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive &ldquo;{name}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                {blastRadiusLine(counts)} Nothing is deleted or unlinked — everything beneath this product keeps
                existing exactly as it is, just hidden from lists, pickers, and Atlas until you restore it. The
                product also stops accepting new work while archived.
              </p>
              <div className="space-y-1.5 pt-1">
                <Label htmlFor="archive-confirm-name" className="text-foreground">
                  Type <span className="font-semibold">{name}</span> to confirm
                </Label>
                <Input
                  id="archive-confirm-name"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  autoComplete="off"
                />
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={isPending || !matches}
            onClick={handleArchive}
          >
            {isPending ? 'Archiving…' : 'Archive Product'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
