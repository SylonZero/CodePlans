import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { authAdapter } from '@/lib/auth'
import { getProduct } from '@/lib/db/queries'
import { ProductEditForm } from './product-edit-form'

export default async function EditProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const user = await authAdapter.getUser()
  if (!user) redirect('/login')

  const product = await getProduct(slug, user.id)
  if (!product) notFound()

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <Link href="/products" className="hover:text-foreground transition-colors">Products</Link>
          <span>/</span>
          <Link href={`/products/${slug}`} className="hover:text-foreground transition-colors">{product.name}</Link>
          <span>/</span>
          <span className="text-foreground">Edit</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Edit Product</h1>
        <p className="text-muted-foreground">Update product details.</p>
      </div>
      <ProductEditForm product={product} />
    </div>
  )
}
