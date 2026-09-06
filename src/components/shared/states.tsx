import { AlertCircle, type LucideIcon } from 'lucide-react'
import * as React from 'react'

import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/misc'
import { cn } from '@/lib/utils/cn'

/** The three states every list and panel in the app has to cover. */

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  action?: React.ReactNode
  className?: string
  /** Tighter padding for empty states inside a card. */
  compact?: boolean
}

function EmptyState({ icon: Icon, title, description, action, className, compact }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 text-center',
        compact ? 'gap-2 px-6 py-8' : 'gap-3 px-6 py-14',
        className,
      )}
    >
      <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  )
}

function ErrorState({
  title = 'Something went wrong',
  description,
  action,
  className,
}: {
  title?: string
  description: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-5 sm:flex-row sm:items-center',
        className,
      )}
    >
      <AlertCircle className="size-5 shrink-0 text-destructive" aria-hidden />
      <div className="flex-1 space-y-0.5">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  )
}

/* ── Loading skeletons ────────────────────────────────────────────────────── */

function StatCardSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-3 w-24" />
      </CardContent>
    </Card>
  )
}

function ListRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Skeleton className="size-9 shrink-0 rounded-lg" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-40" />
        <Skeleton className="h-3 w-24" />
      </div>
      <Skeleton className="h-5 w-16" />
    </div>
  )
}

function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Card className="divide-y divide-border" aria-busy>
      {Array.from({ length: rows }, (_, index) => (
        <ListRowSkeleton key={index} />
      ))}
    </Card>
  )
}

function ChartSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex h-64 items-end gap-2 px-2', className)} aria-busy>
      {[45, 70, 35, 85, 60, 95, 50].map((height, index) => (
        <Skeleton key={index} className="flex-1 rounded-t-md" style={{ height: `${height}%` }} />
      ))}
    </div>
  )
}

export { ChartSkeleton, EmptyState, ErrorState, ListRowSkeleton, ListSkeleton, StatCardSkeleton }
