# Nudge on WhatsApp: plan (draft, 2026-11-01)

The goal is a WhatsApp bot on an Iskaria WhatsApp Business number. It lets a Nudge user manage their todo list and log
fitness from WhatsApp. It also keeps the social side of Nudge working: friends see progress, react and nudge each other.
It uses the same Firestore data as the PWA, so the app and WhatsApp stay one product.

This plan is based on a read of this repo and of the Iskaria console (`Desktop/Iskaria/app`). Code references are given
inline.

## 1. What exists today

**Nudge (this repo)**
- Next.js 16 + Firebase (Firestore, Auth, FCM), deployed on Vercel. Firebase project: `taskmanagerconnect-d02f7`.
- Task data: `tasks/{id}`, a flat collection (`lib/types.ts:229`).
  - Reactions and comments are arrays inside the task doc.
  - Friends are stored as `users.friends[]`.
  - `notifications/{id}`, and a Cloud Function on that collection sends the push (`functions/src/index.ts:13`).
- Rituals and presence:
  - The morning ritual writes `focusSessions/{uid}/sessions/{date}`.
  - Focus presence is stored in `presence/{uid}`.
- E2EE is off (`lib/config.ts:5`), so task text is plaintext. Old `e1:` rows can still be decrypted.
- **Almost all logic runs in the browser:**
  - streaks: `AuthContext.tsx:371`, recomputed only when the PWA opens;
  - reminders and check-ins: `setTimeout`s in `app/page.tsx:573-820`;
  - the one-nudge-per-day limit is kept in localStorage.

  A second client cannot rely on any of this.
- **No phone number on users. Nothing for fitness** apart from tag icons.

**Iskaria console (WhatsApp plumbing)**
- Webhook: `app/api/whatsapp/webhook/route.ts`. It checks the HMAC signature and routes by `phone_number_id` to a tenant.
  The Iskaria number is tenant `iskaria`.
- Dev-intake (voice note → PR) claims messages on that tenant, using the filter at webhook :585-595
  (`lib/dev-intake.ts:72`). This is the pattern to copy for a Nudge handler.
- Send helpers: `lib/wa-client.ts` (text, buttons ≤3, list ≤10, flows, media) and `lib/templates.ts` (templates).
- Gemini calls go through `geminiFetch` and return structured JSON output (`lib/bot/gemini.ts`). Voice notes are sent
  to Gemini directly; there is no separate speech-to-text step.
- Crons: a GitHub Actions workflow calls `/api/cron/*` every 5 min. Vercel is on the Hobby plan, so there is no
  sub-daily Vercel cron.
- **The Iskaria number (+91 81369 30719) is on coexistence.** It sends every clinic's login codes. If its quality rating
  drops, staff login breaks.

## 2. Key decisions (recommendation first)

### D1. Which number
- **Recommended: a new number on the same Iskaria WABA, Cloud API only, display name "Nudge by Iskaria".**
- Why not the shared Iskaria number:
  - It carries OTPs. A consumer bot gets blocks and reports, and those lower the number's quality rating.
  - Dev-intake swallows every text from the developer's own numbers, so you could not test Nudge from your phone.
- Fallback: use the shared number for a closed beta only, routed by an allowlist of sender numbers.

### D2. Where the bot logic lives
- **Recommended: in the Nudge repo, not in the clinic console.**
  - The console's webhook stays the single Meta webhook (one Meta app). It gets a small filter, like dev-intake: if
    `phone_number_id == NUDGE_PHONE_ID`, it forwards the raw event to Nudge `POST /api/wa/inbound`. The forward is
    HMAC-signed with a shared `NUDGE_FORWARD_SECRET` and sent in `after()`, so Meta still gets its 200 fast.
  - Nudge holds the Firebase Admin credentials and all task/fitness logic. It sends replies straight to the Graph API
    with its own system-user token, scoped to the Nudge number.
  - The clinic console never touches Nudge's Firestore, and Nudge's data never touches the clinics' Redis.
- Alternative: subscribe a separate Meta app to that WABA. This avoids the forward hop but means another app to review.
  Revisit later.

