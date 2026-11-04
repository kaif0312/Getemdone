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

## File vault (2026-11-04): people send files on WhatsApp, the bot files them in Drive
- `lib/vault/`: `vault.ts` (allowlist, naming, ack, pure and tested), `drive.ts` (Drive REST), `index.ts` (production wiring).
  `app/api/wa/inbound` calls `tryVault(msg)` right after dedupe: an allowlisted sender never reaches the todo bot and
  needs no Nudge account. Everyone else is unchanged (their documents/videos get the "I can read text, voice notes and
  photos" reply).
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
