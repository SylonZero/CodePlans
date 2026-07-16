'use client'

import { useState, useTransition } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { RichTextEditor } from '@/components/rich-text-editor'
import { AlignLeft, NotebookPen, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { updateAssetContentAction } from '../../actions'

type EditableCardProps = {
  assetId: string
  productSlug: string
  field: 'description' | 'notes'
  value: string
}

const cardMeta = {
  description: { title: 'Description', icon: AlignLeft, placeholder: 'What does this asset do?', empty: 'No description yet.' },
  notes: {
    title: 'Notes & Ideation',
    icon: NotebookPen,
    placeholder: 'Design thinking, migration ideas, known quirks… (markdown)',
    empty: 'No notes yet — capture design thinking, migration ideas, and known quirks here.',
  },
} as const

/** Long-form asset content with click-to-edit. Notes render as markdown (markdown stays the canonical format). */
export function AssetContentCard({ assetId, productSlug, field, value }: EditableCardProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [isPending, startTransition] = useTransition()
  const meta = cardMeta[field]
  const Icon = meta.icon

  function save() {
    startTransition(async () => {
      await updateAssetContentAction(assetId, productSlug, { [field]: draft })
      toast.success('Saved')
      setEditing(false)
    })
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Icon className="h-4 w-4" />
          {meta.title}
          {!editing && (
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto h-6 w-6 text-muted-foreground"
              title={`Edit ${meta.title.toLowerCase()}`}
              onClick={() => { setDraft(value); setEditing(true) }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {editing ? (
          <div className="space-y-2">
            <RichTextEditor
              value={draft}
              onChange={setDraft}
              autoFocus
              size={field === 'notes' ? 'tall' : 'default'}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={isPending}>Cancel</Button>
              <Button size="sm" onClick={save} disabled={isPending}>{isPending ? 'Saving…' : 'Save'}</Button>
            </div>
          </div>
        ) : value ? (
          <div className="prose prose-sm prose-invert max-w-none [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_pre]:bg-muted [&_pre]:p-2 [&_pre]:rounded [&_code]:text-xs [&_table]:text-xs [&_ul.contains-task-list]:list-none [&_ul.contains-task-list]:pl-1">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">{meta.empty}</p>
        )}
      </CardContent>
    </Card>
  )
}
