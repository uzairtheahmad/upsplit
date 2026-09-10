import type { Metadata } from 'next'
import Link from 'next/link'

import { LegalPage, Section } from '@/components/legal/legal-page'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'What you can expect from UpSplit, and what it expects from you.',
}

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="11 September 2026">
      <Section title="What UpSplit is">
        <p>
          UpSplit is a free, open-source tool for tracking shared expenses between people who
          know each other. You record what was paid and by whom, and it works out who owes
          what.
        </p>
        <p>
          It is a record-keeping tool. It does not move money, hold money, process payments,
          or act as a bank, payment service or escrow. When it says you owe someone Rs 1,200,
          that is arithmetic on the numbers you entered, not a debt UpSplit is party to or can
          enforce.
        </p>
      </Section>

      <Section title="Your account">
        <p>
          You need an account to use the app, and you are responsible for what happens under
          it. Use an email address you actually control, and pick a password you do not use
          elsewhere.
        </p>
        <p>
          You must be old enough to enter into an agreement where you live. If you are using
          this on behalf of an organisation, you need to be allowed to agree to this on its
          behalf.
        </p>
      </Section>

      <Section title="What you put in">
        <p>
          The expenses, notes, group names and comments you enter are yours. You keep whatever
          rights you had in them. By entering them you allow UpSplit to store and display them
          to the other members of the groups you share, which is the entire point of the app.
        </p>
        <p>
          Do not enter anything unlawful, or anything about other people that you have no
          right to share. Remember that everyone in a group can see the expenses in it,
          including the amounts, the notes and who paid.
        </p>
      </Section>

      <Section title="Deleting your account">
        <p>
          You can delete your account from Settings at any time. Doing so removes you from
          every group and erases your name and photo.
        </p>
        <p>
          The expenses and settlements you recorded are kept, shown as{' '}
          <em>Deleted user</em>. This is deliberate: other people&rsquo;s balances are
          calculated from those records, and removing them would silently change what your
          friends owe each other. Deletion is refused while you still have an unsettled
          balance, for the same reason.
        </p>
      </Section>

      <Section title="No warranty">
        <p>
          UpSplit is provided as is, with no warranty of any kind. It is maintained by
          volunteers in their own time. It may be unavailable, it may lose data, and it may
          contain bugs, including bugs that produce a wrong number.
        </p>
        <p>
          Check the arithmetic before you settle up over anything that matters to you. To the
          fullest extent the law allows, nobody who works on UpSplit is liable for any loss
          arising from your use of it, including a payment made or not made on the basis of
          what it displayed.
        </p>
      </Section>

      <Section title="Disagreements between users">
        <p>
          If you and a friend disagree about who owes what, that is between the two of you.
          UpSplit shows the numbers that were entered; it cannot know whether they were
          entered correctly, and it will not arbitrate.
        </p>
      </Section>

      <Section title="Changes and endings">
        <p>
          These terms may change as the software does. Material changes will be reflected in
          the date at the top of this page. Continuing to use UpSplit after a change means you
          accept the new version.
        </p>
        <p>
          Accounts that are used to harass people, to break the law, or to attack the service
          may be suspended or removed.
        </p>
      </Section>

      <Section title="The code">
        <p>
          The source is public and MIT licensed. The MIT licence covers the code; this page
          covers the hosted app at this domain. You are free to run your own copy, in which
          case none of this applies to you and you are your own operator.
        </p>
      </Section>

      <Section title="Getting in touch">
        <p>
          Questions, or something on this page that looks wrong? Open an issue on{' '}
          <Link
            href="https://github.com/uzairtheahmad/upsplit"
            target="_blank"
            rel="noreferrer noopener"
            className="font-medium text-foreground underline underline-offset-4"
          >
            GitHub
          </Link>{' '}
          or email uzairkbrr@gmail.com.
        </p>
        <p>
          See also the{' '}
          <Link
            href="/privacy"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Privacy Policy
          </Link>
          .
        </p>
      </Section>
    </LegalPage>
  )
}
