export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-background p-4">
      <div className="flex items-center gap-2">
        <div
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-sm"
          style={{ background: 'oklch(0.8 0.14 196)' }}
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="oklch(0.1 0 0)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m5 16-4-4 4-4" />
            <path d="m19 8 4 4-4 4" />
            <path d="m14 4-4 16" />
          </svg>
        </div>
        <span className="font-mono text-base font-semibold tracking-tight text-foreground">
          CodePlans<span style={{ color: 'oklch(0.8 0.14 196)' }}>.ai</span>
        </span>
      </div>
      {children}
    </div>
  )
}
