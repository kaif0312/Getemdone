// Live READ-ONLY check of the meeting-notes Google side: lists the Gemini notes in Drive, exports the sample doc and runs the
// extraction on it. Sends nothing, writes nothing (no WhatsApp, no Firestore, no Calendar).
//   ISK_ENV=~/.secrets/nudge/iskaria-google.env GEMINI_API_KEY=... npx tsx scripts/try_meetingnotes.mts [docId]
import fs from 'node:fs';
import { cfgFromEnv, makeGoogle } from '../lib/meetingnotes/google';
import { extractDraft } from '../lib/meetingnotes/extract';
import { formatDraft } from '../lib/meetingnotes/draft';
import { callGemini } from '../lib/bot/gemini';

const env: Record<string, string> = {};
for (const l of fs.readFileSync(process.env.ISK_ENV!, 'utf8').split(/\r?\n/)) { const m = /^([A-Z_]+)=(.*)$/.exec(l); if (m) env[m[1]] = m[2]; }
const cfg = cfgFromEnv(env)!;
const g = makeGoogle(cfg);
const list = await g.listNotes();
console.log('notes in Drive:', list.length, 'newest:', list[0]?.name);
const id = process.argv[2] || '1Joasd1FXg1Q5QRzsnqCqqONVU-K-kgj3QxLYOILv-f0';
const text = await g.exportText(id);
console.log('export chars:', text?.length ?? 'FAILED');
if (text && process.env.GEMINI_API_KEY) {
  const name = list.find((f) => f.id === id)?.name ?? 'Sample - Notes by Gemini';
  const d = await extractDraft((r) => callGemini(r), name, text);
  console.log(formatDraft(d));
} else console.log('(no GEMINI_API_KEY: extraction skipped)');
