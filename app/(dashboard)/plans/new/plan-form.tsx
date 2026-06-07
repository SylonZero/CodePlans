'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createCodePlanAction } from '../../actions'
import type { Product } from '@/lib/types'

const PLAN_TYPES = [
  { value: 'feature', label: 'Feature' },
  { value: 'refactor', label: 'Refactor' },
  { value: 'improvement', label: 'Improvement' },
  { value: 'bugfix', label: 'Bug Fix' },
] as const

export function PlanForm({
  products,
  preselectedProductId,
}: {
  products: Product[]
  preselectedProductId?: string
}) {
  const [productId, setProductId] = useState(preselectedProductId ?? products[0]?.id ?? '')
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
        await createCodePlanAction(fd)
      } catch (err: unknown) {
        if (err instanceof Error && !err.message.includes('NEXT_REDIRECT')) {
          setError(err.message)
        }
      }
    })
  }

  return (
    <Card className="bg-card border-border">
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="title">Title <span className="text-destructive">*</span></Label>
            <Input id="title" name="title" placeholder="e.g. Migrate auth to JWT" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description <span className="text-destructive">*</span></Label>
            <Textarea id="description" name="description" placeholder="What changes does this plan coordinate?" rows={3} required />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="product">Product <span className="text-destructive">*</span></Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger id="product">
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
              <Label htmlFor="type">Type <span className="text-destructive">*</span></Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger id="type">
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="deadline">
                Deadline
                <span className="ml-2 text-xs text-muted-foreground">(optional)</span>
              </Label>
              <Input id="deadline" name="deadline" type="date" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tags">
                Tags
                <span className="ml-2 text-xs text-muted-foreground">(comma-separated)</span>
              </Label>
              <Input id="tags" name="tags" placeholder="auth, migration, v3" />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-3 justify-end">
            <Button type="button" variant="outline" onClick={() => history.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Creating…' : 'Create Plan'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
