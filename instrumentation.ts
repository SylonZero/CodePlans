// Runs once per server boot (Next.js instrumentation hook).
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Resolved settings, migrations (MIGRATE_ON_BOOT, on in production) and
    // first-run owner setup. See lib/server-boot.ts.
    const { bootServer } = await import('@/lib/server-boot')
    await bootServer()

    const { ensureTeamWorkspace } = await import('@/lib/db/bootstrap')
    await ensureTeamWorkspace()

    // Optional — no-op unless ENTERPRISE_ENABLED=true and the private
    // "@codeplans/enterprise" package is installed. See lib/ee/load.ts.
    const { loadEnterpriseModule } = await import('@/lib/ee/load')
    await loadEnterpriseModule()

    // Retry email/Slack deliveries in-process, so no external cron is needed.
    // NOTIFY_INTERVAL_SECONDS=0 turns this off for setups that call
    // /api/cron/notifications instead.
    if (process.env.NOTIFY_INTERVAL_SECONDS !== '0') {
      const { runNotificationJobs } = await import('@/lib/db/notification-delivery')
      const every = Math.max(30, Number(process.env.NOTIFY_INTERVAL_SECONDS) || 60) * 1000
      setInterval(() => { void runNotificationJobs().catch((err) => console.error('[notifications] job failed:', err)) }, every).unref()
    }
  }
}
