'use client'

/**
 * The last-resort error boundary.
 *
 * Next.js requires this to exist to catch errors thrown by the *root* layout
 * and by any layout above a segment's own error.tsx — a segment's error
 * boundary cannot catch an error thrown by the layout it sits beside. Without
 * it the App Router has nowhere to render a failure and reports "missing
 * required error components, refreshing...", which loops instead of telling
 * you what went wrong.
 *
 * It replaces the whole document, so it must render its own <html> and <body>
 * and cannot rely on any provider, theme or component from the app.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          background: '#fafaf9',
          color: '#1c1917',
        }}
      >
        <div style={{ maxWidth: '34rem', width: '100%' }}>
          <h1 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 0.5rem' }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#57534e', margin: '0 0 1rem' }}>
            UpSplit hit an error it could not recover from.
          </p>

          <pre
            style={{
              fontSize: '0.75rem',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              background: '#f5f5f4',
              border: '1px solid #e7e5e4',
              borderRadius: '0.5rem',
              padding: '0.75rem',
              margin: '0 0 1rem',
            }}
          >
            {error.message}
            {error.digest ? `\n\ndigest: ${error.digest}` : ''}
          </pre>

          <button
            type="button"
            onClick={() => reset()}
            style={{
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: 500,
              padding: '0.5rem 1rem',
              borderRadius: '0.5rem',
              border: '1px solid #d6d3d1',
              background: '#ffffff',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
