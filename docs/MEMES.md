# Memes, GIFs and stickers from the coach (2026-11-04, branch `coaches`)

## What it does
- A turn can raise a **moment**: task pushed to a later day (`deferred`), workout logged, some/all tasks done, *stop*
  (`quit`), and from Gemini's `send_meme` tool: `excuse`, `tired`, `brag`, or an explicit ask.
- After the reply, `runMeme()` in `lib/bot/core.ts` may answer it with one item from the coach's **book**
  (`BOOKS` in `lib/bot/memes.ts`): a captioned meme (Imgflip), a GIF (GIPHY, sent as an MP4 video captioned "via GIPHY")
  or a GIPHY sticker (converted to a 512x512 WebP with sharp, uploaded to WhatsApp, sent by media id).
- If a meme goes out, the mascot sticker for that turn is skipped; if nothing goes out, the mascot sticker is sent.
- Commands: *meme* / *gif* / *sticker* (asked), *memes off* / *memes on*. Asking Gemini works too ("send me a goggins
  gif" searches GIPHY for exactly that).

## Limits and switches
| What | Where |
|---|---|
| Auto memes per local day | `NUDGE_MEMES_PER_DAY` (default 3), plus a per-moment chance (`ODDS`) |
| Asked memes per day | `NUDGE_MEMES_ASKED_PER_DAY` (default 15) |
| Kill switch | `NUDGE_MEMES=off` |
| Per user opt-out | `waLinks/{waId}.memes = false` (*memes off*); asked memes still work |
| Counters | `waLinks/{waId}.memeDay / memeCount / memeAskedCount` |
| GIPHY rating | `NUDGE_MEME_RATING` (default `pg-13`) |

Memes only ever go out in reply to the user (inside the 24h window), never proactively and never in a template.

## Providers (env)
- **Imgflip** `IMGFLIP_USERNAME`, `IMGFLIP_PASSWORD`: a free imgflip.com account. API is free and allows bots.
  Template ids + box counts are in `T` in `lib/bot/memes.ts` (from `api.imgflip.com/get_memes`, 2026-11-04).
- **GIPHY** `GIPHY_API_KEY`: free beta key from developers.giphy.com (100 calls/hour; a sticker or GIF = 1 call).
  Their terms ask for "Powered by GIPHY" attribution and client-side requests; we caption "via GIPHY" and send their
  link (stickers are converted and re-uploaded). Owner accepted this trade-off (2026-11-04).
- Without a provider's env, its recipes are skipped; with neither, memes are off and the mascot stickers remain.
- Not used: **Tenor** (API shut down 2026-07-01), **KLIPY** (terms forbid server-side requests without written approval).

## Files
- `lib/bot/memes.ts`: moments, books per coach, `chooseRecipe`, `allowMeme` (budget), `sendRecipe`.
- `lib/memes/providers.ts`: Imgflip caption, GIPHY search, `toWhatsAppSticker` (sharp; animated <= 500 KB, else a still
  <= 100 KB; a 44-frame GIF converts in ~0.7 s to ~200 KB).
- `lib/wa/media.ts`: `sendImage`, `sendVideo`, `uploadMedia`, `sendStickerId` (dry-run aware).
- Tests: `NUDGE_WA_DRY_RUN=1 npx tsx scripts/tests/test_memes.mts`. Live preview of a book:
  `npx tsx scripts/try_memes.mts drill deferred` (needs the provider env; stickers land in `.memes-preview/`).
- `sharp` is a direct dependency (it was only transitive via Next).
