'use client'

import { ChevronDown } from 'lucide-react'
import * as React from 'react'

import { FAQ } from '@/constants/landing'
import { cn } from '@/lib/utils/cn'

/**
 * The FAQ accordion.
 *
 * Built from buttons rather than <details>/<summary>, because a native
 * disclosure cannot animate closed — the browser removes the content the
 * instant `open` is dropped, so only the opening direction could ever be
 * smooth.
 *
 * The height transition uses grid-template-rows 0fr → 1fr, which animates to
 * the content's natural height without measuring it in JavaScript. Under
 * prefers-reduced-motion the global reset in globals.css collapses the
 * duration, so it snaps instead.
 *
 * Accessibility is the same contract a native disclosure gives: a real button,
 * aria-expanded, and aria-controls pointing at a region labelled by the
 * question.
 */
export function Faq() {
  const [open, setOpen] = React.useState<string | null>(null)

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
      {FAQ.map((item) => {
        const id = item.question.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '')
        const isOpen = open === item.question

        return (
          <li key={item.question}>
            <h3>
              <button
                type="button"
                id={`faq-q-${id}`}
                aria-expanded={isOpen}
                aria-controls={`faq-a-${id}`}
                onClick={() => setOpen(isOpen ? null : item.question)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-medium transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                {item.question}
                <ChevronDown
                  className={cn(
                    'size-4 shrink-0 text-muted-foreground transition-transform duration-200',
                    isOpen && 'rotate-180',
                  )}
                  aria-hidden
                />
              </button>
            </h3>

            <div
              id={`faq-a-${id}`}
              role="region"
              aria-labelledby={`faq-q-${id}`}
              // grid + minmax(0,Nfr) is what makes an unknown height animatable.
              className={cn(
                'grid transition-[grid-template-rows] duration-300 ease-out',
                isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
              )}
            >
              {/* The row must clip, or the text spills while collapsed. */}
              <div className="overflow-hidden">
                <p
                  className={cn(
                    'px-5 pb-4 text-sm text-muted-foreground transition-opacity duration-200',
                    isOpen ? 'opacity-100' : 'opacity-0',
                  )}
                >
                  {item.answer}
                </p>
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
