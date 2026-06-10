import { db } from './index'
import { products, assets, codePlans, tasks } from './schema'
import { eq, and } from 'drizzle-orm'

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

type CreateProductData = {
  name: string
  slug: string
  description: string
  tags: string[]
  organizationId?: string
}

export async function createProduct(data: CreateProductData, userId: string) {
  const [product] = await db
    .insert(products)
    .values({
      ...data,
      creatorId: userId,
    })
    .returning()
  return product
}

type UpdateProductData = Partial<Pick<CreateProductData, 'name' | 'description' | 'tags'>>

export async function updateProduct(id: string, data: UpdateProductData, userId: string) {
  const [product] = await db
    .update(products)
    .set(data)
    .where(and(eq(products.id, id), eq(products.creatorId, userId)))
    .returning()
  return product ?? null
}

export async function deleteProduct(id: string, userId: string) {
  const [deleted] = await db
    .delete(products)
    .where(and(eq(products.id, id), eq(products.creatorId, userId)))
    .returning({ id: products.id })
  return deleted ?? null
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

type CreateAssetData = {
  productId: string
  name: string
  type: 'app' | 'service' | 'library' | 'datastore' | 'platform'
  description: string
  tags: string[]
  repositoryUrl?: string
  documentationUrl?: string
}

export async function createAsset(data: CreateAssetData) {
  const [asset] = await db.insert(assets).values(data).returning()
  return asset
}

type UpdateAssetData = Partial<Omit<CreateAssetData, 'productId'> & {
  health: 'healthy' | 'warning' | 'critical'
  status: 'active' | 'deprecated' | 'planned'
  techDebtScore: number
}>

export async function updateAsset(id: string, data: UpdateAssetData) {
  const [asset] = await db
    .update(assets)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(assets.id, id))
    .returning()
  return asset ?? null
}

export async function deleteAsset(id: string) {
  const [deleted] = await db
    .delete(assets)
    .where(eq(assets.id, id))
    .returning({ id: assets.id })
  return deleted ?? null
}

// ---------------------------------------------------------------------------
// Code Plans
// ---------------------------------------------------------------------------

type CreateCodePlanData = {
  title: string
  description: string
  productId: string
  type: 'refactor' | 'feature' | 'improvement' | 'bugfix'
  tags: string[]
  targetAssetIds: string[]
  startDate?: string
  endDate?: string
  deadline?: string
  assigneeIds: string[]
}

export async function createCodePlan(data: CreateCodePlanData, userId: string) {
  const [plan] = await db
    .insert(codePlans)
    .values({
      ...data,
      creatorId: userId,
      status: 'draft',
    })
    .returning()
  return plan
}

type UpdateCodePlanData = Partial<
  Omit<CreateCodePlanData, 'productId'> & {
    status: 'draft' | 'active' | 'completed' | 'cancelled'
  }
>

export async function updateCodePlan(id: string, data: UpdateCodePlanData) {
  const [plan] = await db
    .update(codePlans)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(codePlans.id, id))
    .returning()
  return plan ?? null
}

export async function deleteCodePlan(id: string, userId: string) {
  const [deleted] = await db
    .delete(codePlans)
    .where(and(eq(codePlans.id, id), eq(codePlans.creatorId, userId)))
    .returning({ id: codePlans.id })
  return deleted ?? null
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

type CreateTaskData = {
  codePlanId: string
  assetId?: string
  title: string
  description: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  tags: string[]
  assigneeId?: string
  estimatedEffort?: number
}

export async function createTask(data: CreateTaskData) {
  const [task] = await db.insert(tasks).values(data).returning()
  return task
}

type UpdateTaskData = Partial<Omit<CreateTaskData, 'codePlanId' | 'assigneeId'> & {
  status: 'not_started' | 'in_progress' | 'done'
  actualEffort: number
  assigneeId: string | null
}>

export async function updateTask(id: string, data: UpdateTaskData) {
  const [task] = await db
    .update(tasks)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(tasks.id, id))
    .returning()
  return task ?? null
}

export async function updateTaskStatus(id: string, status: 'not_started' | 'in_progress' | 'done') {
  const [task] = await db
    .update(tasks)
    .set({ status, updatedAt: new Date() })
    .where(eq(tasks.id, id))
    .returning()
  return task ?? null
}

export async function deleteTask(id: string) {
  const [deleted] = await db
    .delete(tasks)
    .where(eq(tasks.id, id))
    .returning({ id: tasks.id })
  return deleted ?? null
}
