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

## GTD-style nudges (2026-11-05): stale tasks, Sunday review, top 3, "Done already" (WhatsApp bot)
Four small rules taken from Getting Things Done and friends, all inside the 24 h window (free, no templates):
- **Stale-task nudge** (`sendStale` in `lib/server/scheduler.ts`): once a day at `NUDGE_STALE_TIME` (default 13:00 local) the oldest
  open task that has sat `NUDGE_STALE_DAYS` (default 5) days gets a 3-button message: *Next step* / *Tomorrow* / *Drop it*.
  Not nudged: done/deleted, recurring, scheduled for a later day, today's focus, encrypted (`e1:`) text, and anything asked
  about in the last 7 days (`task.staleNudgedAt`, written by the server only). Not on Sundays (the review covers it).
  Selection is the pure `staleTasks()` in `lib/server/tasks.ts`.
- **First small step** (`askNextStep` / `takeStep` in `lib/bot/actions.ts`): the *Next step* tap (`step:<id>`) stores
  `session.lastAction = pending_step` (20 min). The next plain one-line message (<= 200 chars, no newline/`;`, at most one comma)
  becomes the task's new text (`renameTask`, undoable via the *rename* undo); *skip*, a list, a button tap, a command or a voice note
  ends the wait and is handled normally. This is on purpose: a free-text reply must never rename a task by accident.
- **Sunday review** (`sendReview`): Sundays at `NUDGE_REVIEW_TIME` (default 17:00 local) one message with done / open / untouched-7+-days
  and a list of the 10 oldest (tap = the usual Done / Tomorrow / Delete). Data: `weekReview()` in `tasks.ts`. Window closed or an
  empty week = skipped (no template). Claims are `waSchedule/{waId}_{date}_stale|review`, once a day like check-in/recap.
- **Opt out:** *review off* / *review on* (also `/review off`) sets `waLinks.reviews`; it silences both the stale nudge and the review.
  Onboarding and muted users get neither.
- **Top 3 for today:** the morning pick (`focusPick`, `focusPrompt`, `focusSummary`) re-offers the remaining tasks after each pick with a
  *That's enough* row (`checkin:focusdone`), then shows the numbered "Your 3 for today" (so `done 1` works). `today` lists focus tasks
  first with a star; finishing the last one says so (`completeByIds`). A friend's progress ("Ali: ⭐ 2/3 focus") comes from
  `friendsActivity().focus` (only focus tasks the viewer may see; no extra reads).
- **Done already** (two-minute rule): a single plain task added for today comes back with *Done already ✅* next to *Undo* (the tap is
  the existing `done:<id>` button). In Gemini's `add_tasks`, `already_done: true` ("just paid rent") adds and ticks in one go.
- Tests: `npx tsx scripts/tests/test_gtd.mts` (bot, no emulator) and
  `FIRESTORE_PORT=8485 bash scripts/test-emulator.sh scripts/tests/test_gtd_server.mts` (stale picking, review, scheduler, friend focus).
  Run the emulator suites one per `test-emulator.sh` call: chained, they share state and `test_tasks` can fail.
- **Someday/Maybe (parked tasks):** `task.parkedAt` (set = parked). A parked task is out of Today (`shouldShowInTodayView`), has no reminder or
  focus, is never a stale candidate, is not counted as open in the review, and must stay hidden from friends. Repeating tasks cannot
  be parked. Domain: `parkTask` / `unparkTask` / `listParked` / `parkedDueForAsk` in `lib/server/tasks.ts` (`unparkTask` puts it on today and
  rests it from stale nudges for a week; an undo of a park restores its old day). WhatsApp: the *Someday 💤* button (task detail and the
  stale nudge: Next step / Someday / Drop it; the Sunday review rows `rv:<id>` open Done / Someday / Drop it), `someday` (list),
  `someday <idea>` or `/someday <idea>` (add parked), `park 2` (numbers from the last list), `bored` / `/someday pick` (three ideas,
  smallest first, rotated by day), Gemini `park_tasks` / `show_someday` / `add_tasks.someday`. Plain task detail is now
  Done / Tomorrow / Someday (Delete is *delete 2* or the *Drop it* button on stale tasks).
- **Yearly question:** Sundays after the review (`sendParkedAsk`, claim kind `parkedask`, free window only): the oldest parked task whose
  `max(parkedAt, parkedAskedAt)` is 365+ days old gets *Do it today / Keep parked / Drop it*. `parkedAskedAt` is stamped when the
  question is sent, so one task is asked about at most once a year and one task per Sunday. Parked tasks never expire otherwise.
