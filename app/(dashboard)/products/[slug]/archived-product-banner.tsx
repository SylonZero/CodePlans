'use client'

import { useTransition } from 'react'
import { Archive } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { restoreProductAction } from '../../actions'

export function ArchivedProductBanner({ id, slug }: { id: string; slug: string }) {
  const [isPending, startTransition] = useTransition()

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted px-4 py-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Archive className="h-4 w-4" />
        <span>This product is archived — hidden from lists and pickers, and no longer accepts new work.</span>
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const result = await restoreProductAction(id, slug)
            if (result?.error) toast.error(result.error)
            else toast.success('Product restored')
          })
        }
      >
        {isPending ? 'Restoring…' : 'Restore'}
      </Button>
    </div>
  )
}
