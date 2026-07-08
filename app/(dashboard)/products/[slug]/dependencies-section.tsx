'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowRight, Plus, X, GitFork } from 'lucide-react'
import type { DependencyEdge } from '@/lib/db/queries'
import { addAssetDependencyAction, removeAssetDependencyAction } from '../../actions'

const DEPENDENCY_TYPES = [
  { value: 'depends_on', label: 'depends on' },
  { value: 'integrates_with', label: 'integrates with' },
  { value: 'aggregates', label: 'aggregates' },
] as const

const dependencyTypeStyles: Record<string, string> = {
  depends_on: 'bg-chart-1/20 text-chart-1',
  integrates_with: 'bg-chart-4/20 text-chart-4',
  aggregates: 'bg-chart-2/20 text-chart-2',
}

export function dependencyTypeLabel(value: string) {
  return DEPENDENCY_TYPES.find((t) => t.value === value)?.label ?? value
}

type AssetOption = { id: string; name: string }

export function DependenciesSection({
  productSlug,
  edges,
  assets,
}: {
  productSlug: string
  edges: DependencyEdge[]
  assets: AssetOption[]
}) {
  const [isPending, startTransition] = useTransition()
  const [sourceId, setSourceId] = useState('')
  const [targetId, setTargetId] = useState('')
  const [depType, setDepType] = useState<string>('depends_on')
  const [description, setDescription] = useState('')

  // Group edges by source asset for a readable adjacency view
  const bySource = new Map<string, { name: string; edges: DependencyEdge[] }>()
  for (const edge of edges) {
    const group = bySource.get(edge.sourceAssetId) ?? { name: edge.sourceAssetName, edges: [] }
    group.edges.push(edge)
    bySource.set(edge.sourceAssetId, group)
  }

  function handleAdd() {
    if (!sourceId || !targetId || sourceId === targetId) return
    const fd = new FormData()
    fd.set('sourceAssetId', sourceId)
    fd.set('targetAssetId', targetId)
    fd.set('dependencyType', depType)
    fd.set('description', description)
    setDescription('')
    startTransition(() => addAssetDependencyAction(productSlug, fd))
  }

  return (
    <div className="space-y-6">
      {/* Add edge */}
      <Card className="bg-card border-border">
        <CardContent className="pt-6">
          <p className="text-sm font-medium mb-3">Add dependency</p>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <Select value={sourceId} onValueChange={setSourceId}>
              <SelectTrigger className="lg:w-[200px]">
                <SelectValue placeholder="Source asset" />
              </SelectTrigger>
              <SelectContent>
                {assets.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={depType} onValueChange={setDepType}>
              <SelectTrigger className="lg:w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEPENDENCY_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={targetId} onValueChange={setTargetId}>
              <SelectTrigger className="lg:w-[200px]">
                <SelectValue placeholder="Target asset" />
              </SelectTrigger>
              <SelectContent>
                {assets.filter((a) => a.id !== sourceId).map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              className="flex-1"
            />
            <Button
              onClick={handleAdd}
              disabled={!sourceId || !targetId || sourceId === targetId || isPending}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Adjacency list */}
      {edges.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <GitFork className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1">No dependencies mapped yet</h3>
            <p className="text-sm text-muted-foreground">
              Map how assets depend on each other to unlock impact analysis on code plans
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {[...bySource.entries()].map(([assetId, group]) => (
            <Card key={assetId} className="bg-card border-border">
              <CardContent className="pt-6">
                <h3 className="font-semibold mb-3">{group.name}</h3>
                <ul className="space-y-2">
                  {group.edges.map((edge) => (
                    <li key={edge.id} className="flex items-center gap-3 text-sm">
                      <Badge
                        variant="secondary"
                        className={dependencyTypeStyles[edge.dependencyType]}
                      >
                        {dependencyTypeLabel(edge.dependencyType)}
                      </Badge>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="font-medium">{edge.targetAssetName}</span>
                      {edge.description && (
                        <span className="text-muted-foreground truncate">— {edge.description}</span>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 ml-auto text-muted-foreground hover:text-destructive"
                        title="Remove dependency"
                        disabled={isPending}
                        onClick={() => startTransition(() => removeAssetDependencyAction(edge.id, productSlug))}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
