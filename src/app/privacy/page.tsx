import type { Metadata } from 'next'
import Link from 'next/link'

import { LegalPage, Section } from '@/components/legal/legal-page'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'What UpSplit stores, who can see it, and how to get rid of it.',
}

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="11 September 2026">
      <Section title="The short version">
        <p>
          UpSplit stores the least it can get away with: your name, your email address, and
          the expenses you enter. There are no ads, no trackers, no analytics scripts, and
          nothing is sold or shared with advertisers. You can delete your account yourself.
        </p>
      </Section>

      <Section title="What is stored">
        <p>
          <strong className="text-foreground">Your account.</strong> Your email address and
          the name you gave, so people in your groups know who you are. A profile photo, if
          you upload one. If you sign in with Google, your name, email and profile picture
          come from Google rather than being typed in.
        </p>
        <p>
          <strong className="text-foreground">Your groups and expenses.</strong> Group names,
          expense descriptions, amounts, dates, categories, any notes or comments you write,
          and who paid for what. This is the data the app exists to hold.
        </p>
        <p>
          <strong className="text-foreground">Activity.</strong> A log of actions inside your
          groups, such as an expense being added or someone joining, so members can see what
          changed.
        </p>
        <p>
          No payment details are stored, because nothing is ever charged. No card number, bank
          account or payment credential is asked for or held.
        </p>
      </Section>

      <Section title="Who can see it">
        <p>
          Everyone in a group can see that group&rsquo;s expenses, amounts, notes and members.
          That is the point of a shared ledger, and it is worth remembering before you write
          something in a note.
        </p>
        <p>
          People outside a group cannot see any of it. This is enforced in the database with
          row-level security rather than only in the app, so a row you are not entitled to is
          not sent to your browser in the first place.
        </p>
        <p>
          Nobody&rsquo;s data is sold, rented, or shared with advertisers. There is no
          advertising business here to feed.
        </p>
      </Section>

      <Section title="Who else is involved">
        <p>
          <strong className="text-foreground">Supabase</strong> hosts the database and handles
          sign-in. Your account and your expense data live there.
        </p>
        <p>
          <strong className="text-foreground">Vercel</strong> hosts the application and, like
          any web host, keeps standard server logs including IP addresses.
        </p>
        <p>
          <strong className="text-foreground">Google</strong>, only if you choose to sign in
          with it, tells UpSplit your name, email and profile picture. UpSplit never sees your
          Google password.
        </p>
        <p>
          There is no analytics provider, no advertising network, and no third-party tracking
          script on any page.
        </p>
      </Section>

      <Section title="Email">
        <p>
          UpSplit does not currently send any email of its own. Notifications appear inside
          the app only.
        </p>
        <p>
          Supabase sends the messages that sign-in requires, such as confirming your address
          or resetting your password. If email notifications are added later, this page will
          say so before they start.
        </p>
      </Section>

      <Section title="Cookies">
        <p>
          One kind only: the session cookie that keeps you signed in. There are no advertising
          or tracking cookies, so there is no cookie banner to dismiss. Signing out clears the
          session.
        </p>
        <p>
          Your theme choice is kept in your browser&rsquo;s local storage. It never reaches
          the server.
        </p>
      </Section>

      <Section title="Getting your data out, or getting rid of it">
        <p>
          Everything about you is visible in the app while you are signed in. Deleting your
          account from Settings removes you from every group and erases your name and photo.
        </p>
        <p>
          The expenses and settlements you recorded are kept and shown as{' '}
          <em>Deleted user</em>, because other people&rsquo;s balances are calculated from
          them and removing them would change what your friends owe each other. If you want
          those gone as well, everyone in the affected group has to agree to delete the group.
        </p>
        <p>
          If you want a copy of your data or have a question about any of this, email
          uzairkbrr@gmail.com.
        </p>
      </Section>

      <Section title="Children">
        <p>
          UpSplit is not aimed at children and accounts are not knowingly created for anyone
          under 13.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          If what is collected or who it is shared with changes, this page changes with it and
          the date at the top is updated. The{' '}
          <Link
            href="https://github.com/uzairtheahmad/upsplit"
            target="_blank"
            rel="noreferrer noopener"
            className="font-medium text-foreground underline underline-offset-4"
          >
            source code
          </Link>{' '}
          is public, so you can check the claims on this page against what the software
          actually does.
        </p>
        <p>
          See also the{' '}
          <Link href="/terms" className="font-medium text-foreground underline underline-offset-4">
            Terms of Service
          </Link>
          .
        </p>
      </Section>
    </LegalPage>
  )
}
