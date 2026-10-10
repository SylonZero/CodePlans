// Renders an EnterprisePage (lib/ee/types.ts): content an enterprise module
// describes as plain data, so the module never ships React components. Forms
// are plain HTML posts to the module's /api/ee routes.
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { isExternalNavHref } from '@/lib/ee/nav'
import type { EnterprisePage, EnterprisePageBlock } from '@/lib/ee/types'

const NOTICE_TONES: Record<'info' | 'success' | 'warning' | 'error', string> = {
  info: 'border-border bg-muted/40 text-foreground',
  success: 'border-emerald-500/40 bg-emerald-500/10 text-foreground',
  warning: 'border-amber-500/40 bg-amber-500/10 text-foreground',
  error: 'border-destructive/40 bg-destructive/10 text-destructive',
}

function Block({ block, index }: { block: EnterprisePageBlock; index: number }) {
  switch (block.type) {
    case 'notice':
      return (
        <div role={block.tone === 'error' ? 'alert' : 'status'} className={cn('rounded-md border px-3 py-2 text-sm', NOTICE_TONES[block.tone])}>
          {block.text}
        </div>
      )
    case 'text':
      return <p className="text-sm text-muted-foreground">{block.text}</p>
    case 'facts':
      return (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {block.items.map((item) => (
            <div key={item.label}>
              <dt className="text-xs text-muted-foreground">{item.label}</dt>
              <dd className="text-sm font-medium">{item.value}</dd>
            </div>
          ))}
        </dl>
      )
    case 'form':
      return (
        <form method="post" action={block.action} className="space-y-4">
          {block.fields.map((field) =>
            field.type === 'hidden' ? (
              <input key={field.name} type="hidden" name={field.name} value={field.value ?? ''} />
            ) : (
              <div key={field.name} className="space-y-2">
                <Label htmlFor={`ee-${index}-${field.name}`}>{field.label}</Label>
                <Input
                  id={`ee-${index}-${field.name}`}
                  name={field.name}
                  type={field.type}
                  defaultValue={field.value}
                  placeholder={field.placeholder}
                  required={field.required}
                  minLength={field.minLength}
                />
                {field.hint && <p className="text-xs text-muted-foreground">{field.hint}</p>}
              </div>
            )
          )}
          <Button type="submit" variant={block.variant ?? 'default'} className={block.fields.some((f) => f.type !== 'hidden') ? 'w-full' : undefined}>
            {block.submitLabel}
          </Button>
        </form>
      )
    case 'link': {
      const external = isExternalNavHref(block.href)
      return (
        <Link
          href={block.href}
          target={external ? '_blank' : undefined}
          rel={external ? 'noopener noreferrer' : undefined}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {block.label}
        </Link>
      )
    }
  }
}

export function EnterprisePageView({ page, layout }: { page: EnterprisePage; layout: 'dashboard' | 'public' }) {
  const body = page.blocks.map((block, i) => <Block key={i} block={block} index={i} />)
  if (layout === 'public') {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{page.title}</CardTitle>
          {page.description && <CardDescription>{page.description}</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-4">{body}</CardContent>
      </Card>
    )
  }
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{page.title}</h1>
        {page.description && <p className="mt-1 text-sm text-muted-foreground">{page.description}</p>}
      </div>
      <Card>
        <CardContent className="space-y-5 pt-6">{body}</CardContent>
      </Card>
    </div>
  )
}
