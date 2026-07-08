// Runs once per server boot (Next.js instrumentation hook).
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { ensureTeamWorkspace } = await import('@/lib/db/bootstrap')
    await ensureTeamWorkspace()
  }
}
