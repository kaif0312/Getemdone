// Live check of the meme providers (no WhatsApp sends). Needs IMGFLIP_USERNAME/IMGFLIP_PASSWORD and/or GIPHY_API_KEY.
// Run: npx tsx scripts/try_memes.mts [coach] [moment]   e.g. drill deferred
// Prints a link for every recipe of that coach+moment, and writes converted stickers to ./.memes-preview/ so you can
// open them in a browser. Mind GIPHY's beta key limit (100 calls/hour).
import { mkdirSync, writeFileSync } from 'node:fs';
import { makeProviders } from '../lib/memes/providers';
import { BOOKS, fillText, type Moment } from '../lib/bot/memes';
import type { CoachId } from '../lib/bot/coaches';

const coach = (process.argv[2] || 'drill') as CoachId;
const moment = (process.argv[3] || 'deferred') as Moment;
const p = makeProviders();
console.log(`providers: imgflip=${p.has.imgflip} giphy=${p.has.giphy}; ${coach}.${moment}`);
const dir = '.memes-preview';
mkdirSync(dir, { recursive: true });
let i = 0;
for (const r of BOOKS[coach][moment] ?? []) {
  i++;
  if ('c' in r) {
    const texts = r.x.map((t) => fillText(t, { task: 'finish deck' }));
    console.log(`meme    ${texts.join(' / ')}\n        ${p.has.imgflip ? await p.caption(r.c, texts) : '(no imgflip creds)'}`);
  } else if ('g' in r) {
    console.log(`gif     "${r.g}"\n        ${p.has.giphy ? (await p.gif(r.g))?.mp4 : '(no GIPHY key)'}`);
  } else {
    const buf = p.has.giphy ? await p.sticker(r.s) : null;
    if (buf) writeFileSync(`${dir}/${i}-${r.s.replace(/\W+/g, '_')}.webp`, buf);
    console.log(`sticker "${r.s}"\n        ${buf ? `${dir}/${i}-${r.s.replace(/\W+/g, '_')}.webp (${Math.round(buf.length / 1024)} KB)` : '(none)'}`);
  }
}
