# Calendar sync (2026-11-05): ICS feed + Google Calendar

Goal: a task with a time ("gym 6pm") shows up in the calendar people already look at. Two ways, both set up from the
WhatsApp bot (`/sync`) AND the native app (Me -> Calendar). Capture stays in WhatsApp; the calendar is a read-only mirror.

## What goes into a calendar (`lib/server/calendarEvents.ts`, pure)
| Task has | Becomes |
|---|---|
| `deferredTo` = `YYYY-MM-DDTHH:mm` (user's zone) | 30-min timed event |
| else `remindFor` | 30-min timed event at the reminder's event time |
| else `dueDate` with a real time | 15-min timed event |
| else `dueDate` at 23:59 local (date-only deadline) | all-day "Due: ..." event (not busy) |
Not shown: completed, deleted, recurring templates, tasks with no time, a bare date, anything outside yesterday..+90 days.
`e1:` ciphertext titles show as "Nudge task" (the server cannot read them). Same function feeds both channels, so they match.

## 1. ICS feed (works everywhere, no sign-in)
- `GET /api/cal/<token>.ics` (`app/api/cal/[token]/route.ts`). The 24-byte token IS the credential: Apple/Google/Outlook
  cannot log in. Stored in `calendarLinks/{uid}.feedToken` + lookup doc `calendarFeeds/{token}` (rules deny clients).
- Rotate (`/sync reset`, app "Make a new link") deletes the old lookup doc at once. Remove = `/sync off` / app.
- Read-only and delayed by design: Apple refreshes within ~hours, Google Calendar every ~8-24 h (Google ignores
  `REFRESH-INTERVAL`). Fine for "see my plan", wrong for "alert me": WhatsApp/push reminders stay the alarm.
- Cost: one Firestore query (`userId == uid && completed == false`) per fetch, `Cache-Control: private, max-age=300`.
- Privacy: the URL shows task titles to anyone who has it. Said in the bot reply and the app.

## 2. Google Calendar (live, one-way, our server holds the connection)
- Scope **`calendar.app.created`** (+ `openid email`): Nudge creates its OWN secondary calendar "Nudge" and can only touch
  that. It never sees the user's primary calendar. Consent text: "Make secondary Google calendars, and see, create, change,
  and delete events on them". `NUDGE_GCAL_SCOPE` overrides (debug only).
- OAuth client = the one the PWA already uses (`NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, project of the PWA's
  Calendar). **Owner step:** add `https://getemdone.vercel.app/api/cal/google/callback` to that client's Authorized redirect
  URIs, and `calendar.app.created` to the consent screen's scopes. Publish the app (Testing mode kills refresh tokens after
  7 days); unverified-with-sensitive-scope shows a warning screen and caps at 100 users, fine for the friends beta.
- Flow: `startLink(uid, via)` = `/api/cal/google/start?s=<signed state, 20 min, HMAC NUDGE_FORWARD_SECRET>` -> Google ->
  `/api/cal/google/callback` (code -> refresh token, creates the calendar, saves `calendarLinks/{uid}.google`, first
  sync). `via:'wa'` ends on an HTML page + a WhatsApp confirmation; `via:'app'` redirects to `nudge://calendar?connected=1`
  (the app opens the start link with `expo-web-browser`).
- Sync (`googleCal.syncUser`): make Google match `eventsForTasks`. Event id = sha1(taskId) hex, so inserts are idempotent
  (409 -> update; update 404 because the user deleted it -> insert). `google.synced` = `{taskId: hash}` is the memory: patch
  only changed hashes, delete what disappeared (done / deleted / time removed / out of window). Max 60 writes per user per run
  (rest follows next tick). Runs: the 15-min cron (`runCalendarSync` in `app/api/cron/nudge`), once after connect, on
  "sync now" (`/sync now`, app button). So a new task reaches Google within ~15 min; use "sync now" for instant.
- Failure: `invalid_grant` (user removed access in their Google account) -> `google.revoked = true`, `lastError` shown,
  cron skips them, `/sync google` or the app reconnects. Other errors set `lastError` and retry next tick.
- Disconnect: deletes the "Nudge" calendar in Google (removes every event we wrote), revokes the token, deletes our record.
- The refresh token sits in `calendarLinks/{uid}` (server-only). The PWA's separate client-held integration
  (`hooks/useGoogleCalendar.ts`, read + create events in the Calendar tab) is untouched.

## Not built (on purpose)
Google -> Nudge (busy-time awareness, "don't ping during a meeting"), two-way edits, Gmail, other apps (Todoist, Notion).
Add only if a friend asks; each adds auth, conflict handling and support.

## Surfaces
- WhatsApp: `/sync` (menu), `/sync link`, `/sync reset`, `/sync google`, `/sync now`, `/sync off`; bare "sync calendar".
  NOT `/calendar`: that is the month/week image command (branch `calendar`).
- Native: Me -> Calendar (`native/app/me/calendar.tsx`). API: `app/api/app/calendar/route.ts` (see its header).
- Tests: `npx tsx scripts/tests/test_calendar.mts` (events, ICS, state, sync with fake Google, bot reply).
