import { cookies } from 'next/headers'
import { PRODUCT_SCOPE_COOKIE } from '@/lib/product-scope-cookie'

/**
 * Returns the currently selected product id, or null if the user is
 * scoped to "All Products".
 */
export async function getProductScope(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get(PRODUCT_SCOPE_COOKIE)?.value || null
}
