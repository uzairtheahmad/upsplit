import Link from 'next/link'

import { cn } from '@/lib/utils/cn'

/** The wordmark on its own — no icon. */
export function BrandLockup({
  href = '/dashboard',
  className,
}: {
  href?: string
  className?: string
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className,
      )}
    >
      <span className="text-[15px] font-semibold tracking-tight text-foreground">UpSplit</span>
    </Link>
  )
}
