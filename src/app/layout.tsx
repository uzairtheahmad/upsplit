import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'

import { Providers } from '@/components/layout/providers'

import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://upsplit.vercel.app'
const DESCRIPTION =
  'Track shared expenses, see exactly who owes whom, and settle up in the fewest possible payments. Free, no ads.'

export const metadata: Metadata = {
  // Makes the generated opengraph-image and icon routes resolve to absolute
  // URLs, which crawlers require.
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'UpSplit: shared expenses, settled',
    template: '%s · UpSplit',
  },
  description: DESCRIPTION,
  openGraph: {
    type: 'website',
    siteName: 'UpSplit',
    url: SITE_URL,
    title: 'UpSplit: shared expenses, settled',
    description: DESCRIPTION,
    // og:image is supplied by app/opengraph-image.tsx.
  },
  twitter: {
    card: 'summary_large_image',
    title: 'UpSplit: shared expenses, settled',
    description: DESCRIPTION,
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafafa' },
    { media: '(prefers-color-scheme: dark)', color: '#17181f' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body className="min-h-dvh font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
