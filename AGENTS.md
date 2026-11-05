# Nudge (Getemdone): agent notes

Nudge is a social todo and accountability PWA: Next.js 16, Firebase (Firestore, Auth, FCM), deployed on Vercel at
`getemdone.vercel.app`. The 2026-11 work adds a WhatsApp bot. Its plan is `docs/WHATSAPP_BOT_PLAN.md`; read §2a and §4
first.

## WhatsApp bot layout (branch `whatsapp-bot`)
- `lib/wa/types.ts` is the **contract** between the layers below. Change it only if all three layers agree.
- `lib/server/`: server-only domain code using the Admin SDK (`firebaseAdmin.ts`). It enforces the same invariants as
  `hooks/useTasks.ts` and `firestore.rules`, because Admin writes bypass the rules.
- `lib/wa/`: transport. Graph sends, linking a WhatsApp number to a user, sessions, dedupe.
- `lib/bot/`: the brain. Fast paths, then Gemini function calling, then domain calls, then a reply.
- `app/api/wa/inbound`: receives events forwarded by the Iskaria console. The body is HMAC-signed with
  `NUDGE_FORWARD_SECRET`.
- `app/api/cron/nudge`: the scheduler for check-ins, recaps and digests. GitHub Actions calls it every 15 min.
- **Coach mascot + stickers (2026-11-02):** the brand is a strict purple coach (orange headband, whistle). App icons
  and the WhatsApp profile picture use it. Eight sticker poses live in `public/stickers/<name>.webp` (512px WebP,
  transparent, < 100 KB, the WhatsApp sticker rules); `sendSticker(to, name)` in `lib/wa/send.ts` sends one by link.
  The bot sets `ctx.sticker` and core sends it after the reply: `blowing` on link, `cheer` when today's list is
  cleared, `flex` on a logged workout, `disappointed` on *stop*. A failed sticker never breaks the reply. Unused poses:
  `proud`, `clipboard`, `sleepy`, `waiting`. Source art + rejected logo rounds: `docs/brand/` in the main checkout
  (untracked).

## Coach personalities (2026-11-04, branch `coaches`)
- `lib/bot/coaches.ts`: six coaches (`buddy` default, `drill` hardcore no-excuses, `hype`, `stoic`, `zen`, `analyst`).
  Stored on `waLinks/{waId}.coach` (missing = buddy). Picked with *coach* (WhatsApp list, ids `coach:<id>`) or by asking
  ("be harder on me" -> Gemini `set_coach`). Each coach = a voice block appended to SYSTEM (`systemFor()`, static per coach
  so the prefix caches) + fixed check-in/recap lines in `scheduler.ts` (no model call). The `nudge_checkin` template is
  the same for everyone.
- **Archetypes, never real people**: no real names, likenesses or trademarked catchphrases ("Stay Hard" is a registered
  mark). Asking for a real person (e.g. "be like David Goggins") maps to the closest archetype. Every coach drops the act on
  injury/pain/illness/crisis (`coachPrompt`). The drill coach attacks excuses, never the person's body, food or worth.
- Hear them live: `GEMINI_API_KEY=... npx tsx scripts/try_coaches.mts [drill hype ...]` (fake deps, no sends).
- **Memes, GIFs, stickers** per coach (Imgflip + GIPHY, daily caps, *memes off*, kill switch `NUDGE_MEMES=off`): `docs/MEMES.md`.

