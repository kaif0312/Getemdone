// Public privacy policy for Nudge (web, WhatsApp bot, Android/iOS app). Linked from Google Play and the App Store.
// Keep it true: when what we collect or who processes it changes, change this page in the same PR.
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy policy | Nudge',
  description: 'What Nudge collects, why, who processes it, and how to delete it.',
};

const UPDATED = '6 November 2026';
const CONTACT = 'ibrahim@iskaria.com';

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-10 mb-3 text-xl font-semibold text-fg-primary">{children}</h2>;
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-12 text-[15px] leading-7 text-fg-primary">
      <h1 className="text-3xl font-bold text-fg-primary">Nudge privacy policy</h1>
      <p className="mt-2 text-sm text-fg-secondary">Last updated {UPDATED}</p>

      <p className="mt-6">
        Nudge is a to-do and accountability app: you keep a list of tasks, friends you add can see your progress, and a
        coach on WhatsApp captures tasks, reminders and workouts from your messages. Nudge is made by Iskaria (Ibrahim
        Kaif). This page explains what we collect, why, who handles it for us, and how you can delete it. Questions:{' '}
        <a className="underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>

      <H>What we collect</H>
      <ul className="list-disc space-y-2 pl-5">
        <li>
          <b>Account details:</b> your name, and the phone number (WhatsApp) or e-mail address you sign in with. Optionally a
          profile photo, your city or time zone, and the times you want your morning check-in and evening recap.
        </li>
        <li>
          <b>What you put in Nudge:</b> tasks, notes, due dates, reminders, recurring habits, workouts and other progress you
          log, comments and reactions on friends&apos; tasks, and photos or files you attach.
        </li>
        <li>
          <b>WhatsApp messages to the coach:</b> the text, voice notes and photos you send to the Nudge WhatsApp number, so
          the coach can turn them into tasks and reply. If you set up medicine reminders for a family member, we store
          their name, WhatsApp number and the reminder times you give us, and their replies to those reminders.
        </li>
        <li>
          <b>Friends:</b> who you are friends with in Nudge, and which of your tasks each friend may see.
        </li>
        <li>
          <b>Files sent to the vault:</b> if you send documents, videos or saved photos to the Nudge number, they are stored
          in a Google Drive folder that belongs to the Nudge owner (see below).
        </li>
        <li>
          <b>Device data:</b> a push-notification token for your phone or browser, so we can send reminders. We do not
          collect your location, contacts, advertising ID or microphone audio in the app.
        </li>
        <li>
          <b>Calendar:</b> only if you turn on calendar sync, a private calendar feed link or a Google Calendar connection
          so your dated tasks appear in your calendar.
        </li>
      </ul>

      <H>How we use it</H>
      <ul className="list-disc space-y-2 pl-5">
        <li>To run the app: show your tasks, share progress with the friends you choose, send reminders, check-ins and recaps.</li>
        <li>To understand your WhatsApp messages: message text and voice notes are sent to Google&apos;s Gemini AI to work
          out what you asked for (add a task, log a workout, set a reminder) and to write the coach&apos;s reply.</li>
        <li>To improve the coach: we keep a copy of conversations with the coach, with e-mail addresses, long numbers and
          your name removed, to find and fix mistakes. Send <b>privacy</b> to the coach to see what is kept,{' '}
          <b>learning off</b> to stop it from then on, or <b>delete my data</b> to stop it being linked to you (see
          &quot;Deleting your data&quot;).</li>
      </ul>
      <p className="mt-3">
        We do not show ads, we do not sell or rent your data, and we do not use it to build advertising profiles.
      </p>

      <H>Who processes it for us</H>
      <ul className="list-disc space-y-2 pl-5">
        <li><b>Google Firebase</b> (Firestore, Authentication, Storage): where your account, tasks and attachments are stored.</li>
        <li><b>Google Gemini API:</b> reads WhatsApp messages to understand them and draft replies.</li>
        <li><b>Meta (WhatsApp Business Platform):</b> carries messages between you and the coach. Messages pass through
          Iskaria&apos;s console server, which relays them to Nudge.</li>
        <li><b>Google Drive:</b> stores files sent to the vault, in the Nudge owner&apos;s Drive. The owner can open those files.</li>
        <li><b>Vercel</b> (hosting), <b>Upstash</b> (timing of exact-time reminders), <b>Expo</b> and{' '}
          <b>Firebase Cloud Messaging</b> (push notifications).</li>
        <li><b>Imgflip and GIPHY:</b> the coach may fetch a meme or GIF by a short search phrase. Your messages are not sent to them.</li>
        <li><b>Google Calendar:</b> only if you connect it; Nudge then writes your dated tasks into a separate &quot;Nudge&quot; calendar.</li>
      </ul>

      <H>Security</H>
      <p>
        Data is encrypted in transit (HTTPS/TLS) and stored on Google Cloud, which encrypts it at rest. Nudge is{' '}
        <b>not</b> end-to-end encrypted: our servers and the services above read your WhatsApp messages in order to work.
        Do not send passwords, card numbers or other secrets to the coach.
      </p>

      <H>Who can see what</H>
      <p>
        Friends you add see the tasks and progress you share with them; you choose per task, and can make tasks private.
        A calendar feed link shows task titles to anyone who has the link, so keep it to yourself. The Nudge owner and
        Iskaria staff can access data when needed to run, support or fix the service.
      </p>

      <H>How long we keep it</H>
      <p>
        We keep your account data while your account exists. Deleted tasks go to a recycle bin and are then removed.
        WhatsApp conversation history used for context is kept until you delete it. When you delete your account, we
        delete your account data within 30 days, except where we must keep something by law.
      </p>

      <H>Deleting your data</H>
      <ul className="list-disc space-y-2 pl-5">
        <li>Your whole account: e-mail <a className="underline" href={`mailto:${CONTACT}`}>{CONTACT}</a> from the address
          or with the phone number on your account. We delete it within 30 days and confirm.</li>
        <li>Your WhatsApp chat history: send <b>delete my data</b> to the Nudge number (or in the app, <b>Me &rarr; Privacy
          and security &rarr; Delete my data</b>). This erases the coach&apos;s chat history and disconnects WhatsApp at
          once; your tasks stay in the app.</li>
        <li>Single tasks: delete them in the app.</li>
      </ul>
      <p className="mt-3">
        Step by step, and what is deleted: <Link className="underline" href="/delete-account">Delete your Nudge account</Link>.
      </p>

      <H>Children</H>
      <p>Nudge is not meant for children under 13, and we do not knowingly collect their data.</p>

      <H>Changes</H>
      <p>If this policy changes, we update this page and the date at the top. For a big change we will also tell you in the app or on WhatsApp.</p>

      <p className="mt-10 text-sm text-fg-secondary">
        Contact: Iskaria, <a className="underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>
      </p>
    </main>
  );
}