### D3. How the bot "thinks"
- **Gemini Flash-Lite with function calling.** One call turns a message (text, voice note or photo) into one or more
  actions: `add_task`, `complete_task`, `defer_task`, `list_today`, `log_workout`, `log_metric`, `nudge_friend`,
  `react`, `show_friends`, `set_reminder`, plus `reply` for chat.
- The server runs each action through **one shared domain layer** (below), never by writing to Firestore ad hoc.
- If the call fails validation, escalate to Flash. Count usage under a `nudge-bot` feature tag, like the console's
  `geminiFetch`.
- Fast paths that skip the model:
  - button and list taps (they carry ids);
  - commands: `done 2`, `today`, `undo`, `stop`.

### D4. Server-side domain layer (needed whatever else we choose)
Move the browser-only rules into `lib/server/` (Admin SDK), so the PWA, the bot and Cloud Functions all share them:
- `addTask`, `completeTask` (recurring tasks append to `recurrence.completedDates`), `deferTask`, `todayTasks`. Reuse
  `utils/taskFilter.ts` and `utils/recurrence.ts`.
- Rule validation: text 1-2000 chars, ≤5 tags, ms timestamps, `isPrivate` + `visibility` set together,
  `deleted:false`.
- `recomputeStreak(uid)` as a **Firestore trigger on task writes**. Then streaks stay right whichever client completes
  a task.
- Transactions for array fields (reactions, comments, `completedDates`).
- Store a timezone on the user (`users.timezone`). Streaks and "today" currently use the browser's local date; the
  server has no idea of it.
- `createNotification(...)` that respects `notificationSettings`, plus a server-side nudge rate limit.

## 2a. Live setup (2026-11-01): replaces §2b

The beta number is **+965 6009 1617**, owned by Ibrahim. He keeps access to the SIM only until 2026-11-02; after that,
re-verifying by SMS is impossible.

**Meta side**
- WABA "Nudge By Iskaria" `1694312582258170`, in the verified **Iskaria Operations** portfolio (`1616327536649027`).
- Phone ID `1367053206492407`, Cloud API only. The display name "Nudge by Iskaria" is in review.
- The Iskaria WABA (`1027418293425791`) could not take a second number, because it was onboarded through the
  WhatsApp Business app (coexistence).

**Console side**
- Tenant `nudge` (prefix `wa:t:nudge:`, modules templates + usage, no patient bot), connected through `/connect` in
  "API only" mode. The token is in `wa:t:nudge:account`.
- Routing is therefore `tenant.slug === "nudge"`. No sender allowlist is needed, and there is no clash with dev-intake.
- §2b below is superseded, but its "keep the move cheap" points still apply.
- The permanent number will go into this same WABA, so templates carry over.

## 2b. Decided 2026-11-01: beta on the Iskaria number, then move (superseded by §2a)

The new number comes later. The first version also uses manual fitness logs only.

**Routing**
- Nudge handles a message when the tenant is `iskaria` **and** the sender is in `NUDGE_BETA_NUMBERS`. It is checked
  next to the dev-intake filter. Everyone else on that number sees no change: clinic login codes, alerts and dev-intake
  carry on as now.

**Ibrahim's own number (both dev-intake and Nudge)**
- Default: dev-intake keeps voice notes, `task:`/`bug:` text and replies to an open draft.
- Plain text with no draft goes to Nudge. Today dev-intake claims such text and then ignores it (`isIntakeMessage`,
  `lib/dev-intake.ts:72`).
- `/nudge` and `/dev` switch where voice notes go; the choice is stored per sender.

**Keep the move cheap**
- The business number lives only in config (`NUDGE_PHONE_ID`).
- `waLinks` is keyed by the *friend's* number, so all links survive the move.
- Templates belong to the WABA. If the new number is on the same Iskaria WABA, the approved templates work there
  unchanged.

**The move**
1. Add the new number to the WABA.
2. Point `NUDGE_PHONE_ID` at it.
3. From the old number, send each friend a "we moved, tap to continue" `wa.me` link. Send it while their 24h window is
   still open, so it costs nothing.
4. Their first message to the new number opens a fresh window.

**While on the shared number**
- Friends see the display name "Iskaria".
- Friends' chats also show up in the Iskaria WhatsApp Business app on the phone (coexistence) and in the console inbox
  for tenant `iskaria`. The webhook stores messages before the split.
  - Either skip storing Nudge messages in the clinic Redis, or accept it for the beta. Recommended: skip.
