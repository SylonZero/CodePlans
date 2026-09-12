'use client'

import { useTransition } from 'react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import { restoreProductAction } from '../actions'

export function RestoreProductButton({ id, slug }: { id: string; slug: string }) {
  const [isPending, startTransition] = useTransition()

  return (
    <DropdownMenuItem
      disabled={isPending}
      className="cursor-pointer"
      onSelect={(e) => {
        e.preventDefault()
        startTransition(async () => {
          const result = await restoreProductAction(id, slug)
          if (result?.error) toast.error(result.error)
          else toast.success('Product restored')
        })
      }}
    >
      {isPending ? 'Restoring…' : 'Restore'}
    </DropdownMenuItem>
  )
}
