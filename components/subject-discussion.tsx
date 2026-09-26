import { CommentsPanel } from '@/components/comments-panel'
import { listComments, getProductAudience } from '@/lib/db/comments'
import { canWriteProduct } from '@/lib/db/authz'
import type { CommentSubjectType } from '@/lib/db/schema.sqlite'

/** Server-loaded discussion for any commentable subject. */
export async function SubjectDiscussion({ subjectType, subjectId, productId, userId, path, currentVersion = null }: {
  subjectType: CommentSubjectType
  subjectId: string
  productId: string
  userId: string
  path: string
  currentVersion?: number | null
}) {
  const [threads, audience, canEdit] = await Promise.all([
    listComments(subjectType, subjectId, userId), getProductAudience(productId), canWriteProduct(userId, productId),
  ])
  return <CommentsPanel subjectType={subjectType} subjectId={subjectId} threads={threads} currentUserId={userId} canModerate={canEdit}
    currentVersion={currentVersion} path={path} audience={audience.map((u) => ({ id: u.id, name: u.name }))} />
}