- Turn off the Business app's greeting/away messages, or friends get them too.
- Keep proactive templates to the one morning check-in. The number's quality rating protects every clinic's login codes.

## 3. Data model additions
| Where | Fields |
|---|---|
| `waLinks/{waId}` | `uid, linkedAt, lastInboundAt, optIn: {checkins, friendAlerts}, muted` |
| `users/{uid}.whatsapp` | `{ waId, linkedAt }`, `timezone` |
| `waLinkCodes/{code}` | `uid, expiresAt` (10 min, single use) |
| `fitness/{uid}/days/{YYYY-MM-DD}` | `workouts[] {type, minutes, distanceKm?, sets?, source:"wa"\|"app", at}`, `steps?`, `weightKg?`, `sleepH?`, `waterL?` |
| `fitnessGoals/{uid}` | `workoutsPerWeek, stepsPerDay?, targetWeightKg?, visibility` (defaults to friends) |
| `users/{uid}.streakData` | add `fitnessStreak` |
| `waSessions/{waId}` | the last N turns plus pending context, e.g. "which task did you mean". This is the bot's short memory. |

## 4. User flows

**Linking (privacy first)**
1. The user opens PWA → Settings → "Connect WhatsApp".
2. The PWA opens `wa.me/<nudge number>?text=LINK 4F7K2Q`.
3. The bot sees the code and binds `waId` to `uid`.
4. The bot replies with a welcome and asks the user to pick a check-in time. That reply captures opt-in and timezone.
- Unknown numbers get a "sign up at nudge… and tap Connect" reply.
- A later phase can add WhatsApp-first signup that creates a stub account.

**Todo**
- "gym 6pm, call mom, finish deck by Fri" → 3 tasks, each with a parsed `deferredTo` / `dueDate`. The bot echoes a
  numbered list with an Undo button.
