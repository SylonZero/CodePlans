import { NextResponse } from 'next/server'
import { authAdapter } from '@/lib/auth'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { fetchSpecMarkdown } from '@/lib/specs'

/**
 * Session-authed markdown fetch for linked specs, so client panels can render
 * them. fetchSpecMarkdown is regex-gated to GitHub/GitLab blob URLs and only
 * uses connection tokens for repos a connection covers — arbitrary URLs
 * return null without being fetched.
 */
export async function GET(request: Request) {
  const user = await authAdapter.getUser()
  if (!user) return NextResponse.json({ markdown: null }, { status: 401 })

  const url = new URL(request.url).searchParams.get('url')
  if (!url) return NextResponse.json({ markdown: null }, { status: 400 })

  const profile = await db.query.users.findFirst({ where: eq(users.id, user.id) })
  const markdown = await fetchSpecMarkdown(url, profile?.organizationId ?? null)
  return NextResponse.json({ markdown })
}
