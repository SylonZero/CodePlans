// Shared types for the enterprise extension-point system. The OSS app depends
// only on this file and `registry.ts` — never on the private package itself —
// so the community build has zero compile-time or run-time coupling to
// proprietary code.

import type { ComponentType } from 'react'

type IconType = ComponentType<{ className?: string }>

/** An item appended to the dashboard sidebar's secondary (settings) navigation. */
export type NavExtension = {
  id: string
  name: string
  href: string
  icon: IconType
}

/**
 * The full set of hooks a private "@codeplans/enterprise"-style module can
 * override. Add a new field here whenever OSS code needs a seam for a
 * closed-source feature — keep each hook narrow and additive (return `[]` /
 * `null` / a no-op by default) so the community edition behaves identically
 * whether or not the enterprise module is installed.
 */
export type EnterpriseHooks = {
  /** Extra items rendered under "Settings" in the dashboard sidebar. */
  navItems: () => NavExtension[]
}

/**
 * The shape a private enterprise package is expected to export as its
 * default export. `register` receives the live registry function and should
 * call it once with whichever hooks it implements.
 */
export type EnterpriseModule = {
  register: (register: (overrides: Partial<EnterpriseHooks>) => void) => void
}
