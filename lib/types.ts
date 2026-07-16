// Codeplans.ai - Type Definitions

export type UserRole = 'owner' | 'admin' | 'editor' | 'viewer'
export type BillingTier = 'free' | 'pro' | 'team' | 'enterprise'
export type AssetType = 'app' | 'service' | 'library' | 'datastore' | 'platform'
export type CodePlanStatus = 'draft' | 'active' | 'completed' | 'cancelled'
export type CodePlanType = 'refactor' | 'feature' | 'improvement' | 'bugfix'
export type TaskStatus = 'not_started' | 'in_progress' | 'done'
export type WorkItemType = 'feature' | 'bug' | 'enhancement' | 'ux' | 'tech_debt'
export type WorkItemStatus = 'open' | 'planned' | 'in_progress' | 'resolved' | 'wont_do'
export type WorkItemSeverity = 'low' | 'medium' | 'high' | 'critical'
export type ItemSource = 'native' | 'github' | 'gitlab' | 'jira' | 'asana' | 'linear'

export interface User {
  id: string
  email: string
  name: string
  avatarUrl?: string
  billingTier: BillingTier
  role: UserRole
  organizationId?: string
  featureFlags: {
    alpha?: boolean
    beta?: boolean
    aiAssistance?: boolean
  }
  createdAt: string
}

export interface Organization {
  id: string
  name: string
  slug: string
  ownerId: string
  billingTier: BillingTier
  memberCount: number
  productLimit: number
  createdAt: string
}

export interface TeamMember {
  id: string
  userId: string
  organizationId: string
  role: UserRole
  user: User
  joinedAt: string
}

export interface Product {
  id: string
  name: string
  slug: string
  description: string
  tags: string[]
  organizationId?: string
  creatorId: string
  assetCount: number
  activePlanCount: number
  createdAt: string
}

/** Declared owner of an asset (like a code owner) — routing and visibility, not an ACL. */
export interface AssetOwner {
  id: string
  name: string
  avatarUrl?: string
}

export interface Asset {
  id: string
  productId: string
  name: string
  type: AssetType
  description: string
  tags: string[]
  health: 'healthy' | 'warning' | 'critical'
  /** Manually set score (override). When unset, derivedTechDebtScore applies. */
  techDebtScore?: number
  /** Score derived from open tech-debt work items (severity-weighted, 0–100). */
  derivedTechDebtScore?: number
  /** Open tech-debt work items targeting this asset. */
  openDebtCount?: number
  owners?: AssetOwner[]
  repositoryUrl?: string
  repoPath?: string
  documentationUrl?: string
  dependencies: string[]
  createdAt: string
}

export type PrStatus = 'none' | 'draft' | 'open' | 'merged' | 'closed'

/** A code plan's per-asset row: the slice of the plan delivered in one repo/PR. */
export interface PlanAsset {
  id: string
  assetId: string
  assetName: string
  branch?: string
  prUrl?: string
  prStatus: PrStatus
  notes?: string
}

export interface CodePlan {
  id: string
  title: string
  description: string
  productId: string
  type: CodePlanType
  status: CodePlanStatus
  ownerId?: string
  specUrl?: string
  source?: ItemSource
  connectionId?: string
  externalKey?: string
  externalUrl?: string
  tags: string[]
  targetAssetIds: string[]
  startDate?: string
  endDate?: string
  deadline?: string
  progress: number
  taskCount: number
  completedTaskCount: number
  creatorId: string
  assigneeIds: string[]
  createdAt: string
  updatedAt: string
}

export interface Task {
  id: string
  codePlanId: string
  assetId?: string
  title: string
  description: string
  status: TaskStatus
  source?: ItemSource
  externalKey?: string
  externalUrl?: string
  tags: string[]
  assigneeId?: string
  percentComplete?: number
  startDate?: string
  endDate?: string
  estimatedEffort?: number // hours
  actualEffort?: number
  priority: 'low' | 'medium' | 'high' | 'critical'
  createdAt: string
  updatedAt: string
}

/**
 * The demand side of CodePlans: a feature, bug, enhancement, UX issue, or
 * tech-debt item. Native by default; when source ≠ native it mirrors an item
 * in an external tracker and its mirrored fields are read-only here.
 */
export interface WorkItem {
  id: string
  productId: string
  assetId?: string
  area?: string
  parentId?: string
  type: WorkItemType
  title: string
  description: string
  status: WorkItemStatus
  severity: WorkItemSeverity
  ownerId?: string
  specUrl?: string
  tags: string[]
  reporterId?: string
  source: ItemSource
  externalKey?: string
  externalUrl?: string
  createdAt: string
  updatedAt: string
}

export interface DashboardStats {
  totalProducts: number
  totalAssets: number
  activePlans: number
  completedPlans: number
  totalTasks: number
  completedTasks: number
  tasksThisWeek: number
  velocity: number // tasks per week
}

export interface ActivityItem {
  id: string
  type:
    | 'plan_created'
    | 'plan_activated'
    | 'plan_completed'
    | 'plan_updated'
    | 'task_created'
    | 'task_completed'
    | 'asset_added'
    | 'member_joined'
    | 'item_created'
    | 'item_resolved'
    | 'item_linked'
    | 'item_updated'
  title: string
  description: string
  userId: string
  userName: string
  timestamp: string
}
