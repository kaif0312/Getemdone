# Nudge native app: scope and build plan (2026-11-05)

Owner decisions (2026-11-05): a **standalone** app (not inside Iskaria Desk); **friends only** for now (TestFlight + Play
internal testing) under the owner's Apple/Google accounts; v1 = everything Nudge already has, with the best UI we can make.
Built by Sonnet subagents in waves (below).

## 1. What the app is for
WhatsApp is where people **capture**: add tasks, log workouts, get reminders, send files. Most usage stays there.
The app is where people **look and connect**: things that need a screen and can't live in a 1:1 bot chat.
- **Friends**: who did what today, react, comment, nudge, streaks side by side. (Groups API is blocked, `WHATSAPP_BOT_PLAN.md` §4a.)
- **Progress**: streak calendar, week stats, fitness charts and goals.
- **The full task tool**: subtasks, recurrence, notes, attachments, visibility, recycle bin: too fiddly for chat.
- **Settings** the bot can't show well: WhatsApp link, reminder channel, notifications, Face ID, privacy.
Every screen should nudge people back to WhatsApp for capture ("Tell the coach on WhatsApp" button), not compete with it.

## 2. v1 screens (4 tabs + a raised Add button)
1. **Today**: morning focus ritual (pick ≤3, `focusSessions`), today's list grouped Focus / Committed / Rest /
   Done, schedule strip for timed tasks, swipe right = done (haptic + coach sticker when the list is cleared), swipe left =
   tomorrow / delete. Task detail sheet: text, notes, subtasks, deadline + reminder (`dueDate`, `remindAt`), recurrence,
   tags (emoji), attachments (≤3), visibility (everyone/only/except/private + friend groups), comments + reactions.
   Evening recap sheet. Bell -> notifications inbox (`InAppNotification`).
2. **Friends**: top row of friend avatars with live focus ring (`presence/{uid}`) and streak flame; activity feed of
   friends' visible completions + workouts today; react / comment / ⚡ nudge (one per pair per day, same writes as the PWA
   and `lib/server/social.ts`); friend profile (their visible tasks, streak, week); requests with consent; add friend by
   code, QR, share link, or WhatsApp invite; friend groups.
3. **Progress**: streak hero with the coach (pose by state), heatmap calendar (`streakData.completionHistory` +
   `focusCompletionHistory`), this week vs last, fitness: workouts this week vs goal, metrics (weight / steps / sleep /
   water) charts, log-workout sheet, goals (`fitness/{uid}/days`, `fitnessGoals/{uid}`, see `lib/server/fitness.ts`).
4. **Me**: profile + photo, WhatsApp connection (status, Link via `LINK <code>`, "Open chat"), reminder channel
   (`reminderChannel`), notification settings, Face ID lock, default visibility, recycle bin, privacy (what's kept,
   delete my data), bug report, sign out.
- **Add** (raised centre button): fast sheet, one text field + chips (Today / Tomorrow / date, time, tag, visibility),
  multi-line = several tasks. Keyboard opens instantly.

**Not in v1** (later, in this order): circles (§4a of the bot plan; needs bot + rules work), home-screen widgets, share
extension ("send to Nudge"), Apple Health / Health Connect import, Google/Apple sign-in, Google Calendar, task templates,
admin dashboard (stays web).

## 3. Design direction ("tough-love coach")
- Character first, like Duolingo: the purple coach (orange headband, whistle) appears in empty states, streak, recap,
  errors. Poses: `public/stickers/*.webp` (blowing, cheer, clipboard, disappointed, flex, proud, sleepy, waiting); master art
  `docs/brand/nudge-coach.jpg` (main checkout, untracked: copy it in).
- Palette (tokens, light + dark): coach purple `#7B4FD6` (primary), headband orange `#FF6A1F` (action/streak),
  sunshine `#F7C04A` (celebration/background accents), ink `#1E1433`, cream `#FFF8EC`, success green `#2BB673`,
  danger `#E5484D`. Dark mode = ink surfaces, same accents.
- Type: Nunito (800/900 for headings and numbers, 600/700 for body) via `@expo-google-fonts/nunito`. Big confident numbers.
- Shapes: chunky, rounded (16-20 radius), tactile 3D buttons (solid bottom edge that compresses on press), thick
  progress rings. Not glassy, not gradient-mesh, no generic "AI app" look.
- Motion: Reanimated springs; check-off = strike + bounce + haptic (`expo-haptics`); list cleared = coach `cheer` +
  confetti burst; streak increments count up. Respect Reduce Motion.
- Copy voice: short, direct, a little strict ("3 left. Move."). Never cutesy, never long.
- Every screen: loading skeleton, empty state (with coach), error state with retry, dark mode, 44pt targets, safe areas.

