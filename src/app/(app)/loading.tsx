import { PageContainer } from '@/components/shared/page-header'
import { ListSkeleton, StatCardSkeleton } from '@/components/shared/states'
import { Skeleton } from '@/components/ui/misc'

export default function AppLoading() {
  return (
    <PageContainer>
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <StatCardSkeleton key={index} />
        ))}
      </div>
      <ListSkeleton rows={6} />
      <span className="sr-only" role="status">
        Loading
      </span>
    </PageContainer>
  )
}
