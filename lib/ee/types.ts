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
  /**
   * Called on every activation path — a spec becoming active, a plan being
   * activated, a task being started (including by an agent through MCP) —
   * with plain data about the transition. Return `allowed: false` with
   * human-readable reasons to block it; the caller surfaces them verbatim.
   * The community default always allows.
   */
  reviewGate: (ctx: ReviewGateContext) => ReviewGateResult | Promise<ReviewGateResult>
  /** Workflow levels a product may be set to. The community default is open and guided. */
  workflowLevels: () => WorkflowLevelOption[]
}

export type WorkflowLevelOption = 'open' | 'guided' | 'gated'

export type ReviewGateContext = {
  productId: string
  subjectType: 'spec' | 'code_plan'
  subjectId: string
  transition: 'activate' | 'start_task'
  /** For start_task, the task being started. */
  taskId?: string
  actorId: string
  actorKind: 'user' | 'agent'
  workflowLevel: WorkflowLevelOption
  /** Whether an approval covers the subject's current content. */
  approved: boolean
  /** Ids of code owners whose assets the subject touches, and of the requester/author, for smart-skip rules. */
  codeOwnerIds: string[]
  authorId: string | null
}

export type ReviewGateResult = { allowed: boolean; reasons: string[] }

/**
 * The shape a private enterprise package is expected to export as its
 * default export. `register` receives the live registry function and should
 * call it once with whichever hooks it implements.
 */
export type EnterpriseModule = {
  register: (register: (overrides: Partial<EnterpriseHooks>) => void) => void
}