- Not done: the native app has no stale/review/Someday UI yet; the old PWA is retired. Friends' feeds in the clients must skip parked tasks.

## Privacy + learning log (2026-11-06)
- Owner decision (2026-11-04): keep people's messages for learning, **tell them, let them opt out**. Never call the bot "end-to-end
  encrypted": the server reads every message (Meta Cloud API -> console relay -> this app -> Gemini).
- Every bot turn is also written to `learningLog/{auto}` = `{lid, at, path, user, bot}` (`lib/server/learning.ts`), text run
  through `lib/bot/scrub.ts` (e-mails, 8+ digit numbers, the person's display name; friends' names and the content itself
  are NOT removed). `lid` is a random id stored only on `waLinks/{waId}.learnId`. Server-only in `firestore.rules` (a deny rule
  equal to the default; no rules deploy needed). A failed write never breaks the reply. Care contacts (`link.care`), onboarding
  turns and vault users never reach that code, so they are not logged.
- One-time notice (`PRIVACY_NOTICE`, `waLinks.privacyNoticeAt`): new people right after the welcome, existing people after
  their next reply. `privacy` shows `PRIVACY` (`lib/bot/core.ts`); change that text if what is kept changes. English only.
- Opt-out: `learning off` / "don't save my messages" sets `waLinks.learning = false` (that turn is not logged); `learning on` resumes.
- `delete my data` / `forget me` -> Delete / Keep buttons (`forget:yes|no`) -> `forgetMe` (`lib/wa/privacy.ts`): deletes
  `waSessions/{waId}` and unlinks (the link doc holds `learnId`, so learning rows are no longer tied to the person). Tasks,
  workouts and medicine plans they set up stay with the app account. Nothing is saved or logged on that turn.
- Tests: `npx tsx scripts/tests/test_privacy.mts` (fakes), `scripts/tests/test_forget.mts` (emulator).

## Account deletion (2026-11-06): self-service, in the app
- `POST /api/app/account/delete` (`app/api/app/account/delete/route.ts`) deletes the CALLER's account: Bearer = Firebase ID token
  verified with `checkRevoked`, its `auth_time` must be < 5 min old (else 401 `reauth_required`: the app re-authenticates and calls
  again), body `{ confirm: 'DELETE' }`. 200 `{ ok, deleted, updated, kept }`; 500 `failed` = safe to retry.
