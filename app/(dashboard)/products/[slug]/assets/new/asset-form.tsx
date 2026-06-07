'use client'

import { useTransition, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createAssetAction } from '../../../../actions'

const ASSET_TYPES = [
  { value: 'app', label: 'Application' },
  { value: 'service', label: 'Service' },
  { value: 'library', label: 'Library' },
  { value: 'datastore', label: 'Datastore' },
  { value: 'platform', label: 'Platform' },
] as const

export function AssetForm({ productId, productSlug }: { productId: string; productSlug: string }) {
  const [type, setType] = useState<string>('app')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    fd.set('type', type)
    startTransition(async () => {
      try {
        await createAssetAction(productId, productSlug, fd)
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
            <Label htmlFor="name">Asset Name <span className="text-destructive">*</span></Label>
            <Input id="name" name="name" placeholder="e.g. Auth Service" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Type <span className="text-destructive">*</span></Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSET_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description <span className="text-destructive">*</span></Label>
            <Textarea id="description" name="description" placeholder="What does this asset do?" rows={3} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tags">
              Tags
              <span className="ml-2 text-xs text-muted-foreground">(comma-separated)</span>
            </Label>
            <Input id="tags" name="tags" placeholder="node, rest, postgres" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="repositoryUrl">Repository URL</Label>
            <Input id="repositoryUrl" name="repositoryUrl" type="url" placeholder="https://github.com/org/repo" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="documentationUrl">Documentation URL</Label>
            <Input id="documentationUrl" name="documentationUrl" type="url" placeholder="https://docs.example.com" />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-3 justify-end">
            <Button type="button" variant="outline" onClick={() => history.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Adding…' : 'Add Asset'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
