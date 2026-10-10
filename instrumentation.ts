// Runs once per server boot (Next.js instrumentation hook).
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Optional — no-op unless ENTERPRISE_ENABLED=true and the private
    // "@codeplans/enterprise" package is installed. See lib/ee/load.ts.
    // Loaded first, since it may decide which database(s) boot prepares.
    const { loadEnterpriseModule } = await import('@/lib/ee/load')
    await loadEnterpriseModule()

    // Resolved settings, then per database: migrations (MIGRATE_ON_BOOT, on in
    // production), first-run owner setup and the workspace bootstrap. See
    // lib/server-boot.ts.
    const { bootServer } = await import('@/lib/server-boot')
    await bootServer()

    // Retry email/Slack deliveries in-process, so no external cron is needed.
    // NOTIFY_INTERVAL_SECONDS=0 turns this off for setups that call
    // /api/cron/notifications instead.
    if (process.env.NOTIFY_INTERVAL_SECONDS !== '0') {
      const { runNotificationJobs } = await import('@/lib/db/notification-delivery')
      const { getEnterpriseHooks } = await import('@/lib/ee/registry')
      const every = Math.max(30, Number(process.env.NOTIFY_INTERVAL_SECONDS) || 60) * 1000
      const run = () => getEnterpriseHooks().inEachWorkspace('background', async () => { await runNotificationJobs() })
      setInterval(() => { void run().catch((err) => console.error('[notifications] job failed:', err)) }, every).unref()
    }
  }
}
