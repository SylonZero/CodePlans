'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Settings } from 'lucide-react'
import { updateProductAction } from '../../actions'

type ProductSummary = {
  id: string
  slug: string
  name: string
  description: string
  tags: string[]
}

type ProductEditPanelProps = {
  product: ProductSummary
  /** Omit to render the default Settings trigger button; pass open/onOpenChange to control externally. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function ProductEditPanel({ product, open: controlledOpen, onOpenChange }: ProductEditPanelProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      try {
        await updateProductAction(product.id, fd)
        setOpen(false)
      } catch (err: unknown) {
        if (err instanceof Error && !err.message.includes('NEXT_REDIRECT')) {
          setError(err.message)
        }
      }
    })
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {controlledOpen === undefined && (
        <SheetTrigger asChild>
          <Button variant="outline">
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Button>
        </SheetTrigger>
      )}
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Edit Product</SheetTitle>
          <SheetDescription>Update the product details.</SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-4 px-4 pb-4">
          <div className="space-y-2">
            <Label htmlFor="pe-name">Product Name <span className="text-destructive">*</span></Label>
            <Input id="pe-name" name="name" defaultValue={product.name} required />
          </div>

          {/* slug is passed as hidden so updateProductAction knows where to redirect */}
          <input type="hidden" name="slug" value={product.slug} />

          <div className="space-y-2">
            <Label htmlFor="pe-description">Description <span className="text-destructive">*</span></Label>
            <Textarea id="pe-description" name="description" defaultValue={product.description} rows={3} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pe-tags">
              Tags
              <span className="ml-2 text-xs text-muted-foreground">(comma-separated)</span>
            </Label>
            <Input id="pe-tags" name="tags" defaultValue={product.tags.join(', ')} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
