'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { createCodePlanAction } from '../actions'

const PLAN_TYPES = [
  { value: 'feature', label: 'Feature' },
  { value: 'refactor', label: 'Refactor' },
  { value: 'improvement', label: 'Improvement' },
  { value: 'bugfix', label: 'Bug Fix' },
] as const

type ProductOption = { id: string; name: string }

export function PlanCreatePanel({
  products,
  defaultProductId,
  trigger,
}: {
  products: ProductOption[]
  defaultProductId?: string
  trigger?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [productId, setProductId] = useState(defaultProductId ?? products[0]?.id ?? '')
  const [type, setType] = useState<string>('feature')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!productId) { setError('Please select a product.'); return }
    setError(null)
    const fd = new FormData(e.currentTarget)
    fd.set('productId', productId)
    fd.set('type', type)
    startTransition(async () => {
      try {
        // Redirects to the new plan's page on success
        await createCodePlanAction(fd)
      } catch (err: unknown) {
        if (err instanceof Error && !err.message.includes('NEXT_REDIRECT')) {
          setError(err.message)
        }
      }
    })
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Plan
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>New Code Plan</SheetTitle>
          <SheetDescription>Coordinate a set of related changes across your architecture.</SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-4 px-4 pb-4">
          <div className="space-y-2">
            <Label htmlFor="np-title">Title <span className="text-destructive">*</span></Label>
            <Input id="np-title" name="title" placeholder="e.g. Migrate auth to JWT" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="np-description">Description <span className="text-destructive">*</span></Label>
            <Textarea id="np-description" name="description" placeholder="What changes does this plan coordinate?" rows={3} required />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="np-product">Product <span className="text-destructive">*</span></Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger id="np-product">
                  <SelectValue placeholder="Select a product" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="np-type">Type <span className="text-destructive">*</span></Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger id="np-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLAN_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="np-deadline">
                Deadline
                <span className="ml-2 text-xs text-muted-foreground">(optional)</span>
              </Label>
              <Input id="np-deadline" name="deadline" type="date" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="np-spec">
                Spec URL
                <span className="ml-2 text-xs text-muted-foreground">(markdown in your repo, optional)</span>
              </Label>
              <Input id="np-spec" name="specUrl" type="url" placeholder="https://github.com/org/repo/blob/main/docs/specs/my-plan.md" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="np-tags">
                Tags
                <span className="ml-2 text-xs text-muted-foreground">(comma-separated)</span>
              </Label>
              <Input id="np-tags" name="tags" placeholder="auth, migration, v3" />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Creating…' : 'Create Plan'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
