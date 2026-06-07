import Link from 'next/link'
import { authAdapter } from '@/lib/auth'
import { getProducts } from '@/lib/db/queries'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, Package, FileCode2, Box, MoreVertical } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DeleteProductButton } from './delete-product-button'

export default async function ProductsPage() {
  const user = await authAdapter.getUser()
  if (!user) return null

  const products = await getProducts(user.id)

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Products</h1>
          <p className="text-muted-foreground">Manage your products and their assets</p>
        </div>
        <Button asChild>
          <Link href="/products/new">
            <Plus className="mr-2 h-4 w-4" />
            New Product
          </Link>
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {products.map((product) => (
          <Card key={product.id} className="group bg-card border-border hover:border-muted-foreground/30 transition-colors">
            <CardHeader className="flex flex-row items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <Package className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <CardTitle className="text-base">
                    <Link href={`/products/${product.slug}`} className="hover:text-accent transition-colors">
                      {product.name}
                    </Link>
                  </CardTitle>
                  <p className="text-sm text-muted-foreground line-clamp-1">{product.description}</p>
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href={`/products/${product.slug}`}>View Details</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={`/products/${product.slug}/edit`}>Edit Product</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={`/products/${product.slug}/assets/new`}>Add Asset</Link>
                  </DropdownMenuItem>
                  <DeleteProductButton id={product.id} slug={product.slug} name={product.name} />
                </DropdownMenuContent>
              </DropdownMenu>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-1.5">
                {product.tags.slice(0, 3).map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                ))}
                {product.tags.length > 3 && (
                  <Badge variant="secondary" className="text-xs">+{product.tags.length - 3}</Badge>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
                <div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Box className="h-4 w-4" />
                    <span>Assets</span>
                  </div>
                  <div className="mt-1">
                    <span className="text-lg font-semibold">{product.assetCount}</span>
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FileCode2 className="h-4 w-4" />
                    <span>Plans</span>
                  </div>
                  <div className="mt-1">
                    <span className="text-lg font-semibold">{product.activePlanCount}</span>
                    <span className="text-sm text-muted-foreground"> active</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" size="sm" className="flex-1" asChild>
                  <Link href={`/products/${product.slug}`}>View Assets</Link>
                </Button>
                <Button variant="outline" size="sm" className="flex-1" asChild>
                  <Link href={`/plans?product=${product.id}`}>View Plans</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        <Link href="/products/new">
          <Card className="flex h-full min-h-[280px] cursor-pointer items-center justify-center border-dashed bg-transparent hover:bg-muted/30 hover:border-muted-foreground/30 transition-colors">
            <CardContent className="flex flex-col items-center gap-2 text-muted-foreground">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Plus className="h-6 w-6" />
              </div>
              <span className="text-sm font-medium">Add Product</span>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  )
}
