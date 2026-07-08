import type { WorkItemStatus, WorkItemType } from '@/lib/types'

/**
 * A provider-agnostic snapshot of one external tracker item, produced by a
 * connector. The sync engine maps it onto a mirrored work item.
 */
export type ExternalItem = {
  externalId: string
  externalKey?: string
  externalUrl: string
  title: string
  description: string
  /** Raw provider state (e.g. GitHub "open"/"closed", a Jira status name). */
  state: string
  labels: string[]
  assigneeEmail?: string
  assigneeName?: string
  updatedAt: string // ISO
}

export type ConnectorAuth = {
  /** Secret resolved from the env var named by the integration's authRef. */
  token: string
}

/**
 * Per-connection configuration, stored in integrations.config (jsonb).
 * Each connection binds one bounded external scope to one CodePlans product.
 */
export type IntegrationConfig = {
  /** Provider-specific scope: GitHub "owner/repo", GitLab "group/project". */
  repo?: string
  /** Provider host override for self-hosted instances (e.g. GitLab). */
  baseUrl?: string
  /** Target product mirrored items are created under. */
  productId?: string
  /** Raw provider state → canonical status. Merged over the connector default. */
  statusMap?: Record<string, WorkItemStatus>
  /** Label → work item type. Merged over the connector default. */
  typeLabelMap?: Record<string, WorkItemType>
}

/** An epic-like grouping on the provider side (GitHub/GitLab: a milestone). */
export type ExternalScope = {
  id: string
  title: string
  state: string
  url?: string
}

export type ExternalPrStatus = 'draft' | 'open' | 'merged' | 'closed'

/**
 * The pluggable connector interface (mirrors the AUTH_PROVIDER / DB_PROVIDER
 * pattern). Providers implement pull-only sync; write-back is a later phase
 * of narrow explicit actions, never field-level two-way sync.
 */
export interface Connector {
  provider: string
  /** Default mapping of raw provider states onto canonical statuses. */
  defaultStatusMap: Record<string, WorkItemStatus>
  /** Incremental pull of items in the connection's scope. */
  listItems(auth: ConnectorAuth, config: IntegrationConfig, since?: Date): Promise<ExternalItem[]>
  /** Epic-like scopes a plan can be linked to (GitHub: milestones). */
  listScopes?(auth: ConnectorAuth, config: IntegrationConfig): Promise<ExternalScope[]>
  /** Items inside one scope — mirrored as a linked plan's tasks. */
  listScopeItems?(
    auth: ConnectorAuth,
    config: IntegrationConfig,
    scopeId: string,
  ): Promise<ExternalItem[]>
  /** Current status of one pull/merge request — used for PR auto-linking. */
  fetchPullRequest?(
    auth: ConnectorAuth,
    config: IntegrationConfig,
    prNumber: string,
  ): Promise<ExternalPrStatus | null>
  /**
   * If the URL is a pull/merge request in this connection's scope, return its
   * number/iid; otherwise null. Owns provider URL shapes so the sync engine
   * stays provider-neutral.
   */
  matchPrUrl?(config: IntegrationConfig, url: string): string | null
}

export type SyncResult = {
  created: number
  updated: number
  unchanged: number
  tasksCreated: number
  tasksUpdated: number
  prsUpdated: number
  error?: string
}
