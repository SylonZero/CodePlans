import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const PLACES = [
  { href: '/', label: 'Dashboard' },
  { href: '/my-work', label: 'My Work' },
  { href: '/plans', label: 'Code Plans' },
  { href: '/work-items', label: 'Work Items' },
  { href: '/specs', label: 'Specs' },
  { href: '/assets', label: 'Assets' },
  { href: '/releases', label: 'Releases' },
  { href: '/wiki', label: 'Wiki' },
]

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-4">
      <Link href="/" className="flex items-center gap-2" aria-label="CodePlans home">
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-sm" style={{ background: 'oklch(0.8 0.14 196)' }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="oklch(0.1 0 0)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m5 16-4-4 4-4" />
            <path d="m19 8 4 4-4 4" />
            <path d="m14 4-4 16" />
          </svg>
        </span>
        <span className="font-mono text-base font-semibold tracking-tight text-foreground">
          CodePlans<span style={{ color: 'oklch(0.8 0.14 196)' }}>.ai</span>
        </span>
      </Link>
      <Card className="w-full max-w-md">
        <CardHeader>
          <p className="font-mono text-xs text-muted-foreground">404</p>
          <CardTitle>This page doesn&apos;t exist</CardTitle>
          <CardDescription>The link may be out of date, or the item was archived or moved. Try one of these instead:</CardDescription>
        </CardHeader>
        <CardContent>
          <nav aria-label="Main sections" className="grid grid-cols-2 gap-2">
            {PLACES.map((p) => (
              <Link key={p.href} href={p.href} className="rounded-md border border-border px-3 py-2 text-sm transition-colors hover:border-accent hover:text-accent">
                {p.label}
              </Link>
            ))}
          </nav>
        </CardContent>
      </Card>
    </div>
  )
}
