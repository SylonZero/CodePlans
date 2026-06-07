import Link from 'next/link'
import { authAdapter } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ProductForm } from './product-form'

export default async function NewProductPage() {
  const user = await authAdapter.getUser()
  if (!user) redirect('/login')

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <Link href="/products" className="hover:text-foreground transition-colors">Products</Link>
          <span>/</span>
          <span className="text-foreground">New Product</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">New Product</h1>
        <p className="text-muted-foreground">Define a product to group your assets and code plans.</p>
      </div>
      <ProductForm />
    </div>
  )
}
