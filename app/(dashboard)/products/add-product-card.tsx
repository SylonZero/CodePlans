'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Plus } from 'lucide-react'
import { ProductCreateDialog } from '@/components/product-create-dialog'

export function AddProductCard() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Card
        onClick={() => setOpen(true)}
        className="flex h-full min-h-[280px] cursor-pointer items-center justify-center border-dashed bg-transparent hover:bg-muted/30 hover:border-muted-foreground/30 transition-colors"
      >
        <CardContent className="flex flex-col items-center gap-2 text-muted-foreground">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Plus className="h-6 w-6" />
          </div>
          <span className="text-sm font-medium">Add Product</span>
        </CardContent>
      </Card>
      <ProductCreateDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
