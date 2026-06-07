'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import {
  Check,
  Zap,
  Building2,
  Users,
  Package,
  FileCode2,
  CreditCard,
  Download,
} from 'lucide-react'
import type { BillingTier } from '@/lib/types'
import { cn, formatMonthYear } from '@/lib/utils'

const plans = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    description: 'For individuals getting started',
    features: [
      '1 Product',
      '3 Code Plans',
      '50 Tasks',
      'Basic analytics',
      'Community support',
    ],
    limits: { products: 1, plans: 3, tasks: 50, members: 1 },
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 29,
    description: 'For professionals and small teams',
    popular: true,
    features: [
      '10 Products',
      'Unlimited Code Plans',
      'Unlimited Tasks',
      'Advanced analytics',
      'AI assistance (Beta)',
      'Email support',
      'Up to 5 team members',
    ],
    limits: { products: 10, plans: -1, tasks: -1, members: 5 },
  },
  {
    id: 'team',
    name: 'Team',
    price: 79,
    description: 'For growing engineering teams',
    features: [
      'Unlimited Products',
      'Unlimited Code Plans',
      'Unlimited Tasks',
      'Full AI capabilities',
      'Custom integrations',
      'Priority support',
      'Up to 20 team members',
      'SSO / SAML',
    ],
    limits: { products: -1, plans: -1, tasks: -1, members: 20 },
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: -1,
    description: 'For large organizations',
    features: [
      'Everything in Team',
      'Unlimited team members',
      'Custom contracts',
      'Dedicated support',
      'On-premise deployment',
      'Advanced security',
      'SLA guarantees',
    ],
    limits: { products: -1, plans: -1, tasks: -1, members: -1 },
  },
]

const invoices = [
  { date: '2026-05-01', amount: 29, status: 'paid' },
  { date: '2026-04-01', amount: 29, status: 'paid' },
  { date: '2026-03-01', amount: 29, status: 'paid' },
]

interface Props {
  orgName: string
  billingTier: BillingTier
}

export function BillingClient({ orgName, billingTier }: Props) {
  const currentPlan = plans.find((p) => p.id === billingTier)
  const usage = { products: 3, plans: 9, tasks: 53, members: 5 }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Billing & Plans</h1>
        <p className="text-muted-foreground">
          Manage your subscription and billing information
        </p>
      </div>

      {/* Current Plan */}
      <Card className="bg-card border-border mb-8">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Current Plan</CardTitle>
              <CardDescription>
                {orgName} is on the {currentPlan?.name} plan
              </CardDescription>
            </div>
            <Badge variant="secondary" className="text-lg px-4 py-1.5 bg-accent/20 text-accent">
              {currentPlan?.name}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Products', value: usage.products, limit: currentPlan?.limits.products },
              { label: 'Code Plans', value: usage.plans, limit: currentPlan?.limits.plans },
              { label: 'Tasks', value: usage.tasks, limit: currentPlan?.limits.tasks },
              { label: 'Team Members', value: usage.members, limit: currentPlan?.limits.members },
            ].map(({ label, value, limit }) => (
              <div key={label}>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium">
                    {value}{limit !== -1 && ` / ${limit}`}
                  </span>
                </div>
                <Progress
                  value={limit === -1 ? 10 : (value / limit!) * 100}
                  className="h-2"
                />
              </div>
            ))}
          </div>

          <Separator />

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">Next billing date</p>
              <p className="text-sm text-muted-foreground">June 1, 2026</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline">
                <CreditCard className="mr-2 h-4 w-4" />
                Update Payment Method
              </Button>
              <Button variant="outline" className="text-destructive border-destructive/50 hover:bg-destructive/10">
                Cancel Subscription
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Plans */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-4">Available Plans</h2>
        <div className="grid gap-6 lg:grid-cols-4">
          {plans.map((plan) => {
            const isCurrent = plan.id === billingTier
            const isUpgrade = plans.findIndex((p) => p.id === plan.id) > plans.findIndex((p) => p.id === billingTier)

            return (
              <Card
                key={plan.id}
                className={cn(
                  'bg-card border-border relative',
                  plan.popular && 'border-accent',
                  isCurrent && 'ring-2 ring-accent'
                )}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-accent text-accent-foreground">Most Popular</Badge>
                  </div>
                )}
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {plan.id === 'free' && <Package className="h-5 w-5" />}
                    {plan.id === 'pro' && <Zap className="h-5 w-5 text-accent" />}
                    {plan.id === 'team' && <Users className="h-5 w-5" />}
                    {plan.id === 'enterprise' && <Building2 className="h-5 w-5" />}
                    {plan.name}
                  </CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-3xl font-bold">
                    {plan.price === -1 ? 'Custom' : (
                      <>${plan.price}<span className="text-sm font-normal text-muted-foreground">/month</span></>
                    )}
                  </div>
                  <ul className="space-y-2">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Check className="h-4 w-4 text-accent shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="w-full"
                    variant={isCurrent ? 'outline' : plan.popular ? 'default' : 'outline'}
                    disabled={isCurrent}
                  >
                    {isCurrent ? 'Current Plan' : isUpgrade ? 'Upgrade' : plan.price === -1 ? 'Contact Sales' : 'Downgrade'}
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Invoices */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle>Billing History</CardTitle>
          <CardDescription>Download your past invoices</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {invoices.map((invoice, i) => (
              <div key={i} className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium">{formatMonthYear(invoice.date)}</p>
                  <p className="text-sm text-muted-foreground">Pro Plan</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-medium">${invoice.amount}</span>
                  <Badge variant="secondary" className="bg-accent/20 text-accent capitalize">
                    {invoice.status}
                  </Badge>
                  <Button variant="ghost" size="sm">
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
