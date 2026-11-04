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
- WhatsApp limits: documents up to 100 MB; photos sent as photos are compressed (tell people to send ID/visa scans as
  *Document*); videos sent as videos are squeezed to about 16 MB. Test: `npx tsx scripts/tests/test_vault.mts` (no emulator).

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