- Logic: `lib/server/accountDelete.ts` `deleteAccount(uid)`. Deletes: `users`, `tasks` (+ Storage `attachments/<taskId>/`),
  `notifications` (received and sent), `bugReports` (+ Storage `bugReports/<uid>/`), `pendingSignups`, `friendInvites` (both
  directions), `nudgeLimits` (both), `userKeys`, `fitnessGoals`, `fitness/<uid>/**`, `focusSessions/<uid>/**`,
  `calendarEvents/<uid>/**`, `calendarEventVisibility`, `migrationStatus`, `presence`, `calendarLinks` + `calendarFeeds` (Google
  calendar deleted + token revoked via `googleCal.disconnect`), `medPlans` they own + their `medDoses`, `waLinkCodes`, `appLogins`,
  Storage `profilePictures/<uid>`, `betaWhitelist/<email>` (only if no other user has that e-mail), then the Auth user. For each
  WhatsApp number whose `waLinks` doc points at this uid: `waLinks`, `waSessions`, `waSchedule/<wa>_*`, `waReminderCaps/<wa>_*` and
  `med_<wa>_*`, `waSeen/fwdnote:<wa>:*`, `vaultUploads` (audit docs) and `learningLog` rows with the link's `learnId`.
  Others' docs are only updated: uid removed from `users.friends`, `userKeys.friendKeys.<uid>`, and this person's
  comments/reactions on friends' tasks. Kept: vault files in the owner's Drive (listed in `kept`), med plans where they are only the
  patient (another account's), stale uid references in friends' `friendGroups`/visibility lists.
- Retry-safe: progress in `accountDeletions/{uid}` (server-only). While running it keeps email/waIds/learnIds, so a retry after
  `users/{uid}` is gone still finds the WhatsApp data; when done it is `{ status:'done', doneAt }` only. The Auth user goes last.
  `firestore.rules` refuses `users/{uid}` create when that doc exists (an app still open would otherwise re-create the profile);
  the rule needs `npm run firebase:rules` to be live. Test: `FIRESTORE_PORT=8585 bash scripts/test-emulator.sh scripts/tests/test_account_delete.mts`.
- Speed: `deleteQuery`'s per-doc callback (one Storage listing per task) runs 16 at a time; one by one, a person with hundreds of
  tasks could pass the route's 60 s `maxDuration` and every retry would restart the same page (test case 4b: 650 tasks).
- Known gaps (2026-11-06 review): the old PWA's Google Calendar tokens (`users.googleCalendarTokens`, encrypted on the client)
  are deleted with the profile but cannot be revoked server-side; only `users/{uid}` create is guarded in the rules, so ANOTHER
  device still open with a valid ID token (up to 1 h) could re-create `presence`/`userKeys` stubs after the final sweep.
- The old admin-only callable `deleteUserAccount` (functions/) is untouched and covers fewer collections.

## Safety: report + block (2026-11-06, App Store guideline 1.2)
- `lib/server/moderation.ts`. `POST /api/app/report` body `{kind:'comment'|'user', targetUid, reason:'spam'|'harassment'|'inappropriate'|'other',
  note?, taskId?, commentId?, contentSeen?}` (Bearer ID token; taskId + commentId required for a comment) -> `200 {ok, reportId}` | `400 bad_request` |
  `401` | `404 not_found` | `409 self` | `429 rate_limited` (20 per reporter per rolling 24 h). Writes `reports/{id}` (`reporterUid, targetUid, kind,
  reason, note, taskId, commentId, commentFound, contentSeen` = what the app showed, `contentStored` = the comment text read on the server,
  `status:'open', createdAt, source:'api', alert`) and WhatsApps the owner (`NUDGE_REPORT_ALERT_WA`, default `916238952660`): free text inside his
  24 h window (`waLinks/<wa>.lastInboundAt`), else (or when the text fails) the approved `nudge_reminder` template with "<Reason> report <id>: review
  it in the reports collection". `alert` = `text|template|failed`.
- **Acting on a report (owner, within 24 h):** open `reports/<id>` in the Firebase console; remove the comment from `tasks/<taskId>.comments`,
  and for a repeat offender disable the Auth user (or run account deletion for them); set `status:'closed'` + a note. No admin UI yet.
- `POST /api/app/block` body `{uid, block?: boolean = true}` -> `200 {ok}` | `400` | `401` | `404 not_found` (block only) | `409 self`. Block =
  `blocks/{me}.uids` arrayUnion + friendship removed both ways + pending invites either way `declined` (`declinedBy:'block'`); unblock only removes
  the entry. `inviteFriend` refuses: `409 blocked` to the blocker, `404 not_found` to the blocked person; `answerInvite` turns an accept into a
  decline when a block exists. The app hides blocked people's comments, reactions and notifications (client-side, reversible).
- Rules (`firestore.rules`): `reports` create-only for the reporter (the app's offline fallback, `source:'app'`), no client reads; `blocks/{uid}`
  read by uid only, server-written; the users friends-only branch is refused for someone the target blocked. Deploy with
  `node scripts/deploy_rules.mjs --key ~/.secrets/nudge/firebase-sa.json [--commit]` (Rules API, dry run by default).
- Account deletion deletes the reports a person FILED and `blocks/{uid}`; reports ABOUT them and others' block lists naming them stay.
- Tests: `FIRESTORE_PORT=8685 bash scripts/test-emulator.sh scripts/tests/test_moderation.mts`; rules:
  `FIRESTORE_RULES=1 FIRESTORE_PORT=8785 bash scripts/test-emulator.sh scripts/tests/test_rules_moderation.mts`.

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

## Meetings (2026-11-06, branch `meetings-backend`): Google Meet + Nudge doc + reminders
- Contract: `lib/meetings/types.ts` (`Meeting`, shared with PWA / native). Firestore `meetings/{id}`, Admin-written only; rules let the owner and
  `attendeeUids` read; index `ownerUid + startAt`. Server: `lib/server/meetings.ts` (`createMeeting`, `listUpcomingMeetings`, `getMeeting`,
  `cancelMeeting`, pure `parseStart` / `normalizeRequest` / `reminderText`), auth in `lib/server/meetingsApi.ts`. No UI yet (native has no meeting hooks).
- Routes (same for web and native): `POST /api/meetings` body `{title, start, durationMin?=30, tz?='Asia/Kolkata', attendees?, notes?, reminderMinutes?=[30,10],
  createdVia}` -> `201 {...Meeting, calendar:'ok'|'not_connected'|'error'}`; `GET /api/meetings?limit=` -> `{meetings}` (upcoming, scheduled);
  `GET /api/meetings/[id]`; `DELETE /api/meetings/[id]` -> cancelled Meeting + `calendar` (deletes the Calendar event and the reminders). 400 `bad_request`, 401, 404.
- Auth: EITHER `Authorization: Bearer <Firebase ID token>` (own meetings only) OR header `x-nudge-signature` = hex HMAC-SHA256(`NUDGE_FORWARD_SECRET`,
  raw body for POST / `pathname+search` for GET and DELETE); body or query carries `ts` (ms, within 5 min) and `ownerWa` (digits) or `ownerUid`.
  CLI for Claude Code: `node scripts/meeting.mjs create "Meeting with Shamly" "2026-11-07 23:00" --email a@x.com` (also `list`, `cancel <id>`).
- Reminders: one reminder-only private task (tag `meeting`, text "Title at 11:00 PM <meet link>") per `reminderMinutes`, via `addTasks` -> QStash exact
  time + the 15-min cron, so push / WhatsApp / caps are `reminders.ts` unchanged. Reminders already in the past are dropped. Push text clips the link.
- Google: env `GCAL_CLIENT_ID`, `GCAL_CLIENT_SECRET`, `GCAL_REFRESH_TOKEN` (scope `calendar.events`, owner's primary calendar, Meet via
  `conferenceData.createRequest`, invites `sendUpdates=all`). The existing calendar sync only has `calendar.app.created` (secondary "Nudge" calendar) and the PWA's
  tokens are client-encrypted, so a new token is needed: `node scripts/mint_gcal_token.mjs --paste` (reuses the registered getemdone redirect, no console change;
  sign in as ikaif0312@gmail.com, Allow, paste the landing URL) writes `~/.secrets/nudge/gcal.env`; then set the three vars in Vercel and redeploy. Without
  them meetings still save and remind (`calendar:'not_connected'`, no `meetUrl`). `--port N` (loopback) needs `http://localhost:N/oauth2callback` added to the client's redirect URIs.
- Deploy needed: `firestore.rules` + `firestore.indexes.json` (`node scripts/deploy_rules.mjs ...`; the index via `firebase deploy --only firestore:indexes`).
- Tests: `npx tsx scripts/tests/test_meetings.mts`; `FIRESTORE_PORT=8885 bash scripts/test-emulator.sh scripts/tests/test_meetings_store.mts`.

## Meetings over WhatsApp (2026-11-06, branch `meetings-wa`): invites, reminders, cancellations to attendees
- `lib/server/meetingInvites.ts`: `inviteAttendees(m)`, `remindAttendees(m, minutesBefore)`, `cancelAttendees(m)` (all never throw, return per-person results),
  `remindForTask`. Attendees need only `{name?, waId}` (`waId` = digits, 8-15; `--with "Shamly +91..."` in `scripts/meeting.mjs`). The bot agent calls `createMeeting`
  / `cancelMeeting` as before: invites and cancel notes are sent from inside them.
- Rules: skips the owner (uid, or the owner's linked number) and anyone with `waLinks/{waId}.muted` (STOP; recorded `skipped_muted`). One message per person per
  meeting and kind: doc `meetingInvites/{meetingId}_{waId}` (`_r{minutes}` reminder, `_cancel`), `status` sent | failed | skipped_*, `error` = Meta code + message
  (`lib/wa/send.ts lastSendError`). Only a `failed` doc may be retried. Inside the person's 24 h window: free text (+ "Join meeting" URL button); else the template, one
  global daily slot (`waCaps`, `NUDGE_MAX_TEMPLATES_PER_DAY`), slot given back on failure. Language = the person's `waLinks.lang`, else `en`.
- Reminders: `reminders.ts sendClaimed` calls `remindForTask` after the owner's own reminder task fires (tag `meeting`; meeting found by `reminderTaskIds`), so
  attendees get the same 30 / 10 min reminders. Cancel tells only those whose invite is `sent`.
- Templates (UTILITY, en/hi/ur/ml, Hindi/Urdu/Malayalam written by Claude: have a native speaker read them): `nudge_meeting_invite` (inviter, title, date, time, link),
  `nudge_meeting_reminder` (title, time, link), `nudge_meeting_cancelled` (inviter, title, date, time). The Meet link is in the body (no button).
  **NOT SUBMITTED YET.** Owner submits: `WA_TOKEN=<business token> node scripts/create_wa_templates.mjs --commit --only nudge_meeting_invite,nudge_meeting_reminder,nudge_meeting_cancelled`
  (dry run = same without `--commit`; add `--lang en` for English only). Meta review of UTILITY templates takes minutes to about a day; the status shows in WhatsApp
  Manager. Until approved, template sends fail (e.g. 132001) and are logged on the `meetingInvites` doc as `failed` with the error; the meeting itself is unaffected.
  If Meta re-classes one as MARKETING, add its name to the category list in the script (as for `nudge_checkin`).
- Tests: `npx tsx scripts/tests/test_meeting_invites.mts` (fake sender and store, no network).
