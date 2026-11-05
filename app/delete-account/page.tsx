// Public account-deletion page for Nudge. Google Play's Data safety form links here ("Delete account URL").
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Delete your account | Nudge',
  description: 'How to delete your Nudge account and data.',
};

const CONTACT = 'ibrahim@iskaria.com';

export default function DeleteAccountPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-12 text-[15px] leading-7 text-fg-primary">
      <h1 className="text-3xl font-bold text-fg-primary">Delete your Nudge account</h1>
      <p className="mt-4">Nudge is made by Iskaria.</p>

      <h2 className="mt-8 mb-3 text-xl font-semibold text-fg-primary">Delete your whole account</h2>
      <p>
        E-mail <a className="underline" href={`mailto:${CONTACT}?subject=Delete%20my%20Nudge%20account`}>{CONTACT}</a>{' '}
        (no app needed) with the subject &quot;Delete my Nudge account&quot;, from the e-mail address on your account or
        giving the WhatsApp number you use with Nudge. We delete the account and confirm by e-mail or WhatsApp within 30 days.
      </p>

      <h2 className="mt-8 mb-3 text-xl font-semibold text-fg-primary">Delete only your WhatsApp chat history</h2>
      <p>
        Send <b>delete my data</b> to the Nudge number and confirm (in the app: <b>Me &rarr; Privacy and security &rarr;
        Delete my data</b> opens that chat). This at once erases the coach&apos;s chat history with you and disconnects your
        WhatsApp number from Nudge. Your tasks stay in the app, where you can delete them yourself.
      </p>

      <h2 className="mt-10 mb-3 text-xl font-semibold text-fg-primary">What account deletion removes</h2>
      <p>
        Your account (name, phone number or e-mail, profile photo), your tasks, notes, reminders, habits, workouts,
        attachments, friend connections, push tokens, calendar links and your WhatsApp chat history with the coach.
      </p>

      <h2 className="mt-10 mb-3 text-xl font-semibold text-fg-primary">What may be kept</h2>
      <p>
        Copies of coach conversations kept to improve Nudge have your name, e-mail addresses and long numbers removed and
        are no longer linked to you after deletion. Files you sent to the vault are in the Nudge owner&apos;s Google Drive;
        ask in the same request if you want them removed too. We keep anything we must keep by law.
      </p>

      <p className="mt-10 text-sm text-fg-secondary">
        More: <Link className="underline" href="/privacy">Nudge privacy policy</Link>
      </p>
    </main>
  );
}
