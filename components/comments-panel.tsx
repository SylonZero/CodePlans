'use client'

import { createContext, useContext, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Bot, CheckCircle2, MessageSquare, Quote, RotateCcw, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { addCommentAction, deleteCommentAction, editCommentAction, resolveCommentAction } from '@/app/(dashboard)/collab-actions'
import type { CommentThread, CommentView } from '@/lib/db/comments'
import type { CommentAnchor, CommentKind, CommentSubjectType } from '@/lib/db/schema.sqlite'

type Person = { id: string; name: string }

/**
 * How the panel reloads after a change. Server-rendered pages refresh the
 * route; client-loaded panels (e.g. inside a sheet) provide their own reload.
 */
export const DiscussionRefreshContext = createContext<(() => void) | null>(null)
function useRefresh() {
  const router = useRouter()
  const custom = useContext(DiscussionRefreshContext)
  return custom ?? (() => router.refresh())
}

const KIND_LABELS: Record<CommentKind, string> = { comment: 'Comment', question: 'Question', suggestion: 'Suggestion' }
const KIND_STYLES: Record<CommentKind, string> = {
  comment: '',
  question: 'bg-chart-2/20 text-chart-2',
  suggestion: 'bg-chart-4/20 text-chart-4',
}

export function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`
  return new Date(iso).toISOString().slice(0, 10)
}

/** Plain-text body with @mentions of known people highlighted. */
function Body({ text, mentions }: { text: string; mentions: Person[] }) {
  if (!mentions.length) return <>{text}</>
  const names = mentions.map((m) => m.name).sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const parts = text.split(new RegExp(`(@(?:${names.join('|')}))`, 'g'))
  return <>{parts.map((p, i) => p.startsWith('@') && mentions.some((m) => `@${m.name}` === p)
    ? <span key={i} className="rounded bg-accent/15 px-0.5 font-medium text-accent">{p}</span>
    : <span key={i}>{p}</span>)}</>
}

/**
 * Textarea with @mention autocomplete. Mentions are tracked by id and kept only
 * while their "@Name" text is still present when the comment is sent.
 */
function Composer({ audience, placeholder, submitLabel, onSubmit, autoFocus, withKind, anchor, onClearAnchor, onCancel }: {
  audience: Person[]
  placeholder: string
  submitLabel: string
  onSubmit: (body: string, mentions: string[], kind: CommentKind) => Promise<boolean>
  autoFocus?: boolean
  withKind?: boolean
  anchor?: CommentAnchor | null
  onClearAnchor?: () => void
  onCancel?: () => void
}) {
  const [text, setText] = useState('')
  const [kind, setKind] = useState<CommentKind>('comment')
  const [picked, setPicked] = useState<Person[]>([])
  const [query, setQuery] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const ref = useRef<HTMLTextAreaElement>(null)
  const matches = query === null ? [] : audience.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6)

  function onChange(value: string) {
    setText(value)
    const caret = ref.current?.selectionStart ?? value.length
    const m = /(?:^|\s)@([\w.-]*)$/.exec(value.slice(0, caret))
    setQuery(m ? m[1] : null)
  }
  function pick(p: Person) {
    const el = ref.current
    const caret = el?.selectionStart ?? text.length
    const before = text.slice(0, caret).replace(/@([\w.-]*)$/, `@${p.name} `)
    setText(before + text.slice(caret))
    setPicked((xs) => (xs.some((x) => x.id === p.id) ? xs : [...xs, p]))
    setQuery(null)
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(before.length, before.length) })
  }
  function submit() {
    const body = text.trim()
    if (!body) return
    const mentions = picked.filter((p) => body.includes(`@${p.name}`)).map((p) => p.id)
    start(async () => {
      if (await onSubmit(body, mentions, kind)) { setText(''); setPicked([]); setKind('comment') }
    })
  }

  return <div className="space-y-2">
    {anchor && <div className="flex items-start gap-2 rounded-md border-l-2 border-accent bg-muted/50 px-3 py-2 text-xs">
      <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="line-clamp-2 flex-1 italic">{anchor.quote}</span>
      {onClearAnchor && <button type="button" aria-label="Remove quoted text" onClick={onClearAnchor} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
    </div>}
    <div className="relative">
      <textarea
        ref={ref}
        value={text}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (matches.length && (e.key === 'Enter' || e.key === 'Tab')) { e.preventDefault(); pick(matches[0]) }
          else if (e.key === 'Escape') setQuery(null)
          else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit() }
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        rows={3}
        className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
      {matches.length > 0 && <ul role="listbox" className="absolute left-2 top-full z-20 mt-1 w-56 overflow-hidden rounded-md border bg-popover text-sm shadow-md">
        {matches.map((p) => <li key={p.id}><button type="button" role="option" aria-selected="false" onMouseDown={(e) => { e.preventDefault(); pick(p) }} className="w-full px-3 py-1.5 text-left hover:bg-muted">{p.name}</button></li>)}
      </ul>}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2">
      {withKind ? <div className="flex gap-1" role="radiogroup" aria-label="Comment type">
        {(Object.keys(KIND_LABELS) as CommentKind[]).map((k) => <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
          className={cn('rounded-md px-2 py-1 text-xs', kind === k ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:text-foreground')}>{KIND_LABELS[k]}</button>)}
      </div> : <span className="text-xs text-muted-foreground">Type @ to mention someone</span>}
      <div className="flex gap-2">
        {onCancel && <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>}
        <Button type="button" size="sm" disabled={pending || !text.trim()} onClick={submit}>{pending ? 'Sending…' : submitLabel}</Button>
      </div>
    </div>
  </div>
}

function CommentItem({ c, currentUserId, currentVersion, path, isReply }: {
  c: CommentView; currentUserId: string; currentVersion: number | null; path: string; isReply?: boolean
}) {
  const refresh = useRefresh()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(c.body)
  const [error, setError] = useState('')
  const [pending, start] = useTransition()
  const mine = c.authorId === currentUserId
  function act(fn: () => Promise<{ ok: boolean; error?: string }>) {
    start(async () => { const r = await fn(); if (!r.ok) setError(r.error ?? 'Failed'); else { setEditing(false); refresh() } })
  }
  if (c.deleted) return <p className="text-xs italic text-muted-foreground">Comment deleted.</p>
  return <div className={cn('space-y-1.5', isReply && 'border-l pl-3')}>
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="font-medium text-foreground">{c.authorName ?? 'Unknown'}</span>
      {c.authorType === 'agent' && <Badge variant="outline" className="h-5 gap-1 px-1.5 text-[10px]"><Bot className="h-3 w-3" />agent</Badge>}
      {c.kind !== 'comment' && <Badge variant="secondary" className={cn('h-5 px-1.5 text-[10px]', KIND_STYLES[c.kind])}>{KIND_LABELS[c.kind]}</Badge>}
      {c.reviewId && <Badge variant="outline" className="h-5 px-1.5 text-[10px]">Review note</Badge>}
      <span className="text-muted-foreground">{timeAgo(c.createdAt)}{c.editedAt ? ' · edited' : ''}</span>
      {c.subjectVersion !== null && currentVersion !== null && c.subjectVersion !== currentVersion && (
        <span className="font-mono text-muted-foreground">on v{c.subjectVersion}</span>
      )}
    </div>
    {c.anchor && <div className={cn('flex items-start gap-2 rounded-md border-l-2 px-3 py-1.5 text-xs', c.anchorStatus === 'outdated' ? 'border-muted-foreground/40 bg-muted/30 text-muted-foreground' : 'border-accent bg-muted/50')}>
      <Quote className="mt-0.5 h-3 w-3 shrink-0" />
      <span className={cn('line-clamp-3 italic', c.anchorStatus === 'outdated' && 'line-through decoration-muted-foreground/50')}>{c.anchor.quote}</span>
      {c.anchorStatus === 'outdated' && <span className="ml-auto shrink-0 not-italic">outdated</span>}
    </div>}
    {editing
      ? <div className="space-y-2">
        <textarea aria-label="Edit comment" value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
        <div className="flex gap-2"><Button size="sm" disabled={pending || !draft.trim()} onClick={() => act(() => editCommentAction(c.id, draft, path))}>Save</Button><Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button></div>
      </div>
      : <p className="whitespace-pre-wrap text-sm"><Body text={c.body} mentions={c.mentions} /></p>}
    {mine && !editing && <div className="flex gap-3 text-xs text-muted-foreground">
      <button type="button" className="hover:text-foreground" onClick={() => { setDraft(c.body); setEditing(true) }}>Edit</button>
      <button type="button" className="hover:text-destructive" disabled={pending} onClick={() => act(() => deleteCommentAction(c.id, path))}>Delete</button>
    </div>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>
}

function Thread({ t, audience, currentUserId, currentVersion, canModerate, path, subjectType, subjectId }: {
  t: CommentThread; audience: Person[]; currentUserId: string; currentVersion: number | null; canModerate: boolean
  path: string; subjectType: CommentSubjectType; subjectId: string
}) {
  const refresh = useRefresh()
  const [replying, setReplying] = useState(false)
  const [error, setError] = useState('')
  const [pending, start] = useTransition()
  const canResolve = canModerate || t.authorId === currentUserId
  return <li className={cn('space-y-3 rounded-lg border p-4', t.resolvedAt && 'bg-muted/30')}>
    <CommentItem c={t} currentUserId={currentUserId} currentVersion={currentVersion} path={path} />
    {t.replies.length > 0 && <div className="space-y-3">{t.replies.map((r) => <CommentItem key={r.id} c={r} currentUserId={currentUserId} currentVersion={currentVersion} path={path} isReply />)}</div>}
    {replying
      ? <Composer audience={audience} placeholder="Reply…" submitLabel="Reply" autoFocus onCancel={() => setReplying(false)}
        onSubmit={async (body, mentions) => {
          const r = await addCommentAction({ subjectType, subjectId, body, mentions, parentId: t.id }, path)
          if (!r.ok) { setError(r.error); return false }
          setReplying(false); refresh(); return true
        }} />
      : <div className="flex items-center gap-3 text-xs">
        {!t.resolvedAt && <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setReplying(true)}>Reply</button>}
        {canResolve && <button type="button" disabled={pending} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          onClick={() => start(async () => { const r = await resolveCommentAction(t.id, !t.resolvedAt, path); if (!r.ok) setError(r.error); else refresh() })}>
          {t.resolvedAt ? <><RotateCcw className="h-3 w-3" />Reopen</> : <><CheckCircle2 className="h-3 w-3" />Resolve</>}
        </button>}
        {t.resolvedAt && <span className="text-muted-foreground">Resolved{t.resolvedByName ? ` by ${t.resolvedByName}` : ''}</span>}
      </div>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </li>
}

export function CommentsPanel({
  subjectType, subjectId, threads, audience, currentUserId, canModerate, currentVersion = null, path, anchor, onClearAnchor, title = 'Discussion',
}: {
  subjectType: CommentSubjectType
  subjectId: string
  threads: CommentThread[]
  audience: Person[]
  currentUserId: string
  canModerate: boolean
  currentVersion?: number | null
  path: string
  anchor?: CommentAnchor | null
  onClearAnchor?: () => void
  title?: string
}) {
  const refresh = useRefresh()
  const [error, setError] = useState('')
  const open = useMemo(() => threads.filter((t) => !t.resolvedAt), [threads])
  const resolved = useMemo(() => threads.filter((t) => t.resolvedAt), [threads])
  const others = audience.filter((p) => p.id !== currentUserId)
  const threadProps = { audience: others, currentUserId, currentVersion, canModerate, path, subjectType, subjectId }

  return <section id="discussion" className="space-y-4 rounded-lg border bg-card p-5">
    <div className="flex items-baseline justify-between gap-2">
      <h2 className="flex items-center gap-2 font-semibold"><MessageSquare className="h-4 w-4" />{title}</h2>
      <span className="text-xs text-muted-foreground">{open.length} open · {resolved.length} resolved</span>
    </div>
    <Composer audience={others} placeholder={anchor ? 'Comment on the selected text…' : 'Leave feedback, ask a question or suggest a change…'} submitLabel="Comment" withKind
      anchor={anchor} onClearAnchor={onClearAnchor}
      onSubmit={async (body, mentions, kind) => {
        setError('')
        const r = await addCommentAction({ subjectType, subjectId, body, mentions, kind, anchor: anchor ?? undefined }, path)
        if (!r.ok) { setError(r.error); return false }
        onClearAnchor?.(); refresh(); return true
      }} />
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {open.length === 0 && resolved.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
    {open.length > 0 && <ul className="space-y-3">{open.map((t) => <Thread key={t.id} t={t} {...threadProps} />)}</ul>}
    {resolved.length > 0 && <details className="group">
      <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">Resolved ({resolved.length})</summary>
      <ul className="mt-3 space-y-3">{resolved.map((t) => <Thread key={t.id} t={t} {...threadProps} />)}</ul>
    </details>}
  </section>
}
