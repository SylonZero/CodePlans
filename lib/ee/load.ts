// Conditionally loads the private enterprise module, if installed, and lets
// it register its hooks into the registry. Runs once per server boot from
// `instrumentation.ts`. Safe to import from any OSS build: when the
// "@codeplans/enterprise" package isn't installed (the normal case for the
// community edition), the dynamic import rejects and is swallowed below —
// nothing else in the app needs to know it's missing.
//
// The package name is read into a variable (not inlined into `import()`)
// so bundlers can't try to statically resolve/bundle a dependency that may
// not exist in node_modules. `next.config.mjs`'s `serverExternalPackages`
// reinforces this by telling Next.js to leave it to a plain runtime
// `require`/`import()` instead of tracing it at build time.
import { registerEnterpriseHooks } from './registry'
import type { EnterpriseModule } from './types'

const ENTERPRISE_PACKAGE_NAME = '@codeplans/enterprise'

let loadAttempted = false

export async function loadEnterpriseModule(): Promise<void> {
  if (loadAttempted) return
  loadAttempted = true

  if (process.env.ENTERPRISE_ENABLED !== 'true') return

  try {
    // The webpackIgnore comment (also honored by Turbopack) tells the
    // bundler to leave this as a plain runtime import instead of trying to
    // resolve/bundle a package that may not be installed.
    const mod = (await import(/* webpackIgnore: true */ ENTERPRISE_PACKAGE_NAME)) as
      | EnterpriseModule
      | { default: EnterpriseModule }
    const enterpriseModule = 'default' in mod ? mod.default : mod
    enterpriseModule.register(registerEnterpriseHooks)
    console.log(`[ee] loaded ${ENTERPRISE_PACKAGE_NAME}`)
  } catch (err) {
    console.warn(
      `[ee] ENTERPRISE_ENABLED=true but "${ENTERPRISE_PACKAGE_NAME}" could not be loaded; ` +
        'running community edition only.',
      err
    )
  }
}