## 4. Architecture
- `native/` in the Getemdone repo (like `Iskaria/app/native`): Expo SDK 57, expo-router, TypeScript strict, own
  package.json/lockfile; Next's tsconfig/eslint/vercel ignore it.
- **Data**: Firebase JS SDK straight to Firestore with the SAME rules and document shapes as the PWA (`lib/types.ts`,
  `hooks/useTasks.ts`, `hooks/useFriends.ts` are the reference; copy pure helpers like `utils/recurrence.ts`,
  `utils/taskFilter.ts`, streak logic). Never invent new fields where the PWA has one. Timestamps are ms numbers.
- **Encryption parity** (must): task text/comments can be `e1:` ciphertext with per-friend `friendContent`; keys in
  `userKeys/{uid}` (`utils/crypto.ts`, `hooks/useEncryption.ts`). Native implements the same AES-GCM formats
  (`@noble/ciphers` + `expo-crypto` random) and is tested against vectors produced by the web code in Node.
- **Auth**: email/password (existing users) + **Continue with WhatsApp**: app gets a code from `POST /api/app/login/start`,
  opens `wa.me/96560091617?text=LOGIN <code>`, the bot binds the code to the sender's linked uid (or creates an account
  linked to that number), the app polls `/api/app/login/poll` and receives a Firebase custom token. Free (inbound message),
  no template. Backend in the Next app (`app/api/app/*`, bot fast path).
- **Push**: Expo push tokens saved at `users/{uid}.expoPushTokens.{token} = {platform, updatedAt}`; every server sender
  that pushes today (Cloud Functions, `lib/server/reminders.ts`, social nudges) also sends to these via the Expo push API.
  Tap opens the right screen (task / friend / inbox).
- **Release**: app name "Nudge", bundle/package `com.iskaria.nudge`, EAS owner `kaifuten`, Apple team `BJ25ZY3GQ3` (same as
  Iskaria Desk, `Iskaria/app/native/docs/RELEASE.md`), channel `production`, OTA via `eas update`.
  Owner-only steps: Play Console app creation + first AAB upload, `eas submit -p ios` in a real terminal, adding testers.

## 5. Build waves
| Wave | Agent | Worktree / branch | Owns |
|---|---|---|---|
| 1 | Foundation | `~/worktrees/getemdone/native-app` `native-app` | scaffold, deps, theme + UI kit, Firebase, crypto, data hooks, auth screens, tab shell with placeholder screens |
| 1 | Server | `~/worktrees/getemdone/app-api` `app-api` | WhatsApp login API + bot `LOGIN`, Expo push sending, rules for any new fields |
| 2 | Today | branch off `native-app` | `native/app/(tabs)/today*`, `native/src/features/tasks/` |
| 2 | Friends | branch off `native-app` | `native/app/(tabs)/friends*`, `native/src/features/friends/` |
| 2 | Progress + Me | branch off `native-app` | `progress*`, `me*`, `native/src/features/{progress,fitness,settings,inbox}/` |
| 3 | Review + polish | `native-app` | merge wave 2, cross-screen polish, real-device dev build, then EAS builds |

## 6. Status
- 2026-11-05: scope agreed with the owner; waves 1-3 done on `native-app` (foundation, Today, Friends, Progress+Me,
  polish/review; screenshots `native/docs/screens/final-*`). Server side on `app-api` (WhatsApp login, friend invite/answer
  endpoints, Expo push in reminders + the `sendPushNotification` function). Neither branch is pushed.
- EAS project `@kaifuten/nudge` (`1e20a99c-af53-4651-bc2c-4bc8701e1ac9`). Firebase Android app `com.iskaria.nudge`
  created via the Management API (service account), `native/google-services.json` committed (public client config).
- 2026-11-05 done: `firestore.rules` from main deployed via the Rules API (previous ruleset `1058771b…` kept for
  rollback); PR #7 (`app-api`) merged + live; Play app "Nudge" created (app 4973616446906867575), internal testing
  release `2 (1.0.0)` published to tester list "Nudge friends"; join link
  `https://play.google.com/apps/internaltest/4700437539470821663`.
- 2026-11-06: PR #11 (Calendar, + fix: day card Add pre-fills that day via `/add?date=`) merged `b4ec8a7`; PR #15
  (Someday; fields `parkedAt`/`parkedAskedAt` match `gtd-principles`; + parking a done task refused, parked tasks off the
  Calendar) merged `6d2c695`. EAS Android build `6ff08605-3ad0-4ee9-a157-f6f61a1a866d` = versionCode 3 (1.0.0) from `6d2c695` (FINISHED; AAB copied to
  `~/Downloads/nudge-1.0.0-3.aab` and handed to the Play-listing agent for the Internal + closed testing upload).
