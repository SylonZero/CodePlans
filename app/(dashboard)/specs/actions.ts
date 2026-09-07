'use server'
import { authAdapter } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { createSpec, updateSpec, supersedeSpec, linkSpec, unlinkSpec, listSpecs, getAssetSpecs, specInput, specUpdateInput, type SpecTargetType, type SpecRelationshipType } from '@/lib/db/specs'
import type { z } from 'zod'

async function userId() {
  const user = await authAdapter.getUser()
  if (!user) throw new Error('Unauthorized')
  return user.id
}
function refresh() { revalidatePath('/', 'layout') }
export async function listSpecsAction(productId: string, targetType?: SpecTargetType, targetId?: string) {
  const user = await userId()
  return targetType === 'asset' && targetId ? getAssetSpecs(targetId, user) : listSpecs(user, { productId, targetType, targetId })
}
export async function createSpecAction(data: z.input<typeof specInput>) {
  const spec = await createSpec(data, await userId()); refresh(); return spec
}
export async function updateSpecAction(id: string, data: z.input<typeof specUpdateInput>) {
  const spec = await updateSpec(id, data, await userId()); refresh(); return spec
}
export async function supersedeSpecAction(id: string, body: string, title?: string) {
  const spec = await supersedeSpec(id, body, title, await userId()); refresh(); return spec
}
export async function linkSpecAction(specId: string, targetType: SpecTargetType, targetId: string, relationshipType?: SpecRelationshipType) {
  const link = await linkSpec(specId, targetType, targetId, relationshipType, await userId()); refresh(); return link
}
export async function unlinkSpecAction(id: string) {
  const result = await unlinkSpec(id, await userId()); refresh(); return result
}
