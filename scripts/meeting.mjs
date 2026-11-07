#!/usr/bin/env node
// Create / list / cancel Nudge meetings from Claude Code (signed API, owner = WhatsApp 916238952660).
//   node scripts/meeting.mjs create "Meeting with Shamly" "2026-11-07 23:00" [--dur 30] [--tz Asia/Kolkata] [--email a@x.com --name Shamly] [--notes ".."]
//   node scripts/meeting.mjs list | node scripts/meeting.mjs cancel <id>
// NUDGE_FORWARD_SECRET comes from the environment or ~/.secrets/nudge/env. Base URL: NUDGE_PUBLIC_URL or https://getemdone.vercel.app.
import { createHmac } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

let secret = process.env.NUDGE_FORWARD_SECRET;
const envFile = join(homedir(), '.secrets', 'nudge', 'env');
if (!secret && existsSync(envFile)) secret = /^NUDGE_FORWARD_SECRET=(.*)$/m.exec(readFileSync(envFile, 'utf8'))?.[1].trim().replace(/^["']|["']$/g, '');
if (!secret) { console.error('NUDGE_FORWARD_SECRET not found'); process.exit(1); }
const base = (process.env.NUDGE_PUBLIC_URL || 'https://getemdone.vercel.app').replace(/\/$/, '');
const OWNER_WA = process.env.NUDGE_OWNER_WA || '916238952660';
const sign = (s) => createHmac('sha256', secret).update(s, 'utf8').digest('hex');
const [cmd, ...rest] = process.argv.slice(2);
const opt = (n) => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : undefined; };
const pos = rest.filter((a, i) => !a.startsWith('--') && !(i > 0 && rest[i - 1].startsWith('--')));

async function call(method, path, bodyObj) {
  const ts = Date.now();
  let url = base + path, raw;
  if (method === 'POST') raw = JSON.stringify({ ...bodyObj, ownerWa: OWNER_WA, ts });
  else { url += (path.includes('?') ? '&' : '?') + `ownerWa=${OWNER_WA}&ts=${ts}`; }
  const u = new URL(url);
  const res = await fetch(url, { method, headers: { 'x-nudge-signature': sign(raw ?? u.pathname + u.search), ...(raw ? { 'Content-Type': 'application/json' } : {}) }, body: raw });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) { console.error(res.status, JSON.stringify(j)); process.exit(1); }
  return j;
}

if (cmd === 'create') {
  const [title, start] = pos;
  if (!title || !start) { console.error('usage: create "<title>" "<YYYY-MM-DD HH:mm | ISO>" [--dur n] [--tz z] [--email e --name n] [--notes t]'); process.exit(1); }
  const attendees = opt('--email') || opt('--name') ? [{ ...(opt('--name') ? { name: opt('--name') } : {}), ...(opt('--email') ? { email: opt('--email') } : {}) }] : [];
  const m = await call('POST', '/api/meetings', { title, start, createdVia: 'claude-code', ...(opt('--dur') ? { durationMin: Number(opt('--dur')) } : {}), ...(opt('--tz') ? { tz: opt('--tz') } : {}), attendees, ...(opt('--notes') ? { notes: opt('--notes') } : {}) });
  console.log(JSON.stringify(m, null, 2));
} else if (cmd === 'list') {
  console.log(JSON.stringify(await call('GET', '/api/meetings'), null, 2));
} else if (cmd === 'cancel' && pos[0]) {
  console.log(JSON.stringify(await call('DELETE', `/api/meetings/${encodeURIComponent(pos[0])}`), null, 2));
} else {
  console.error('usage: meeting.mjs create|list|cancel (see header)'); process.exit(1);
}
