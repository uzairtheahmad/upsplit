'use client'

import { RotateCcw } from 'lucide-react'
import Link from 'next/link'
import * as React from 'react'

import { PageContainer } from '@/components/shared/page-header'
import { ErrorState } from '@/components/shared/states'
import { Button } from '@/components/ui/button'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  React.useEffect(() => {
    // In Phase 2 this is where the error goes to the reporting service.
    console.error(error)
  }, [error])

  return (
    <PageContainer>
      <ErrorState
        title="This screen didn’t load"
        description="Something went wrong on our side. Your data is safe. Try again, or head back to the dashboard."
        action={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/dashboard">Dashboard</Link>
            </Button>
            <Button onClick={reset}>
              <RotateCcw aria-hidden />
              Try again
            </Button>
          </div>
        }
      />
    </PageContainer>
  )
}
