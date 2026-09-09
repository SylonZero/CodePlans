// In-memory registry for enterprise extension points. See docs/guides/
// enterprise-extensions.md for the full picture: this file only holds the
// current set of hooks; `load.ts` is what conditionally populates it from
// the private "@codeplans/enterprise" module, when installed.

import type { EnterpriseHooks } from './types'

const defaultHooks: EnterpriseHooks = {
  navItems: () => [],
}

let activeHooks: EnterpriseHooks = defaultHooks

/**
 * Called by the enterprise module (via `load.ts`) to override one or more
 * hooks. Unspecified hooks keep their no-op default, so a partial/older
 * enterprise module never breaks the app.
 */
export function registerEnterpriseHooks(overrides: Partial<EnterpriseHooks>) {
  activeHooks = { ...defaultHooks, ...overrides }
}

/** Read the current hooks. Always returns a complete `EnterpriseHooks`. */
export function getEnterpriseHooks(): EnterpriseHooks {
  return activeHooks
}

/** Test-only: restore the no-op defaults between test cases. */
export function resetEnterpriseHooks() {
  activeHooks = defaultHooks
}
