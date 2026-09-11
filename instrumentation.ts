// Runs once per server boot (Next.js instrumentation hook).
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { ensureTeamWorkspace } = await import('@/lib/db/bootstrap')
    await ensureTeamWorkspace()

    // Optional — no-op unless ENTERPRISE_ENABLED=true and the private
    // "@codeplans/enterprise" package is installed. See lib/ee/load.ts.
    const { loadEnterpriseModule } = await import('@/lib/ee/load')
    await loadEnterpriseModule()
  }
}
