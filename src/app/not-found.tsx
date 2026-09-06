import { Compass } from 'lucide-react'
import Link from 'next/link'

import { BrandLockup } from '@/components/layout/brand'
import { EmptyState } from '@/components/shared/states'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="p-5 sm:p-6">
        <BrandLockup href="/" />
      </div>
      <div className="flex flex-1 items-center justify-center px-4 pb-20">
        <EmptyState
          icon={Compass}
          title="We can’t find that page"
          description="The link may be out of date, or the group or expense it pointed to was deleted."
          className="max-w-md border-0 bg-transparent"
          action={
            <div className="flex gap-2">
              <Button variant="outline" asChild>
                <Link href="/">Home</Link>
              </Button>
              <Button asChild>
                <Link href="/dashboard">Go to dashboard</Link>
              </Button>
            </div>
          }
        />
      </div>
    </div>
  )
}
