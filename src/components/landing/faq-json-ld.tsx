import { FAQ } from '@/constants/landing'

/**
 * FAQPage structured data, generated from the same array the page renders.
 *
 * Deliberately a server component: it is markup a crawler reads, never
 * something a visitor interacts with, so there is no reason to ship it in the
 * client bundle alongside the interactive accordion.
 *
 * Search engines penalise structured data that disagrees with what a visitor
 * sees, so there is only one copy of this content — change the FAQ constant
 * and both the page and this move together.
 */
export function FaqJsonLd() {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  }

  return (
    <script
      type="application/ld+json"
      // The content is our own constant, not user input.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}
