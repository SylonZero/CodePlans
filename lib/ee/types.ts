// Shared types for the enterprise extension-point system. The OSS app depends
// only on this file and `registry.ts` — never on the private package itself —
// so the community build has zero compile-time or run-time coupling to
// proprietary code.

/** An item appended to the dashboard sidebar's secondary (settings) navigation. */
export type NavExtension = {
  id: string
  name: string
  href: string
  /**
   * Name of a lucide-react icon (e.g. "ShieldCheck"), resolved client-side
   * via the allow-list in `components/app-shell.tsx`. Extension points
   * cannot pass an actual component *reference* here: hooks are read from a
   * Server Component (`app/(dashboard)/layout.tsx`) and passed as a prop
   * into the Client Component `AppShell`, and React's server/client
   * boundary only allows component references that Next.js's own bundler
   * tagged as Client Components — a plain function from a runtime-loaded
   * package (like the private enterprise module) is never tagged that way,
   * so passing one directly throws "Functions cannot be passed directly to
   * Client Components" at request time. A plain string has no such
   * restriction.
   */
  icon: string
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
