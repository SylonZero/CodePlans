'use client'

import { useCallback, useEffect, useState } from 'react'
import { CommentsPanel, DiscussionRefreshContext } from '@/components/comments-panel'
import { loadDiscussionAction } from '@/app/(dashboard)/collab-actions'
import type { CommentSubjectType } from '@/lib/db/schema.sqlite'

type Data = NonNullable<Awaited<ReturnType<typeof loadDiscussionAction>>>

/** A discussion that loads on the client, for subjects shown in sheets and panels. */
export function LazyDiscussion({ subjectType, subjectId }: { subjectType: CommentSubjectType; subjectId: string }) {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  const load = useCallback(() => {
    loadDiscussionAction(subjectType, subjectId).then((d) => setData(d)).catch((e) => setError(e instanceof Error ? e.message : 'Could not load comments'))
  }, [subjectType, subjectId])
  useEffect(() => { load() }, [load])
  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>
  if (!data) return <p className="text-sm text-muted-foreground">Loading discussion…</p>
  return <DiscussionRefreshContext.Provider value={load}>
    <CommentsPanel subjectType={subjectType} subjectId={subjectId} threads={data.threads} audience={data.audience} currentUserId={data.currentUserId}
      canModerate={data.canModerate} currentVersion={data.currentVersion} path="/work-items" />
  </DiscussionRefreshContext.Provider>
}
