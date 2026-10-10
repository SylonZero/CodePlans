// Shared types for the enterprise extension-point system. The OSS app depends
// only on this file and `registry.ts` — never on the private package itself —
// so the community build has zero compile-time or run-time coupling to
// proprietary code.

/** An item appended to the dashboard sidebar's secondary (settings) navigation. */
export type NavExtension = {
  id: string
  name: string
  /**
   * An in-app path (e.g. "/audit-log") or an absolute http(s) URL (e.g. a
   * hosted billing portal). Absolute URLs open in a new tab.
   */
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
  /**
   * The database for the current request or job, read synchronously on every
   * `db` access (lib/db/index.ts). Return null to use DATABASE_URL, which the
   * community default always does. The URL must use the configured
   * DB_PROVIDER. With `readOnly` set, writes throw with that text as the message.
   */
  workspaceDatabase: () => WorkspaceDatabase | null
  /**
   * Runs a database job once per workspace. Called for boot maintenance
   * (migrations, first-run checks, workspace bootstrap) and background jobs
   * (notification delivery). The community default runs the job once.
   */
  inEachWorkspace: (kind: WorkspaceJobKind, job: () => Promise<void>) => Promise<void>
  /**
   * Decides a request before the session check in proxy.ts. Return null to
   * continue as normal (the community default).
   */
  routeRequest: (request: EnterpriseRequestInfo) => EnterpriseRouteDecision | null
  /**
   * A value stored in the session token at sign-in and compared on every read,
   * so a session only works where it was issued (e.g. per workspace). The
   * community default is null: no scope.
   */
  sessionScope: () => string | null
  /**
   * Content for /ee/<path> (signed in, inside the app shell) and /p/<path>
   * (public, e.g. a sign-up page). Return null for a 404, which the community
   * default always does.
   */
  page: (request: EnterprisePageRequest) => EnterprisePage | null | Promise<EnterprisePage | null>
  /**
   * Handles /api/ee/<path> (e.g. form posts, payment webhooks). The route runs
   * without the session redirect; `user` is set when the caller is signed in.
   * Return null for a 404, which the community default always does.
   */
  handleApi: (request: EnterpriseApiRequest) => Response | null | Promise<Response | null>
  /** A banner shown at the top of every dashboard page. The community default is null. */
  workspaceNotice: () => EnterpriseNotice | null
}

export type WorkspaceDatabase = {
  url: string
  /** When set, the workspace is read-only and this is the message writes fail with. */
  readOnly?: string | null
}

export type WorkspaceJobKind = 'maintenance' | 'background'

export type EnterpriseRequestInfo = { host: string; pathname: string; search: string }

export type EnterpriseRouteDecision =
  | { action: 'next' } // continue without the session check
  | { action: 'redirect'; location: string }
  | { action: 'notFound' }

/** The signed-in user, as seen by enterprise pages and API routes. `role` is their workspace role (owner, admin, editor, viewer). */
export type EnterpriseUser = { id: string; email: string; role: string | null }

export type EnterprisePageRequest = {
  area: 'dashboard' | 'public'
  path: string[]
  searchParams: Record<string, string>
  user: EnterpriseUser | null
}

/** A page described as plain data, rendered by components/ee-page.tsx. */
export type EnterprisePage = {
  title: string
  description?: string
  blocks: EnterprisePageBlock[]
}

export type EnterprisePageBlock =
  | { type: 'notice'; tone: 'info' | 'success' | 'warning' | 'error'; text: string }
  | { type: 'text'; text: string }
  | { type: 'facts'; items: { label: string; value: string }[] }
  | { type: 'form'; action: string; submitLabel: string; fields: EnterpriseFormField[]; variant?: 'default' | 'outline' }
  | { type: 'link'; label: string; href: string }

export type EnterpriseFormField = {
  name: string
  label: string
  type: 'text' | 'email' | 'password' | 'hidden'
  value?: string
  placeholder?: string
  required?: boolean
  minLength?: number
  hint?: string
}

export type EnterpriseApiRequest = { request: Request; path: string[]; user: EnterpriseUser | null }

export type EnterpriseNotice = {
  tone: 'info' | 'warning'
  text: string
  href?: string
  linkLabel?: string
}

/**
 * Community functions an enterprise module can call, passed to `register`.
 * Database functions act on the current database, so an enterprise module runs
 * them inside its own workspace context.
 */
export type EnterpriseHost = {
  /** Applies pending migrations to the current database. */
  migrateDatabase: () => Promise<{ applied: number; total: number }>
  /** Creates the owner account and its workspace organization; returns the user id. */
  createOwnerAccount: (input: { email: string; password: string; name: string; orgName?: string }) => Promise<string>
  /** Number of members in the current database's workspace. */
  countMembers: () => Promise<number>
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
  register: (register: (overrides: Partial<EnterpriseHooks>) => void, host: EnterpriseHost) => void
}
