'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreVertical } from 'lucide-react'
import { DeleteProductButton } from './delete-product-button'
import { RestoreProductButton } from './restore-product-button'
import { ProductEditPanel } from './[slug]/product-edit-panel'
import { AssetCreatePanel } from './[slug]/assets-section'

type ProductSummary = {
  id: string
  slug: string
  name: string
  description: string
  tags: string[]
  archivedAt?: string | null
  assetCount: number
  planCount?: number
  releaseCount?: number
  workItemCount?: number
  specCount?: number
}

export function ProductCardMenu({ product }: { product: ProductSummary }) {
  const [editOpen, setEditOpen] = useState(false)
  const [assetOpen, setAssetOpen] = useState(false)
  const archived = !!product.archivedAt

  return (
    <>
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
          {!archived && (
            <>
              <DropdownMenuItem className="cursor-pointer" onSelect={() => setEditOpen(true)}>
                Edit Product
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" onSelect={() => setAssetOpen(true)}>
                Add Asset
              </DropdownMenuItem>
            </>
          )}
          {archived ? (
            <RestoreProductButton id={product.id} slug={product.slug} />
          ) : (
            <DeleteProductButton
              id={product.id}
              slug={product.slug}
              name={product.name}
              assetCount={product.assetCount}
              planCount={product.planCount}
              releaseCount={product.releaseCount}
              workItemCount={product.workItemCount}
              specCount={product.specCount}
            />
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ProductEditPanel product={product} open={editOpen} onOpenChange={setEditOpen} />
      <AssetCreatePanel
        productId={product.id}
        productSlug={product.slug}
        open={assetOpen}
        onOpenChange={setAssetOpen}
      />
    </>
  )
}
