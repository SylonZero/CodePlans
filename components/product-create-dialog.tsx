'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { createProductAction } from '@/app/(dashboard)/actions'

function slugify(name: string) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

type ProductCreateDialogProps = {
  /** Render with a built-in trigger element… */
  trigger?: React.ReactNode
  /** …or control the dialog from outside (e.g. a dropdown menu item). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function ProductCreateDialog({ trigger, open, onOpenChange }: ProductCreateDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const isOpen = open ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleNameChange(value: string) {
    setName(value)
    if (!slugEdited) setSlug(slugify(value))
  }

  function handleSlugChange(value: string) {
    setSlug(slugify(value))
    setSlugEdited(true)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required.'); return }
    if (!slug.trim()) { setError('Slug is required.'); return }
    setError(null)
    const fd = new FormData(e.currentTarget)
    fd.set('slug', slug)
    startTransition(async () => {
      try {
        // Redirects to the new product's page on success
        await createProductAction(fd)
      } catch (err: unknown) {
        if (err instanceof Error && !err.message.includes('NEXT_REDIRECT')) {
          setError(err.message)
        }
      }
    })
  }

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Product</DialogTitle>
          <DialogDescription>Group related assets and code plans under a product.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="pc-name">Product Name <span className="text-destructive">*</span></Label>
            <Input
              id="pc-name"
              name="name"
              placeholder="e.g. Core Platform"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pc-slug">
              URL Slug <span className="text-destructive">*</span>
              <span className="ml-2 text-xs text-muted-foreground">(auto-generated, must be unique)</span>
            </Label>
            <Input
              id="pc-slug"
              name="slug"
              placeholder="core-platform"
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pc-description">Description <span className="text-destructive">*</span></Label>
            <Textarea
              id="pc-description"
              name="description"
              placeholder="What does this product encompass?"
              rows={3}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pc-tags">
              Tags
              <span className="ml-2 text-xs text-muted-foreground">(comma-separated)</span>
            </Label>
            <Input id="pc-tags" name="tags" placeholder="backend, api, v2" />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Creating…' : 'Create Product'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
