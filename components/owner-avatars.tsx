import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import type { AssetOwner } from '@/lib/types'

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

/** Overlapping avatar stack for asset owners; shows up to `max` with a +N overflow chip. */
export function OwnerAvatars({
  owners,
  max = 3,
  size = 'sm',
  className,
}: {
  owners: AssetOwner[]
  max?: number
  size?: 'sm' | 'md'
  className?: string
}) {
  if (owners.length === 0) return null
  const shown = owners.slice(0, max)
  const overflow = owners.length - shown.length
  const sizeClass = size === 'sm' ? 'size-6 text-[10px]' : 'size-8 text-xs'

  return (
    <div className={cn('flex items-center -space-x-2', className)} title={`Owned by ${owners.map((o) => o.name).join(', ')}`}>
      {shown.map((owner) => (
        <Avatar key={owner.id} className={cn(sizeClass, 'ring-2 ring-background')}>
          {owner.avatarUrl && <AvatarImage src={owner.avatarUrl} alt={owner.name} />}
          <AvatarFallback className={sizeClass}>{initials(owner.name)}</AvatarFallback>
        </Avatar>
      ))}
      {overflow > 0 && (
        <div className={cn(sizeClass, 'flex items-center justify-center rounded-full bg-muted text-muted-foreground ring-2 ring-background z-10')}>
          +{overflow}
        </div>
      )}
    </div>
  )
}
