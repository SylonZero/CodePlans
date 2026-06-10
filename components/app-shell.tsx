'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
  LayoutDashboard,
  Package,
  FileCode2,
  CheckSquare,
  BarChart3,
  Settings,
  Users,
  CreditCard,
  ChevronDown,
  Menu,
  X,
  Bell,
  Search,
  Building2,
  Layers,
} from 'lucide-react'
import { signOut } from '@/app/(auth)/actions'
import { setProductScopeAction } from '@/lib/actions/product-scope'
import type { BillingTier } from '@/lib/types'

type AppShellProps = {
  children: React.ReactNode
  user: { name: string; email: string; billingTier: BillingTier | string }
  orgName: string | null
  products: { id: string; name: string; slug: string }[]
  selectedProductId: string | null
  billingEnabled?: boolean
}

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Products', href: '/products', icon: Package },
  { name: 'Code Plans', href: '/plans', icon: FileCode2 },
  { name: 'Tasks', href: '/tasks', icon: CheckSquare },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
]

const secondaryNavigationBase = [
  { name: 'Team', href: '/team', icon: Users },
  { name: 'Billing', href: '/billing', icon: CreditCard, billingOnly: true },
  { name: 'Settings', href: '/settings', icon: Settings },
]

export function AppShell({ children, user, orgName, products, selectedProductId, billingEnabled = true }: AppShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [, startTransition] = useTransition()

  const selectedProduct = products.find((p) => p.id === selectedProductId) ?? null
  const isAllProducts = !selectedProduct

  const handleScopeChange = (productId: string | null) => {
    startTransition(async () => {
      await setProductScopeAction(productId)
      router.refresh()
    })
  }

  const secondaryNavigation = secondaryNavigationBase.filter(
    (item) => !item.billingOnly || billingEnabled
  )

  const initials = user.name
    ? user.name.split(' ').map((n) => n[0]).join('').toUpperCase()
    : '?'

  return (
    <div className="flex h-screen bg-background">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-sidebar border-r border-sidebar-border transition-transform duration-300 lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
          <div
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-sm"
            style={{ background: 'oklch(0.8 0.14 196)' }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="oklch(0.1 0 0)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m5 16-4-4 4-4" />
              <path d="m19 8 4 4-4 4" />
              <path d="m14 4-4 16" />
            </svg>
          </div>
          <span className="font-mono text-sm font-semibold tracking-tight text-sidebar-foreground">
            CodePlans<span style={{ color: 'oklch(0.8 0.14 196)' }}>.ai</span>
          </span>
          <Badge variant="secondary" className="ml-auto text-xs">Beta</Badge>
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Product Selector */}
        <div className="border-b border-sidebar-border p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="w-full justify-between text-left font-normal hover:bg-sidebar-accent">
                <div className="flex items-center gap-2 truncate">
                  <div className="flex h-6 w-6 items-center justify-center rounded bg-muted">
                    {isAllProducts ? (
                      <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <Package className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </div>
                  <span className="truncate text-sm">
                    {isAllProducts ? 'All Products' : selectedProduct?.name}
                  </span>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>Filter workspace by</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => handleScopeChange(null)}
                className={cn('cursor-pointer', isAllProducts && 'bg-accent')}
              >
                <Layers className="mr-2 h-4 w-4" />
                All Products
              </DropdownMenuItem>
              {products.length > 0 && <DropdownMenuSeparator />}
              {products.map((product) => (
                <DropdownMenuItem
                  key={product.id}
                  onClick={() => handleScopeChange(product.id)}
                  className={cn('cursor-pointer', selectedProduct?.id === product.id && 'bg-accent')}
                >
                  <Package className="mr-2 h-4 w-4" />
                  {product.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/products/new" className="cursor-pointer">
                  <span className="text-muted-foreground">+ Add Product</span>
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          <div className="space-y-1">
            {navigation.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.name}
                </Link>
              )
            })}
          </div>

          <div className="pt-6">
            <p className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Settings
            </p>
            <div className="space-y-1">
              {secondaryNavigation.map((item) => {
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                        : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.name}
                  </Link>
                )
              })}
            </div>
          </div>
        </nav>

        {/* Organization / User */}
        <div className="border-t border-sidebar-border p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="w-full justify-start gap-2 px-2 hover:bg-sidebar-accent">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex flex-col items-start text-left">
                  <span className="text-sm font-medium">{orgName ?? user.name}</span>
                  {billingEnabled && (
                    <span className="text-xs text-muted-foreground capitalize">
                      {user.billingTier} Plan
                    </span>
                  )}
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>Organization</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild><Link href="/team">Manage Team</Link></DropdownMenuItem>
              {billingEnabled && (
                <DropdownMenuItem asChild><Link href="/billing">Billing & Plans</Link></DropdownMenuItem>
              )}
              <DropdownMenuItem asChild><Link href="/settings">Settings</Link></DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Header */}
        <header className="flex h-14 items-center gap-4 border-b border-border bg-background px-4 lg:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>

          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search plans, tasks, assets..."
              className="h-9 w-full rounded-md border border-input bg-input pl-9 pr-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-border bg-muted px-1.5 text-xs text-muted-foreground">
              /
            </kbd>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 px-2">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="bg-accent text-accent-foreground text-xs">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden text-sm font-medium md:inline-block">{user.name}</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col">
                    <span>{user.name}</span>
                    <span className="text-xs font-normal text-muted-foreground">{user.email}</span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings">Profile Settings</Link>
                </DropdownMenuItem>
                {billingEnabled && (
                  <DropdownMenuItem asChild>
                    <Link href="/billing">Subscription</Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => signOut()}
                >
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 lg:p-8">{children}</main>
      </div>
    </div>
  )
}
