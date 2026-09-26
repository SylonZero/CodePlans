// Runs once per server boot (Next.js instrumentation hook).
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { ensureTeamWorkspace } = await import('@/lib/db/bootstrap')
    await ensureTeamWorkspace()

    // Optional — no-op unless ENTERPRISE_ENABLED=true and the private
    // "@codeplans/enterprise" package is installed. See lib/ee/load.ts.
    const { loadEnterpriseModule } = await import('@/lib/ee/load')
    await loadEnterpriseModule()

    // Self-hosted team servers have no external cron: retry email/Slack
    // deliveries in-process. Hosted setups call /api/cron/notifications instead.
    const { config } = await import('@/lib/config')
    if (config.hostMode === 'team' && process.env.NOTIFY_INTERVAL_SECONDS !== '0') {
      const { runNotificationJobs } = await import('@/lib/db/notification-delivery')
      const every = Math.max(30, Number(process.env.NOTIFY_INTERVAL_SECONDS) || 60) * 1000
      setInterval(() => { void runNotificationJobs().catch((err) => console.error('[notifications] job failed:', err)) }, every).unref()
    }
  }
}
