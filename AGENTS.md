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
