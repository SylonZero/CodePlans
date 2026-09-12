'use client'

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
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Confirm-before-remove icon button for join/edge unlink actions (asset
 * dependencies, plan-asset targets, release-plan/asset links) — these are
 * single-row removals, so unlike entity deletes there's no cascade breakdown
 * to disclose, just a plain confirmation before the irreversible unlink.
 */
export function ConfirmRemoveButton({
  title,
  description,
  onConfirm,
  disabled,
  label = 'Remove',
  size = 'icon',
  type = 'button',
  className,
}: {
  title: string
  description: string
  onConfirm: () => void
  disabled?: boolean
  label?: string
  size?: 'sm' | 'icon'
  type?: 'button' | 'submit'
  className?: string
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type={type}
          variant="ghost"
          size={size}
          className={cn('text-muted-foreground hover:text-destructive', className)}
          title={label}
          disabled={disabled}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={onConfirm}
          >
            {label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