## File vault (2026-11-04): people send files on WhatsApp, the bot files them in Drive
- `lib/vault/`: `vault.ts` (allowlist, naming, ack, pure and tested), `drive.ts` (Drive REST), `index.ts` (production wiring).
  `app/api/wa/inbound` calls `tryVault(msg)` right after dedupe: an allowlisted sender never reaches the todo bot and
  needs no Nudge account. Everyone else is unchanged (their documents/videos get the "I can read text, voice notes and
  photos" reply).
- **Registered users (2026-11-04):** anyone with a linked Nudge account also gets the vault, but only for FILES: documents and videos
  always; a photo only when its caption starts with `save` or `/ref` (the rest is the file name: `/ref logo ideas`) OR WhatsApp marks it
  forwarded (`context.forwarded` / `frequently_forwarded`, parsed into `InboundMessage.forwarded`); plain photos are screenshots for the to-do bot.
  Text and voice notes never reach the vault. Folder `<root>/<display name> <last 4 digits>/<yyyy-mm>/`. Logic: `registeredVaultMsg` /
  `registeredFolder` in `vault.ts` (pure, tested), wiring in `index.ts` `tryVault` (allowlist first, then linked users; one Firestore
  read only for a file message). A plain forwarded photo gets the ✅ plus, once a day per user (`waSeen/fwdnote:<wa>:<date>`), `FORWARD_NOTE`: saved to Drive, send it from the gallery (not forwarded) to have it read as tasks. `vaultFolderFor(wa)` (index.ts) resolves allowlist-or-linked for `tryVault`, `tryVaultTooBig` and `POST /api/vault/done` (so linked users' >100 MB link uploads get the audit doc + "Saved"). Kill switch: env `NUDGE_VAULT_REGISTERED=0`. Everyone's files share the owner's Drive quota and the
  owner can open all of them (privacy and storage are the owner's call).
- Allowlist: env `NUDGE_VAULT_USERS` = `971501234567:Fairooz,...` (wa id digits : name). To give someone the capability, add
  them there and redeploy. `NUDGE_VAULT_ROOT` (default `Nudge Vault`) and `NUDGE_VAULT_TZ` (default `Asia/Dubai`, used in
  file names) are optional.
- Drive layout: `<root>/<Name>/<yyyy-mm>/<yyyy-mm-dd>_<HHmm>_<caption or original name>.<ext>`. The caption becomes the
  name part. Acknowledged with a ✅ reaction on the sender's message; failures get a text asking to resend. Audit docs:
  Firestore `vaultUploads/{wamid}`.
- **Drive auth is OAuth as the owner, not a service account**: a service account has no storage quota, so uploads into a
  personal Drive fail with `storageQuotaExceeded`. Env `GDRIVE_CLIENT_ID`, `GDRIVE_CLIENT_SECRET`, `GDRIVE_REFRESH_TOKEN`
  (scope `drive.file`: the app only sees what it created). The token comes from the published "Iskaria" OAuth app in project
  `dr-jefna-gbp`, so it does not expire after 7 days like a Testing-mode app. Local copy: `~/.secrets/nudge/gdrive.env`.
  If uploads start failing with `invalid_grant`, the owner revoked it or the app was unpublished: mint a new one.
- **Files over 100 MB** never arrive: Meta sends a `failed` status with error `131052` whose `recipient_id` is the sender
  (`tooBigSenders` in `lib/wa/inbound.ts` -> `tryVaultTooBig`; an inbound message carrying `131052` is handled too). The bot then replies with a
  signed link (`lib/vault/link.ts`, 6 h, HMAC with `NUDGE_FORWARD_SECRET`) to the console's upload page
  `app.iskaria.com/vault/<token>` (env `VAULT_UPLOAD_BASE` overrides the origin). Any text from a vault user also carries the
  link; "link" alone sends only the link. The page uploads phone -> Google directly (resumable, progress) and the console then
  calls `POST /api/vault/done` here (signed), which writes the audit doc and sends "Saved to Drive". The same console API also
  serves the Iskaria app's Upload screen. Contract + details: the console's `docs/agents/vault.md`.
- The link goes out as a one-tap **"Upload to Drive" URL button** (2026-11-04: `sendUrlButton` in `lib/wa/send.ts`, Cloud API
  interactive `cta_url`, no template, so only inside the 24 h window: a text/"link" always opens it, the 131052 status does not, so a vault user
  silent for 24 h gets nothing; the text fallback hits the same wall). If Meta refuses
  it, the same body + "Upload to Drive: <link>" goes as plain text. Once the Iskaria app 1.0.3 is out (console PR #95
  `vault-applinks`, not merged on 2026-11-04), the link opens the app's upload screen (Android App Links / iOS Universal
  Links), which keeps uploading in the background; until then, and without the app, it opens the browser page.
- WhatsApp limits: documents up to 100 MB; photos sent as photos are compressed (tell people to send ID/visa scans as
  *Document*); videos sent as videos are squeezed to about 16 MB. Test: `npx tsx scripts/tests/test_vault.mts` (no emulator).

## Slash commands (2026-11-04)
`parseSlash` in `lib/bot/fastpath.ts`; no Gemini unless noted. A leading `/` works on every bare-word command (`/today`, `/list`, `/done 2`,
`/undo`, `/week`, `/friends`, `/stop`, `/start`, `/help`). New: `/task <text>` (alias `/add`; newline or `;` separates tasks; plain text is added
with no model call, text with a digit/comma/date or time word goes to Gemini with ONLY the `add_tasks` tool, raw text is the fallback, so it can
never turn into another action), `/files` (alias `/vault`; last 5 from `vaultUploads` by sender, `lib/vault/audit.ts`, no composite index), unknown
`/xyz` -> "Unknown command". Bare `list` stays today's tasks. `/ref` is only a photo/video/document caption prefix. WhatsApp has no slash menu: `/help` lists them.
- **Claude Code side:** `~/.claude/scripts/vault.mjs` (latest / get / search against Drive with `~/.secrets/nudge/gdrive.env`) and the user skill
  `vault` let a Claude session fetch what the owner just forwarded ("grab what I just sent").

## WhatsApp onboarding + adding friends by number (2026-11-05)
- `scripts/add_friend.mjs "<Name>" <digits with country code> <IANA tz>` adds a friend with no web-app signup: Firebase Auth user + `users/{uid}` + `waLinks/{waId}` (production, SA key in `~/.secrets/nudge`), with `onboarding: {step:'welcome'}`.
- `lib/bot/onboarding.ts` (`maybeOnboard`, called in `core.ts run()` right after the link lookup): their first message starts a setup chat: name (offers the WhatsApp profile name) -> city/country (`PLACES` table, else a one-tool Gemini call, then a Yes/No confirm showing local time) -> morning time -> evening recap time -> goal (tasks / fitness / both). State: `waLinks.onboarding {step, tz?, nm?}`; `null`/absent = done. Answers save to `waLinks` (timezone, checkinTime, recapTime, interest) and `setProfile` (`lib/server/users.ts`: user doc + Auth displayName). `skip` keeps a default; `setup` or `/setup` re-runs it for anyone.
- `listLinks()` skips links mid-setup, so the scheduler sends no check-in before they finish. Existing users have no `onboarding` field and are untouched.
- Test: `npx tsx scripts/tests/test_onboarding.mts` (fake deps, no emulator).

## Reminders (2026-11-04): push for app users, WhatsApp for the rest, cheap by design
- `lib/server/reminders.ts`, run by `app/api/cron/nudge` after the scheduler (same 15-min tick, so a reminder is up to 15 min
  late). Fire time = `task.remindAt` (bot: a slotted time like "gym 6pm" reminds 15 min before; "remind me 30 min before",
  "remind me at 5" via `add_tasks.remind_*` / `set_reminder`), else `task.dueDate` minus the user's own app setting
  `notificationSettings.deadlineMinutesBefore` (a 23:59 deadline = date-only, skipped). `remindSentFor` is claimed in a
  transaction first: no double sends. Deferring a task clears `remindAt`.
- Channel `users/{uid}.reminderChannel`: `auto` (default: push if the user has `fcmToken`, else WhatsApp), `app`, `whatsapp`,
  `both`; the bot sets it (`set_reminder_channel`). A dead push falls back to WhatsApp when linked. Focus mode suppresses push;
  WhatsApp STOP (`muted`) blocks WhatsApp.
- Cost: inside the 24h window = interactive message with Done / Tomorrow buttons (free). Window closed = template
  `nudge_reminder` ("{{1}}" at {{2}} today), at most `NUDGE_MAX_REMINDER_TEMPLATES_PER_USER_DAY` (default 2) per person per
  local day and inside the global `NUDGE_MAX_TEMPLATES_PER_DAY`; more are dropped, never sent paid. Only for events that are
  today (the template text says "today"). The session `lastList` is set to the task so a reply "done" resolves.
- Encrypted app task text (`e1:`) is never sent in the clear: "a task". The app's own in-app deadline timers
  (`hooks/useNotifications.ts`) still run when the app is open, so an open app may show a deadline reminder twice.
- **Exact time (2026-11-04): QStash.** Saving a `remindAt` (bot add/set) queues a QStash message for that second
  (`lib/server/qstash.ts` `scheduleFire`, Upstash-Not-Before) that calls `POST /api/reminders/fire` (signature-checked with
  `QSTASH_CURRENT/NEXT_SIGNING_KEY`, no SDK) -> `fireOne`, which sends only if `task.remindAt` still equals the queued time
  (changed/completed/deferred = 'stale'). The 15-min cron stays as the safety net and does the `dueDate` reminders; the
  `remindSentFor` claim makes both paths safe together. Resource `nudge-qstash` (Upstash QStash Free, US East, 500 messages/day,
  max 7-day delay, created via the Vercel Upstash integration on the Hobby team; creating it any other way is impossible, the
  Upstash console only manages Vercel-created resources). Env `QSTASH_URL`, `QSTASH_TOKEN`, `QSTASH_*_SIGNING_KEY` (sensitive,
  Production + Preview; they do not `vercel env pull`). No token = scheduling is a no-op (local, tests).
- Test: `FIRESTORE_PORT=8485 bash scripts/test-emulator.sh scripts/tests/test_reminders.mts`.

## Native app server side (2026-11-05): WhatsApp sign-in + Expo push
- **Continue with WhatsApp** (`lib/wa/appLogin.ts`, routes `app/api/app/login/{start,poll}`): `POST start` -> `{code, waLink, pollToken, expiresAt}`
  (6-char code, `waLink` = `wa.me/<NUDGE_WA_NUMBER>?text=LOGIN%20<code>`, 10 min; 10 starts per IP per 10 min, else 429 `{error:'rate_limited'}`;
  docs `appLogins/{pollToken}`, `appLoginCodes/{code}`, `appLoginRate/*`). `GET poll?t=` -> `{status:'pending'}` | `{status:'done', customToken}`
  (single use: the login becomes `consumed`, a second poll says `expired`) | `{status:'expired'}`; `no-store`. The bot's `tryAppLogin` runs FIRST in
  `app/api/wa/inbound` (before the vault): text `LOGIN <code>` -> linked number uses its uid, else it creates an Auth user (no email; name = WhatsApp
  profile name or "Nudge friend"), `users/{uid}` with the PWA's defaults, `userKeys/{uid}` (random 256-bit master key), `waLinks/{wa}`; replies
  "You're signed in on the Nudge app ✅" + `blowing` sticker, or "That code expired..." for a wrong/used/expired code. Only `LOGIN` + 6 chars of
  the code alphabet matches; an unknown all-lowercase word ("login please") falls through to the bot. A new account's link is created with
  `create()` (two racing LOGINs from one number share one account) and `onboarding:{step:'welcome'}` (WhatsApp setup on the next message, like
  `add_friend.mjs`; the scheduler skips it until then). PWA gating
  (`betaWhitelist`) is by email, so these accounts have none: the PWA is not meant for them. Test: `test_app_login.mts` (Auth stubbed via `deps`).
- **Friend invites for the app** (consent; `friendInvites` is server-write only): `lib/server/appAuth.ts` `uidFromRequest` verifies
  `Authorization: Bearer <Firebase ID token>`. `POST /api/app/friends/invite` body `{code}` (friend code, any case) or `{uid}` -> `200 {ok, inviteId}` |
  `401 unauthorized` | `400 bad_request` | `404 not_found` | `409 self|already_friends|already_invited`; creates the invite doc and an in-app
  `announcement` notification for the recipient (push via the Cloud Function) unless they turned notifications off; the bot's `inviteFriend`
  does the same now. `POST /api/app/friends/answer` body `{inviteId, accept}` -> `200 {ok}` | `403 not_your_invite` | `404 invite_not_found` |
  `409 invite_already_answered` (mutual add via `answerInvite`). Test: `FIRESTORE_PORT=8585 bash scripts/test-emulator.sh scripts/tests/test_app_friends.mts`.
- **Expo push** (`lib/server/expoPush.ts`): `sendExpoPush(uid | tokens[], {title, body, data:{type:'task'|'friend'|'inbox', taskId?, friendUid?}})`,
  plain `fetch` to `exp.host/--/api/v2/push/send`, batches of 100, removes `DeviceNotRegistered` tokens from `users/{uid}.expoPushTokens`
  (`{<key>: {token, platform, updatedAt}}`, written by the app; rules already let the owner write any field of their doc). Optional env
  `EXPO_ACCESS_TOKEN` (only if Expo "enhanced security" is on). Only tickets are read, not receipts.
- **Call sites** (every push in the repo): `reminders.ts` `deliver` (FCM and/or Expo; `auto` counts Expo tokens as "has push"; focus mode and
  `deadlineReminders` apply to both) and the Cloud Function `sendPushNotification` (`functions/src/index.ts`, + `functions/src/expoPush.ts`, a copy
  of the send half): comment / reaction / encouragement / announcement notifications, tap data `task` if a taskId, `friend` for encouragement, else
  `inbox`. Social nudges and bot notices only create `notifications` docs, so the function covers them. **Functions are deployed by hand**:
  `firebase deploy --only functions`. Tests: `test_expo_push.mts` (mock fetch), `test_reminders.mts` (cases 10).
## Languages: English, Hindi, Urdu, Malayalam (2026-11-05)
- `lib/bot/i18n.ts` (pure): `Lang`, `t(lang, key, params)` over the `STR` dictionary (every key has all four languages; `test_i18n.mts`
  checks that the `{placeholders}` match and button titles stay <= 20 characters), `detectLang` (script based), `parseLangName`.
- Language is `waLinks.lang` (`langManual` = chosen by hand). Auto: a text written in Malayalam / Devanagari / Urdu letters switches it
  (Arabic is NOT Urdu: only Urdu-only letters count); Latin text never switches. By hand: `language` / `/lang` (list of four), `/lang ml`,
  `language hindi`, a bare "മലയാളം" / "हिंदी" / "اردو", the `lang:xx` list row, or Gemini's `set_language` (voice: "reply in Malayalam").
  `scripts/add_friend.mjs "<Name>" <wa> <tz> ml` sets it up front.
- In use: all fixed replies in `lib/bot/actions.ts` / `core.ts` (via `ctx.t`), help, buttons, the morning check-in and evening recap
  (`scheduler.ts`; English users keep the coach voice), task reminders (`reminders.ts`), push text, and the Gemini lead-in (the prompt
  context carries `Reply language: ...`). Task text is stored as the user wrote it.
- Still English only: coach lines, onboarding, fitness-metric labels, friend reactions/nudge body, undo labels, unlinked-user hello.
- **Templates in other languages** (`scripts/create_wa_templates.mjs`, same names, `language` hi/ur/ml): `sendTemplateFallback`
  (`lib/wa/send.ts`) sends the user's language and retries in English if Meta has no approved version, so nothing breaks while approval
  is pending. `--commit` creates them on Meta: ask the owner first; run with `--lang hi` etc. or `--only <name>`, the English ones exist.
  Translations were written by Claude: a native speaker should read them (the medicine ones first).

## Medicine reminders for family (2026-11-05): `lib/server/meds.ts`, `lib/bot/care.ts`
- A parent gets a WhatsApp message in THEIR language with **Taken / Later** buttons at each dose time; one tap confirms. Not confirmed
  after 30 min: one reminder; after 90 min: status `missed` and the family member who set it up is told (their WhatsApp text inside the
  24 h window, else app push, else template `nudge_med_alert`). A tap any time later still records it ("confirmed late" to the owner).
  Owner also gets "took it" notes (`notifyTaken`, default on). A thumbs-up reaction on the reminder, or a short "kazhichu" / "കഴിച്ചു" /
  "ले ली" / "taken" reply, confirms the newest open dose; anything with a "no" in it does not (`isConfirmation`).
- Data: `medPlans/{ownerPrefix_patientWa}` and `medDoses/{planId_date_HHmm}` (see the header of `meds.ts`); both Admin-only (no client
  rules = denied). The dose doc is created once (`create`), so the 15-min cron (`runMeds`, after reminders in `app/api/cron/nudge`)
  never double-sends. A dose is still sent up to 3 h late (cron down); follow-ups are tracked for 8 h; groups medicines by time.
- The parent is a **care contact**: `waLinks.care = true`, no check-in/recap, their messages go to `handleCare` (taps, short replies,
  anything else is forwarded to the owner as a note; voice/photos as "sent a voice note"). No Gemini call, no to-do bot.
- Cost: inside the parent's 24 h window it is free (a tap reopens it for 24 h, so one tap a day keeps every dose free). Window closed =
  template `nudge_med_reminder` (their language, English fallback), at most `NUDGE_MAX_MED_TEMPLATES_PER_DAY` (default 6) per patient
  per day, not counted in the global template cap. **The first message to a parent needs the template approved, or the parent must
  message the Nudge number once ("hi")**; until then the owner is told "I couldn't reach ..." after the second failed try.
- Setup: `node scripts/med_plan.mjs --owner <owner wa> --patient <parent wa> --name "അമ്മ" --label "Amma" --lang ml --meds "BP tablet@08:00,21:00"`
  (`--dry` prints, production Firestore otherwise). The owner then manages it in chat: `/meds` (today's status), "remind Amma to take BP
  tablet at 8am and 9pm" (`add_medication`), "stop Amma's BP tablet" (`remove_medication`). People must be set up with the script first.
- Delivery time is the 15-min cron tick (GitHub Actions can run late), so a dose arrives up to ~15 min after its time.
- Tests: `scripts/tests/test_i18n.mts` (no emulator; languages + the parent's chat), `FIRESTORE_PORT=8485 bash scripts/test-emulator.sh scripts/tests/test_meds.mts`.

## Rules
- **Server-only code:** never import `lib/server/*` or `lib/wa/*` from client components.
- **Time:** use the user's IANA timezone (`users.timezone`, default `Asia/Kolkata`) for "today". Never use the server's
  clock zone.
- **Write timestamps as ms numbers**, like the app does. Do not use Firestore Timestamps.
- **Gemini:**
  - REST `generateContent`. The key is `GEMINI_API_KEY`.
  - Models come from `NUDGE_BOT_MODEL` (default `gemini-3.1-flash-lite`) and `NUDGE_BOT_FALLBACK_MODEL` (default
    `gemini-3.8-flash`). Put dynamic content such as the clock last in the prompt.
- **WhatsApp sends:** `NUDGE_WA_DRY_RUN=1` captures sends in memory and skips the call to Meta. Tests always set it.
- **Tests:** `scripts/tests/test_*.mts`, run against the Firestore emulator. Java 17 is installed and no credentials
  are needed:
  `FIRESTORE_PORT=8085 bash scripts/test-emulator.sh scripts/tests/test_x.mts`.
  Use a different port per parallel worktree.
- **Before committing:** run `npx tsc --noEmit -p .` and `npx eslint <changed files>`.
- **Never** commit secrets, push, or deploy without the owner's OK.

## Env (Vercel, server)
| Name | What |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Base64 of the service-account JSON |
| `WA_TOKEN` | Business token for the Nudge number |
| `WA_PHONE_NUMBER_ID` | `1367053206492407` |
| `NUDGE_FORWARD_SECRET` | Shared with the Iskaria console |
| `GEMINI_API_KEY` | Gemini key |
| `CRON_SECRET` | Auth for `/api/cron/nudge` |
| `NUDGE_WA_NUMBER` | `96560091617` (for `wa.me` links) |

## Calendar sync (2026-11-05): ICS feed + Google Calendar
`/sync` on WhatsApp and Me -> Calendar in the native app. Full design, scope choice, owner steps, failure handling: `docs/CALENDAR.md`.
- `lib/server/calendarEvents.ts` (which tasks become events, pure) -> `ics.ts` (feed writer) and `googleCal.ts` (OAuth, one-way sync into a
  secondary "Nudge" calendar, scope `calendar.app.created`). State in `calendarLinks/{uid}` + `calendarFeeds/{token}` (server-only rules).
- Routes: `app/api/cal/[token]` (ICS), `app/api/cal/google/{start,callback}`, `app/api/app/calendar` (native). Cron: `runCalendarSync` in `app/api/cron/nudge`.
- Bot: `syncLines` in `lib/bot/actions.ts`, `deps.calendar`. `/calendar` is NOT ours (month/week image command).
- Test: `npx tsx scripts/tests/test_calendar.mts` (no Firestore, no network).

## Calendar images (2026-11-05): `/calendar` (month) and `/cal week` (agenda) on WhatsApp
- Commands (`lib/bot/fastpath.ts` `parseCalendar`): `/calendar`, `/cal`, `/month`, `/agenda` (= week), `calendar`, `show calendar`; args `week`,
  `month`, `next`, `last`/`prev`. Reply buttons `cal:<month|week>:<offset>` walk Prev / Next and switch view (one message: image header + buttons).
  `/week` and `week` are still the FITNESS week; the calendar week is `/cal week` or `/agenda`.
- Data: `lib/calendar/events.ts` (pure, tested): `deferredTo` -> task on that day (+time); `dueDate` -> deadline (merged into the task when the
  same day); recurring tasks expand per day (`dateMatchesRecurrence`, done = `completedDates`); reminder-only tasks sit at `remindFor`;
  undated open tasks are only counted ("+ N open tasks with no date"). Weeks start Monday. In the month grid habits are dots, not chips.
- Drawing: `lib/calendar/render.tsx` uses `next/og` (satori + resvg) at 1080 px wide; fonts are committed in `lib/calendar/fonts/` (Inter, Cairo for
  Arabic, Noto Sans Malayalam; **Noto Sans Arabic and Noto Kufi break satori's shaper, "substFormat: 3"**, so don't swap them in) and shipped via
  `outputFileTracingIncludes` in `next.config.ts`. Satori has no check/arrow glyphs: draw them with CSS (see `Check`). Emoji in task text are
  fetched from the network by next/og at render time. Image heights are computed in `renderMonthPng` / `renderWeekPng`: re-check them if you
  change row sizes (`npx tsx scripts/try_calendar.mts` writes `tmp-cal/*.png`).
- Sending: `lib/calendar/send.ts` renders, uploads (`uploadMedia`), sends `sendImageButtons`; any failure returns false and the bot sends a text
  agenda instead. Tests: `scripts/tests/test_calendar_images.mts`.
