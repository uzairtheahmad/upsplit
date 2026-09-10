'use client'

import * as React from 'react'

/**
 * Root-segment error boundary.
 *
 * Catches anything thrown below the root layout that a nested error.tsx did
 * not handle — including errors from the (app) layout, which (app)/error.tsx
 * cannot catch because a boundary does not cover the layout it sits beside.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  React.useEffect(() => {
    // Surface the whole error, with its stack, in the browser console.
    console.error('[UpSplit] unhandled error:', error)
  }, [error])

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-4">
        <div className="space-y-1.5">
          <h1 className="text-lg font-semibold text-foreground">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            The page could not be rendered. The details are below and in the browser console.
          </p>
        </div>

        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/40 p-3 text-xs text-foreground">
          {error.message}
          {error.digest ? `\n\ndigest: ${error.digest}` : ''}
        </pre>

        <button
          type="button"
          onClick={() => reset()}
          className="cursor-pointer rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
