// In-memory registry for enterprise extension points. See docs/guides/
// enterprise-extensions.md for the full picture: this file only holds the
// current set of hooks; `load.ts` is what conditionally populates it from
// the private "@codeplans/enterprise" module, when installed.
//
// State lives on `globalThis` rather than in a plain module-scope variable.
// Next.js compiles `instrumentation.ts` (where `registerEnterpriseHooks` is
// called, once at boot) and the app/page SSR bundles (where
// `getEnterpriseHooks` is read, per request) into separate chunks; each
// chunk evaluates this file's module body independently and would otherwise
// get its own disconnected `activeHooks` closure, so a hook registered at
// boot would never be visible from a request. `globalThis` is the one thing
// guaranteed to be shared across every chunk within the same Node.js
// process, so storing the registry there keeps a single source of truth
// regardless of how many separate copies of this module get bundled.

import type { EnterpriseHooks } from './types'

const defaultHooks: EnterpriseHooks = {
  navItems: () => [],
}

const REGISTRY_KEY = Symbol.for('codeplans.ee.registry')

type Registry = { activeHooks: EnterpriseHooks }
type GlobalWithRegistry = typeof globalThis & { [REGISTRY_KEY]?: Registry }

function getRegistry(): Registry {
  const g = globalThis as GlobalWithRegistry
  if (!g[REGISTRY_KEY]) {
    g[REGISTRY_KEY] = { activeHooks: defaultHooks }
  }
  return g[REGISTRY_KEY]
}

/**
 * Called by the enterprise module (via `load.ts`) to override one or more
 * hooks. Unspecified hooks keep their no-op default, so a partial/older
 * enterprise module never breaks the app.
 */
export function registerEnterpriseHooks(overrides: Partial<EnterpriseHooks>) {
  getRegistry().activeHooks = { ...defaultHooks, ...overrides }
}

/** Read the current hooks. Always returns a complete `EnterpriseHooks`. */
export function getEnterpriseHooks(): EnterpriseHooks {
  return getRegistry().activeHooks
}

/** Test-only: restore the no-op defaults between test cases. */
export function resetEnterpriseHooks() {
  getRegistry().activeHooks = defaultHooks
}
