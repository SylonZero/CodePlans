import { redirect } from 'next/navigation'
import { GitBranch, History, Bot } from 'lucide-react'
import { authAdapter } from '@/lib/auth'

const BRAND = 'oklch(0.8 0.14 196)'

function Logo() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-sm" style={{ background: BRAND }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="oklch(0.1 0 0)" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m5 16-4-4 4-4" />
          <path d="m19 8 4 4-4 4" />
          <path d="m14 4-4 16" />
        </svg>
      </div>
      <span className="font-mono text-base font-semibold tracking-tight">
        CodePlans<span style={{ color: BRAND }}>.ai</span>
      </span>
    </div>
  )
}

/** A few services and the plan changing them: what CodePlans keeps track of. Decorative. */
function ArchitectureSketch() {
  const nodes = [
    { id: 'web', x: 40, y: 34, label: 'web-app' },
    { id: 'api', x: 214, y: 34, label: 'api-gateway' },
    { id: 'auth', x: 40, y: 150, label: 'auth-lib' },
    { id: 'billing', x: 214, y: 150, label: 'billing' },
  ]
  const at = (id: string) => nodes.find((n) => n.id === id)!
  const edges: [string, string, boolean][] = [['web', 'api', true], ['api', 'auth', true], ['api', 'billing', false], ['web', 'auth', false]]
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-[400px]">
      <svg viewBox="0 0 360 210" className="w-full">
        {edges.map(([a, b, hot]) => (
          <line key={a + b} x1={at(a).x + 53} y1={at(a).y + 16} x2={at(b).x + 53} y2={at(b).y + 16}
            stroke={hot ? BRAND : 'oklch(1 0 0 / 0.14)'} strokeWidth={hot ? 1.75 : 1} strokeDasharray={hot ? '0' : '3 4'} />
        ))}
        {nodes.map((n) => {
          const hot = n.id !== 'billing'
          return (
            <g key={n.id}>
              <rect x={n.x} y={n.y} width="106" height="32" rx="7" fill="oklch(0.16 0 0)"
                stroke={hot ? 'oklch(0.8 0.14 196 / 0.7)' : 'oklch(1 0 0 / 0.12)'} />
              <circle cx={n.x + 14} cy={n.y + 16} r="3.5" fill={hot ? BRAND : 'oklch(1 0 0 / 0.3)'} />
              <text x={n.x + 26} y={n.y + 20.5} fill="oklch(0.92 0 0)" fontSize="11.5"
                fontFamily="var(--font-mono), ui-monospace, monospace">{n.label}</text>
            </g>
          )
        })}
      </svg>
      <div className="relative ml-auto mr-6 -mt-2 w-[230px] rounded-lg border border-white/10 bg-[oklch(0.13_0_0_/_0.95)] p-3 shadow-2xl shadow-black/50 backdrop-blur">
        <div className="flex items-center justify-between text-[11px] text-white/50">
          <span>Code plan · feature</span>
          <span className="rounded-full px-1.5 py-0.5 font-medium text-black" style={{ background: BRAND }}>PR open</span>
        </div>
        <p className="mt-1.5 text-[13px] font-medium text-white">Move sessions to the edge</p>
        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-3/5 rounded-full" style={{ background: BRAND }} />
        </div>
        <p className="mt-1.5 text-[11px] text-white/50">3 of 5 tasks · 3 assets</p>
      </div>
    </div>
  )
}

const POINTS = [
  { icon: GitBranch, text: 'Plans and specs tied to the services and libraries they change' },
  { icon: History, text: 'Every asset keeps its history: releases, decisions, debt' },
  { icon: Bot, text: 'Your coding agents read and update it over MCP' },
]

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  // Already signed in: go to the app. A session ended by a password change
  // (or with no workspace to check against) counts as signed out.
  const user = await authAdapter.getUser().catch(() => null)
  if (user) redirect('/')

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <aside
        className="relative hidden overflow-hidden border-r border-white/5 bg-[oklch(0.1_0_0)] px-12 py-10 text-white lg:flex lg:flex-col"
        style={{
          backgroundImage: [
            'radial-gradient(ellipse 80% 55% at 15% 0%, oklch(0.8 0.14 196 / 0.16), transparent 70%)',
            'radial-gradient(ellipse 60% 40% at 100% 100%, oklch(0.8 0.14 196 / 0.08), transparent 70%)',
            'linear-gradient(oklch(1 0 0 / 0.035) 1px, transparent 1px)',
            'linear-gradient(90deg, oklch(1 0 0 / 0.035) 1px, transparent 1px)',
          ].join(', '),
          backgroundSize: 'auto, auto, 32px 32px, 32px 32px',
        }}
      >
        <Logo />
        <div className="my-auto space-y-12 py-12">
          <div className="max-w-md space-y-4">
            <h2 className="text-3xl font-semibold leading-tight tracking-tight xl:text-4xl">
              Coordinate change across your whole architecture.
            </h2>
            <p className="text-base leading-relaxed text-white/60">
              One shared view of what&apos;s changing, in which components, and why, from a single task to a
              cross-service migration.
            </p>
          </div>
          <ArchitectureSketch />
        </div>
        <ul className="space-y-3 text-sm text-white/70">
          {POINTS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5">
                <Icon className="h-3.5 w-3.5" style={{ color: BRAND }} />
              </span>
              {text}
            </li>
          ))}
        </ul>
      </aside>

      <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-4 py-10 sm:px-8">
        <div className="lg:hidden">
          <Logo />
        </div>
        {/* Forms here use Card; on these pages it reads as an open form, not a box, with the brand's submit button. */}
        <div className="flex w-full justify-center [&_[data-slot=card]]:max-w-sm [&_[data-slot=card]]:border-0 [&_[data-slot=card]]:bg-transparent [&_[data-slot=card]]:py-0 [&_[data-slot=card]]:shadow-none [&_[data-slot=card-content]]:px-0 [&_[data-slot=card-footer]]:px-0 [&_[data-slot=card-header]]:px-0 [&_[data-slot=card-title]]:text-2xl [&_[data-slot=card-title]]:tracking-tight [&_[data-slot=input]]:h-10 [&_button[type=submit]]:h-10 [&_button[type=submit]]:bg-brand [&_button[type=submit]]:text-black [&_button[type=submit]:hover]:bg-brand/90">
          {children}
        </div>
      </main>
    </div>
  )
}
