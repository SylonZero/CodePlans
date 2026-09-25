'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { RichTextEditor } from '@/components/rich-text-editor'
import { Plus } from 'lucide-react'
import { createSpecAction } from './actions'

const starterTypes = ['feature', 'ux', 'test', 'workflow', 'schema', 'api', 'architecture', 'integration', 'ops']

export function SpecCreatePanel({ products, defaultProductId }: { products: { id: string; name: string }[]; defaultProductId?: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [productId, setProductId] = useState(products.some((p) => p.id === defaultProductId) ? defaultProductId! : products[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [specType, setSpecType] = useState('feature')
  const [area, setArea] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        const spec = await createSpecAction({ productId, title, body, specType, area: area || undefined })
        setOpen(false)
        router.push(`/specs/${spec.id}`)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not create spec')
      }
    })
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button><Plus className="mr-2 h-4 w-4" />New Spec</Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>New spec</SheetTitle>
          <SheetDescription>Starts as a draft at v1. Every save after that is kept as a version.</SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} className="space-y-4 px-4 pb-6">
          <div className="space-y-2">
            <Label>Product</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger aria-label="Product"><SelectValue placeholder="Select product" /></SelectTrigger>
              <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="spec-title">Title</Label>
            <Input id="spec-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="spec-type">Type</Label>
              <Input id="spec-type" list="spec-type-options" value={specType} onChange={(e) => setSpecType(e.target.value)} required />
              <datalist id="spec-type-options">{starterTypes.map((t) => <option key={t} value={t} />)}</datalist>
            </div>
            <div className="space-y-2">
              <Label htmlFor="spec-area">Area (optional)</Label>
              <Input id="spec-area" value={area} onChange={(e) => setArea(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Body</Label>
            <RichTextEditor value={body} onChange={setBody} />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={pending || !productId || !title.trim() || !specType.trim()}>
            {pending ? 'Creating…' : 'Create draft'}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}
