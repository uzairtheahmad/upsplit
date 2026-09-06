'use client'

import { ThemeProvider } from 'next-themes'
import { Toaster } from 'sonner'
import * as React from 'react'

import { TooltipProvider } from '@/components/ui/misc'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider delayDuration={250} skipDelayDuration={400}>
        {children}
        <Toaster
          position="bottom-right"
          closeButton
          richColors={false}
          toastOptions={{
            classNames: {
              toast:
                'group rounded-xl border border-border bg-popover text-popover-foreground card-shadow-lg',
              title: 'text-sm font-semibold',
              description: 'text-sm text-muted-foreground',
              actionButton: 'bg-primary text-primary-foreground',
              cancelButton: 'bg-muted text-muted-foreground',
            },
          }}
        />
      </TooltipProvider>
    </ThemeProvider>
  )
}
