import { ImageResponse } from 'next/og'

import { HEADLINE } from '@/constants/landing'

export const alt = 'UpSplit: shared expenses, settled'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/**
 * The share card, generated at build time by next/og — no binary asset to keep
 * in sync with the copy, and no new dependency (next/og ships with Next).
 *
 * Colours are hard-coded rather than read from CSS custom properties: this
 * renders in Satori, outside the browser, where the stylesheet does not exist.
 * They mirror the dark theme in globals.css.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#17181f',
          color: '#f4f4f5',
          padding: 72,
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', fontSize: 30, fontWeight: 600, letterSpacing: -0.5 }}>
          UpSplit
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', fontSize: 62, fontWeight: 600, letterSpacing: -2, lineHeight: 1.1 }}>
            {HEADLINE}
          </div>
          <div style={{ display: 'flex', fontSize: 28, color: '#a1a1aa' }}>
            Who owes whom, and the fewest payments to settle it.
          </div>
        </div>

        {/* A simplified ledger card — the same worked example as the page. */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            background: '#1e1f28',
            border: '1px solid #2c2d38',
            borderRadius: 16,
            padding: 28,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 24 }}>
            <span style={{ color: '#a1a1aa' }}>Souvenirs</span>
            <span style={{ fontWeight: 600 }}>Rs 3,000</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 22 }}>
            <span style={{ color: '#a1a1aa' }}>Uzair · paid, not in split</span>
            <span style={{ color: '#4ade80', fontWeight: 600 }}>+Rs 3,000</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 22 }}>
            <span style={{ color: '#a1a1aa' }}>Ali · Shaheer · Naveed</span>
            <span style={{ color: '#f87171', fontWeight: 600 }}>−Rs 1,000 each</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 22 }}>
            <span style={{ color: '#a1a1aa' }}>Adjustment</span>
            <span style={{ color: '#4ade80', fontWeight: 600 }}>Rs 0</span>
          </div>
        </div>
      </div>
    ),
    size,
  )
}
