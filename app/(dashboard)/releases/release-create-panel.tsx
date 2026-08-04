'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RichTextField } from '@/components/rich-text-field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Plus } from 'lucide-react'
import { createReleaseAction } from '../actions'

type ProductOption = { id: string; name: string }

export function ReleaseCreatePanel({
  products,
  defaultProductId,
  trigger,
}: {
  products: ProductOption[]
  defaultProductId?: string
  trigger?: React.ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [productId, setProductId] = useState(defaultProductId ?? products[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!productId) {
      setError('Please select a product.')
      return
    }
    setError(null)
    const fd = new FormData(e.currentTarget)
    fd.set('productId', productId)
    startTransition(async () => {
      try {
        const id = await createReleaseAction(fd)
        setOpen(false)
        router.push(`/releases/${id}`)
      } catch (err: unknown) {
        if (err instanceof Error) setError(err.message)
      }
    })
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Release
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>New Release</SheetTitle>
          <SheetDescription>
            Group plans that ship together and stamp the versions they deliver.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-4 px-4 pb-4">
          <div className="space-y-2">
            <Label htmlFor="nr-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input id="nr-name" name="name" required placeholder="Admin App v1.2.0" />
          </div>
          <div className="space-y-2">
            <Label>
              Product <span className="text-destructive">*</span>
            </Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a product" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <RichTextField name="description" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nr-tags">Tags</Label>
            <Input id="nr-tags" name="tags" placeholder="comma, separated" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Creating…' : 'Create Release'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
