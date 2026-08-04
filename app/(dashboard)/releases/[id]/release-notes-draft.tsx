'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { RichTextField } from '@/components/rich-text-field'
import { Sparkles } from 'lucide-react'
import { draftReleaseNotesAction, saveReleaseDescriptionAction } from '../../actions'

/**
 * AI-drafted release notes (Phase D). The draft lands in an editor for review —
 * nothing is saved until the user chooses to.
 */
export function ReleaseNotesDraft({ releaseId }: { releaseId: string }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const generate = () =>
    startTransition(async () => {
      setError(null)
      try {
        const text = await draftReleaseNotesAction(releaseId)
        setDraft(text)
        setOpen(true)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Drafting failed.')
      }
    })

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      await saveReleaseDescriptionAction(releaseId, (fd.get('description') as string) ?? '')
      setOpen(false)
      setDraft(null)
      router.refresh()
    })
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={generate} disabled={isPending}>
        <Sparkles className="mr-1.5 h-3.5 w-3.5" />
        {isPending && !open ? 'Drafting…' : 'Draft release notes'}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Drafted release notes</DialogTitle>
            <DialogDescription>
              Generated from this release&apos;s plans, work items, and asset versions. Edit freely — nothing
              is saved until you choose to.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="max-h-[50vh] overflow-y-auto">
              {draft != null && <RichTextField name="description" defaultValue={draft} size="tall" />}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Discard
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Saving…' : 'Save as description'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
