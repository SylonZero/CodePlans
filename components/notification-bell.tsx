'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { timeAgo } from '@/components/comments-panel'
import { bellAction, markNotificationsReadAction, unreadCountAction, type BellNotification } from '@/app/(dashboard)/collab-actions'

/** Header bell: unread count, the latest notifications, and a way into My Work. */
export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(initialUnread)
  const [items, setItems] = useState<BellNotification[] | null>(null)
  const [, start] = useTransition()

  const load = useCallback(() => {
    bellAction().then((r) => { setItems(r.items); setUnread(r.unread) }).catch(() => {})
  }, [])

  // Keep the badge fresh without a socket: poll gently and on focus.
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') unreadCountAction().then(setUnread).catch(() => {}) }
    const timer = window.setInterval(refresh, 60_000)
    window.addEventListener('focus', refresh)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [])
  useEffect(() => { if (open) load() }, [open, load])

  function openItem(n: BellNotification) {
    setOpen(false)
    if (!n.read) start(async () => { await markNotificationsReadAction([n.id]); setUnread((u) => Math.max(0, u - 1)) })
    router.push(n.url)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}>
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-foreground">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] p-0">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 && (
            <button type="button" className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => start(async () => { await markNotificationsReadAction('all'); setUnread(0); setItems((xs) => xs?.map((x) => ({ ...x, read: true })) ?? null) })}>
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {items === null && <p className="px-4 py-6 text-center text-sm text-muted-foreground">Loading…</p>}
          {items?.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>}
          {items?.map((n) => (
            <button key={n.id} type="button" onClick={() => openItem(n)}
              className={cn('flex w-full gap-3 border-b px-4 py-3 text-left last:border-b-0 hover:bg-muted/50', !n.read && 'bg-accent/5')}>
              <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-accent')} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm leading-snug">{n.title}</span>
                {n.summary && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{n.summary}</span>}
                <span className="mt-1 block text-[11px] text-muted-foreground">{timeAgo(n.createdAt)}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="border-t px-4 py-2 text-right">
          <Link href="/my-work" onClick={() => setOpen(false)} className="text-xs font-medium text-accent hover:underline">Open My Work →</Link>
        </div>
      </PopoverContent>
    </Popover>
  )
}
