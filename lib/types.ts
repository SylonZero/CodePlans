// Codeplans.ai - Type Definitions

export type UserRole = 'owner' | 'admin' | 'editor' | 'viewer'
export type BillingTier = 'free' | 'pro' | 'team' | 'enterprise'
export type AssetType = 'app' | 'service' | 'library' | 'datastore' | 'platform'
export type CodePlanStatus = 'draft' | 'active' | 'completed' | 'cancelled'
export type CodePlanType = 'refactor' | 'feature' | 'improvement' | 'bugfix'
export type TaskStatus = 'not_started' | 'in_progress' | 'done'

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

export interface Asset {
  id: string
  productId: string
  name: string
  type: AssetType
  description: string
  tags: string[]
  health: 'healthy' | 'warning' | 'critical'
  techDebtScore?: number
  repositoryUrl?: string
  documentationUrl?: string
  dependencies: string[]
  createdAt: string
}

export interface CodePlan {
  id: string
  title: string
  description: string
  productId: string
  type: CodePlanType
  status: CodePlanStatus
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
  tags: string[]
  assigneeId?: string
  estimatedEffort?: number // hours
  actualEffort?: number
  priority: 'low' | 'medium' | 'high' | 'critical'
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
  type: 'plan_created' | 'plan_completed' | 'task_completed' | 'asset_added' | 'member_joined'
  title: string
  description: string
  userId: string
  userName: string
  timestamp: string
}