- `today` → a list message with ≤10 rows. Tapping a row offers Done / Tomorrow / Delete.
- Voice notes in any language work, since Gemini reads the audio directly.
- Morning check-in (a template at the user's chosen time):
  - It shows today's tasks and asks the user to pick up to 3 focus tasks. This is the existing ritual, and it writes
    `focusSessions` + `focusDate`.
  - The evening recap lists what got done and the streak count. It also fixes the bug where `completedTaskIds` was
    never written.

**Fitness**
- Free text ("ran 5k in 28 min", "chest day 45 min", "82.4 kg") → `log_workout` / `log_metric`.
- A photo of a watch or Strava screenshot → Gemini extracts the numbers and the bot confirms them before saving.
- Weekly goal progress after each log ("3/4 workouts this week").
- The fitness streak sits next to the task streak.
- Phase 2: an optional Google Fit / Health Connect import. Apple Health needs a native app, so it is out of scope.

**Social, kept inside Nudge's existing model**
- When a friend completes a shared task or logs a workout, they can get a *batched* digest, at most 1-2 a day ("Ali
  finished 4 tasks, ran 5k 🔥"). It has quick-reply buttons: 👏 React / 💬 Comment / ⚡ Nudge.
- These write the same `reactions[]`, `comments[]` and `encouragement` notifications as the PWA, so the PWA and push
  stay in sync.
- `nudge Ali` → a push to Ali (existing FCM path). If Ali has linked WhatsApp and opted in, it is also a WA message.
  That is free inside Ali's 24h window and otherwise a utility template, limited to one per pair per day.
- Weekly Sunday recap: you vs your friends on tasks completed and workouts. It is opt-in, friends only.
- Friend adds from WhatsApp need **consent**: the invite goes to the friend, who has to accept. Today's
  `addFriend` adds instantly with no consent, and the rules allow it.
- No WhatsApp group chats in v1. Everything is 1:1 with the bot, and the social graph stays in Nudge.

## 5. Proactive messaging, cost and the 24h window
- WhatsApp allows free-form replies only within 24h of the user's last message. After that, every proactive message
  (check-in, reminder, friend digest) must be an **approved template**, charged per message.
- Design for it:
  - The morning check-in is the one daily template. It always has reply buttons, so tapping one reopens the 24h window
    and everything else that day is free.
  - Reminders and digests inside the window are sent as plain messages.
  - Outside the window they are queued for the next check-in instead of costing a template each.
  - Track `lastInboundAt` per user (the console does not track it server-side).
- Templates to submit (utility):
  - `nudge_checkin` (morning, buttons);
  - `nudge_reminder` (task name + time);
  - `nudge_friend` ("{name} nudged you");
  - `nudge_digest`.

  Keep them strictly transactional; Meta re-categorises promotional-sounding templates as marketing, which costs more.
- **Scheduler: a Firebase scheduled function every 15 min.** It picks the users whose local check-in or reminder time
  falls in that slot. Nudge already runs scheduled functions, and this avoids the console's best-effort 5-min GitHub
  cron.
- Budget guard: daily caps for templates sent and Gemini calls, with an admin alert when they are exceeded.

## 6. Security fixes to do first (the bot widens exposure)
Status 2026-11-01 (branch `wa-domain`, `firestore.rules`, NOT deployed):
1. **Friends self-add: needs a callable function (open).** The rule still lets any user add themselves to anyone's
   `friends` array, because the PWA's `addFriend` (`hooks/useFriends.ts`) writes the other user's array from the
   client. Order: build the callable + `friendInvites` consent flow, switch the PWA to it, then delete the rule branch
   (a TODO sits in the rules).
2. **Private tasks readable by friends: needs a PWA query change (open).** `hooks/useTasks.ts` queries
   `userId in friends` with no visibility filter, and Firestore rejects the whole query if one matching doc is not
   readable, so tightening the rule alone breaks the friend feed. Fix together: add `where('visibility','!=','private')`
   (plus backfill legacy docs without `visibility`), then require non-private in the `areFriends` branch (snippet in
   the rules TODO).
3. **`userKeys`: done, partly.** Read is now owner or friend (was everyone); write is owner, or a friend touching only
   `friendKeys.<own uid>` (the shared-key exchange in `hooks/useEncryption.ts`). `masterKey` still lives in the same
   doc and is readable by friends: move it to an owner-only doc in a later PWA change. Test E2EE key exchange with two
   accounts on a preview before deploying.
4. **`notifications` create: done.** Needs `fromUserId == auth.uid`, or admin (bug-report replies), or the recipient
   re-creating their own (undo delete).
5. `app/api/google/*` routes have no auth check (open, not a rules item).

New collections in the same rules file: `fitness/{uid}/days/*` (owner write, owner + friends read),
`fitnessGoals/{uid}` (owner write, friends read when `visibility == 'friends'`), `waLinks`, `waLinkCodes`,
`waSessions`, `waSeen`, `nudgeLimits` (server only, all client access denied), `friendInvites` (client read only if
`fromUid` or `toUid` is you, writes server only; the social layer must use those two field names).

## 7. Phases
| Phase | Scope | Done when |
|---|---|---|
| 0 | D1-D2 decisions, new number on the WABA, Meta webhook forward, security fixes §6 | A test number round-trips "hi" through console → Nudge → reply |
| 1 | Linking, server domain layer, todo add/list/done/defer, voice notes, streak trigger, timezone | You run your own day from WhatsApp; the PWA shows the same tasks and streak |
| 2 | Morning check-in + evening recap (templates, scheduler, 24h logic), reminders | 7 days of check-ins with no missed or duplicate sends |
| 3 | Fitness: logs, goals, photo extraction, fitness streak, PWA fitness card | Workouts logged on WA show in the PWA, and friends see them |
| 4 | Social: friend digest, react/comment/nudge from WA, consented friend invite, weekly recap | Two linked friends nudge and react to each other without opening the app |
| 5 | Hardening: rate limits, cost caps, eval set of ~50 messy messages, opt-out (`STOP`), data export/delete | Ready to open beyond friends and family |

## 8. Open questions for Ibrahim
Answered 2026-11-01:
- **Number:** a dedicated number later; the beta runs on the Iskaria number (see §2b).
- **Audience:** friends beta first.
- **Fitness:** manual logs in v1.

Still open:
1. Is the Nudge PWA still deployed on Vercel, and under which URL / Firebase project? Neither `.env.local` nor
   `.firebaserc` is in the repo.
