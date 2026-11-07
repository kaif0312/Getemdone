#!/usr/bin/env node
// Mint the owner's Google Calendar refresh token for Nudge meetings (scope calendar.events), once.
//   node scripts/mint_gcal_token.mjs [--paste | --port 8765] [--no-open] [--url-only]
// Uses the published "Iskaria" web OAuth client (GCP project dr-jefna-gbp) from ~/.secrets/nudge/gdrive.env
// (GDRIVE_CLIENT_ID / GDRIVE_CLIENT_SECRET), runs a loopback consent as ikaif0312@gmail.com, and writes
// GCAL_CLIENT_ID / GCAL_CLIENT_SECRET / GCAL_REFRESH_TOKEN to ~/.secrets/nudge/gcal.env. The token is never printed.
// Before the first run the owner must add  http://localhost:<port>/oauth2callback  to that client's "Authorized redirect URIs"
// (Google Cloud console -> project dr-jefna-gbp -> Google Auth Platform -> Clients -> Iskaria web client), else Google shows
// redirect_uri_mismatch. Adding calendar.events under "Data access" is optional: unlisted scopes just show the unverified-app screen.
// Then put the three values in Vercel env (names above) and redeploy.
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const port = Number(args[args.indexOf('--port') + 1]) || 8765;
const SCOPE = 'https://www.googleapis.com/auth/calendar.events openid email';
const EXPECT_EMAIL = 'ikaif0312@gmail.com';
const paste = flag('--paste');
// --paste needs NO console change: it reuses the redirect URI already registered for Nudge's calendar sync. After you click Allow the
// browser lands on a Nudge error page; copy that page's full address bar URL (it holds ?code=...) and paste it here.
const redirect = paste ? 'https://getemdone.vercel.app/api/cal/google/callback' : `http://localhost:${port}/oauth2callback`;
const src = join(homedir(), '.secrets', 'nudge', 'gdrive.env');
const out = join(homedir(), '.secrets', 'nudge', 'gcal.env');

function readEnv(p) {
  if (!existsSync(p)) return {};
  return Object.fromEntries(readFileSync(p, 'utf8').split(/\r?\n/).map((l) => /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(l)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]));
}

const env = readEnv(src);
const clientId = env.GDRIVE_CLIENT_ID;
const clientSecret = env.GDRIVE_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error(`No GDRIVE_CLIENT_ID / GDRIVE_CLIENT_SECRET in ${src}`);
  process.exit(1);
}

const verifier = randomBytes(32).toString('base64url');
const challenge = createHash('sha256').update(verifier).digest('base64url');
const state = randomBytes(16).toString('hex');
const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
  client_id: clientId, redirect_uri: redirect, response_type: 'code', scope: SCOPE, access_type: 'offline', prompt: 'consent',
  include_granted_scopes: 'false', login_hint: EXPECT_EMAIL, state, code_challenge: challenge, code_challenge_method: 'S256',
});

if (flag('--url-only')) {
  console.log(url);
  process.exit(0);
}

async function save(code) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirect, grant_type: 'authorization_code', code_verifier: verifier }).toString(),
  });
  const j = await r.json();
  if (!j.refresh_token) return { ok: false, msg: `No refresh token (${j.error || 'none'}). Revoke the app at myaccount.google.com/permissions and run again.` };
  const email = JSON.parse(Buffer.from(String(j.id_token).split('.')[1], 'base64url').toString('utf8')).email;
  if (email !== EXPECT_EMAIL) return { ok: false, msg: `Signed in as ${email}, expected ${EXPECT_EMAIL}. Nothing saved.` };
  if (!String(j.scope || '').includes('calendar.events')) return { ok: false, msg: 'calendar.events was not granted. Nothing saved.' };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `GCAL_CLIENT_ID=${clientId}
GCAL_CLIENT_SECRET=${clientSecret}
GCAL_REFRESH_TOKEN=${j.refresh_token}
`, { mode: 0o600 });
  return { ok: true, msg: `Saved GCAL_* for ${email} to ${out} (token not shown). Add the three values to Vercel env and redeploy.` };
}

if (paste) {
  console.log(`Open this URL as ${EXPECT_EMAIL}, click Allow, then paste the full URL of the page you land on:
${url}
`);
  if (!flag('--no-open')) execFile('cmd', ['/c', 'start', '', url.replace(/&/g, '^&')], () => {});
  process.stdout.write('Pasted URL: ');
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', async (d) => {
    buf += d;
    if (!buf.includes(String.fromCharCode(10))) return;
    process.stdin.pause();
    try {
      const u = new URL(buf.trim());
      if (u.searchParams.get('state') !== state) { console.error('State does not match this run; nothing saved.'); process.exit(1); }
      const code = u.searchParams.get('code');
      if (!code) { console.error('No code in that URL:', u.searchParams.get('error') || ''); process.exit(1); }
      const r = await save(code);
      (r.ok ? console.log : console.error)(r.msg);
      process.exit(r.ok ? 0 : 1);
    } catch (e) { console.error('Could not read that URL:', e.message); process.exit(1); }
  });
  setTimeout(() => { console.error('Timed out.'); process.exit(1); }, 10 * 60_000);
} else {
const server = createServer(async (req, res) => {
  const u = new URL(req.url, redirect);
  if (u.pathname !== '/oauth2callback') { res.writeHead(404).end(); return; }
  const page = (msg, code = 200) => { res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' }).end(msg); };
  if (u.searchParams.get('state') !== state) return page('state mismatch', 400);
  const err = u.searchParams.get('error');
  const code = u.searchParams.get('code');
  if (err || !code) { page(`Google said: ${err || 'no code'}`, 400); console.error('Consent failed:', err || 'no code'); return finish(1); }
  try {
    const r = await save(code);
    page(r.ok ? 'Done. You can close this tab.' : r.msg, r.ok ? 200 : 400);
    (r.ok ? console.log : console.error)(r.msg);
    finish(r.ok ? 0 : 1);
  } catch (e) {
    page('Token exchange failed', 500); console.error('Token exchange failed:', e.message); finish(1);
  }
});
function finish(c) { server.close(); setTimeout(() => process.exit(c), 200); }

server.listen(port, '127.0.0.1', () => {
  console.log(`Listening on ${redirect}\nOpen this URL as ${EXPECT_EMAIL} and click Allow (use --url-only to print it):`);
  if (flag('--no-open')) console.log(url);
  else {
    console.log('(opening your browser)');
    execFile('cmd', ['/c', 'start', '', url.replace(/&/g, '^&')], () => {});
  }
});
setTimeout(() => { console.error('Timed out after 10 minutes.'); finish(1); }, 10 * 60_000);
}
