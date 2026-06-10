'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { PRODUCT_SCOPE_COOKIE } from '@/lib/product-scope-cookie'

export async function setProductScopeAction(productId: string | null) {
  const cookieStore = await cookies()
  if (productId) {
    cookieStore.set(PRODUCT_SCOPE_COOKIE, productId, { path: '/', maxAge: 60 * 60 * 24 * 365 })
  } else {
    cookieStore.delete(PRODUCT_SCOPE_COOKIE)
  }
  revalidatePath('/', 'layout')
}
