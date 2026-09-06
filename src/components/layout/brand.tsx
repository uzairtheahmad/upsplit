import Link from 'next/link'

import { cn } from '@/lib/utils/cn'

/** The UpSplit mark: two offsetting bars that balance out — the product idea. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground',
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" fill="none" className="size-[18px]">
        <path
          d="M4 8.5h11.5a3.5 3.5 0 0 1 0 7H4"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <path d="M8 5 4.5 8.5 8 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M16 12l3.5 3.5L16 19" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

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
        'flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className,
      )}
    >
      <BrandMark />
      <span className="text-[15px] font-semibold tracking-tight text-foreground">UpSplit</span>
    </Link>
  )
}
