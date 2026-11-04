// End-to-end meme check without WhatsApp: real Gemini + real Imgflip/GIPHY + sharp, fake Firestore, sends captured.
// Needs GEMINI_API_KEY, IMGFLIP_USERNAME/IMGFLIP_PASSWORD, GIPHY_API_KEY. Run: npx tsx scripts/e2e_memes.mts
// Prints each turn: the user's text, Nudge's replies, and any meme/GIF/sticker that would go out (stickers are
// checked against WhatsApp's limits: 512x512 WebP, animated <= 500 KB, static <= 100 KB).
process.env.NUDGE_WA_DRY_RUN = '1';
import sharp from 'sharp';
import { handleWith } from '../lib/bot/core';
import { callGemini } from '../lib/bot/gemini';
import { makeProviders } from '../lib/memes/providers';
import type { MemeDeps } from '../lib/bot/memes';
import type { InboundMessage } from '../lib/wa/types';
import { makeFake, mkTask } from './tests/fakes';

let n = 0;
const text = (t: string): InboundMessage => ({ id: 'e' + ++n, from: '9100', timestamp: Math.floor(Date.now() / 1000) + n, type: 'text', text: t });
const f = makeFake({ tasks: [mkTask('t1', 'gym'), mkTask('t2', 'finish deck'), mkTask('t3', 'call mom')], gemini: (req) => callGemini(req) });
const media: string[] = [];
const problems: string[] = [];
const m: MemeDeps = {
  providers: makeProviders(),
  sendImage: async (_to, link, cap) => { media.push(`IMAGE ${link}${cap ? ' "' + cap + '"' : ''}`); return 'w'; },
  sendVideo: async (_to, link, cap) => { media.push(`VIDEO ${link} "${cap ?? ''}"`); return 'w'; },
  uploadMedia: async (data, mime) => {
    const meta = await sharp(data, { animated: true }).metadata();
    const animated = (meta.pages ?? 1) > 1;
    const ok = mime === 'image/webp' && meta.format === 'webp' && meta.width === 512 && (meta.pageHeight ?? meta.height) === 512
      && data.length <= (animated ? 500 : 100) * 1024;
    const desc = `${meta.format} ${meta.width}x${meta.pageHeight ?? meta.height} ${animated ? `${meta.pages} frames` : 'static'} ${Math.round(data.length / 1024)} KB`;
    if (!ok) problems.push('sticker outside WhatsApp limits: ' + desc);
    media.push(`STICKER upload ${desc} ${ok ? 'OK' : 'BAD'}`);
    return 'media1';
  },
  sendStickerId: async () => 'w',
};
f.deps.memes = m;
console.log(`providers imgflip=${m.providers.has.imgflip} giphy=${m.providers.has.giphy}`);

async function turn(t: string) {
  const s0 = f.sent.length, st0 = f.stickers.length, m0 = media.length;
  await handleWith(f.deps, text(t));
  console.log(`\n> ${t}`);
  for (const s of f.sent.slice(s0)) console.log(`  ${s.kind}: ${s.body.replace(/\n/g, ' / ')}`);
  for (const s of f.stickers.slice(st0)) console.log(`  mascot sticker: ${s}`);
  for (const x of media.slice(m0)) console.log(`  ${x}`);
  const l = f.getLink()!;
  console.log(`  [coach=${l.coach ?? 'buddy'} memes=${l.memes ?? 'on'} auto=${l.memeCount ?? 0} asked=${l.memeAskedCount ?? 0}]`);
  return media.length - m0;
}

const expect = (cond: boolean, what: string) => { if (!cond) problems.push(what); };
expect((await turn('be like david goggins with me')) >= 0, '');
expect(f.getLink()!.coach === 'drill', 'goggins request did not switch to the drill coach');
await turn('today');
expect((await turn('send me a david goggins gif')) === 1, 'asked goggins gif: no media');
expect((await turn('sticker')) === 1, 'sticker command: no media');
expect((await turn('meme')) === 1, 'meme command: no media');
await turn('tmrw 2');
await turn("skipping the gym today, I'm too tired honestly");
await turn('done 1');
await turn('memes off');
const before = media.length;
await turn("can't be bothered with the deck");
expect(media.length === before, 'auto meme went out after memes off');
expect((await turn('gif')) === 1, 'asked gif after memes off: no media');
await turn('memes on');
await turn('I crushed a 10k run this morning in 48 minutes');

console.log(problems.filter(Boolean).length ? `\nPROBLEMS:\n- ${problems.filter(Boolean).join('\n- ')}` : '\nE2E OK');