- Android upload: `eas submit -p android` is NOT possible: EAS holds no Google service-account key (submissions or FCM V1)
  and the Firebase SA gets 403 "Google Play Android Developer API not enabled" on project 427240262615. Releases 2 and 3
  go up by hand in Play Console (download the `.aab` from the EAS build page). To automate: enable the API, create a
  Play-only SA, invite it in Play Console > Users and permissions (release to testing tracks), upload its key to EAS.
- 2026-11-06 build 4: EAS Android `db397a9e-8d77-4899-a836-d929671e093a` = versionCode 4 (1.0.0) from `c87704e` (in-app
  Delete account; Calendar; Someday), started ~03:05, still IN_QUEUE (free tier) when the uploading agent stopped. Not yet
  on Play: internal = still 3, closed "Closed testing - Alpha" draft = still `3 (1.0.0)` (not sent for review). Next: when
  FINISHED, download the AAB to `~/Downloads/nudge-1.0.0-4.aab`, internal new release (notes "Delete account inside the
  app; calendar; Someday") + roll out, closed draft: remove 3, add 4, Save (no "Send changes for review": owner does IARC
  + reviewer password first). Data safety checked: account deletion URL = `/delete-account`, which already says
  "Delete your whole account in the app" (Me -> Privacy and security -> Delete account) with e-mail fallback; no change needed.
- Live checks 2026-11-06: Firestore rules release (updated 2026-11-04 21:08Z) = main's rules minus the deny-all
  `calendarLinks`/`calendarFeeds` matches (no wildcard match, so the same effect). Functions list: SA lacks
  `cloudfunctions.functions.list`, so whether `sendPushNotification` is deployed is unverified.
- iOS 2026-11-06 (no TTY, no Apple login needed): ASC app **"Nudge: Coach To-Do"** (plain "Nudge" is taken; home-screen
  name stays "Nudge") = ascAppId `6831352171`, SKU `nudge-ios`, team BJ25ZY3GQ3 (Individual). The ASC key `WBSNS9S9HR`
  (EAS Submit, ADMIN) .p8 was fetched from EAS GraphQL to `~/.secrets/nudge/` (+ `asc.env`). EAS iOS credentials are
  remote: the team's existing distribution cert `XNNRB2VAHL` reused (shared with Iskaria Desk, unchanged), new App Store
  profile `JD3RVUB3T5` (copy in `~/.secrets/nudge/ios/`), push key `NNQAXP52N2`, ASC key set for submissions. So
  `eas build -p ios --profile production --non-interactive` and `eas submit -p ios --latest --non-interactive` now
  work (eas.json `submit.production.ios` = ascAppId + appleTeamId, no secrets). First build: `ef3dea7c-1cde-4c9f-95ca-ca504c63aa6a`
  = 1.0.0 (3) from `633df8a`. TestFlight: internal group "Nudge friends" (owner ikaif0312@gmail.com, all builds),
  external group "Nudge friends external", beta review details with the play.reviewer demo login. Build 3 processed
  (ASC build `30cf9eaf-5e0d-429a-a232-89c5cd8ca718`, encryption exempt): internal = IN_BETA_TESTING (owner invited), external =
  submitted to Beta App Review (WAITING_FOR_REVIEW). Public link `https://testflight.apple.com/join/AxP91AxU` (limit 100)
  is enabled; it admits testers only after Beta App Review approves the build. How-to replay:
  `~/.claude/scripts/browser-flows/apple-asc-new-app-testflight.md`.
- Still open: `functions:sendPushNotification` deploy (needs `firebase login`; the service account lacks actAs),
  FCM V1 key on EAS (`eas credentials -p android` -> FCM V1 -> `~/.secrets/nudge/firebase-sa.json`), friends' emails on the tester lists
  (Play + TestFlight external group). The list below is the original.
- **Blocking a working beta (owner):** deploy `firestore.rules` (live rules are from 2026-02: no presence/fitness/
  focusSessions/friendInvites) and `functions` (`firebase deploy --only firestore:rules,functions:sendPushNotification`);
  merge `app-api` (Vercel deploy) so WhatsApp sign-in and friend invites work; upload the FCM V1 key to EAS
  (`eas credentials -p android` -> FCM V1 -> `~/.secrets/nudge/firebase-sa.json`) for Android push; first iOS build
  interactively (`eas build -p ios --profile production`, Apple login creates the bundle id/profile), then
  `eas submit -p ios --latest`; create the Play app and upload the first AAB to Internal testing.
