// Deploy firestore.rules to the live project through the Firebase Rules API with a service account (no `firebase login`).
//   node scripts/deploy_rules.mjs --key ~/.secrets/nudge/firebase-sa.json            # dry run: compares live vs local
//   node scripts/deploy_rules.mjs --key ~/.secrets/nudge/firebase-sa.json --commit   # creates a ruleset + points the release at it
// Prints the previous ruleset name first: to roll back, PATCH the release back to it (or re-run this from the old commit).
// Deploy only after the change is reviewed and merged (the owner's OK).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleAuth } from 'google-auth-library';

const args = process.argv.slice(2);
const opt = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const keyFile = opt('--key');
const commit = args.includes('--commit');
if (!keyFile) {
  console.error('usage: node scripts/deploy_rules.mjs --key <service-account.json> [--project <id>] [--commit]');
  process.exit(2);
}
const sa = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
const project = opt('--project') || sa.project_id || 'getemdone-87679';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');

const auth = new GoogleAuth({ credentials: sa, scopes: ['https://www.googleapis.com/auth/firebase', 'https://www.googleapis.com/auth/cloud-platform'] });
const client = await auth.getClient();
const base = `https://firebaserules.googleapis.com/v1/projects/${project}`;
const api = async (method, url, body) => {
  const r = await client.request({ method, url, data: body, validateStatus: () => true });
  if (r.status >= 300) throw new Error(`${method} ${url} -> ${r.status} ${JSON.stringify(r.data)}`);
  return r.data;
};

const release = await api('GET', `${base}/releases/cloud.firestore`);
console.log(`project ${project}\nlive release -> ${release.rulesetName} (updated ${release.updateTime})`);
const live = await api('GET', `https://firebaserules.googleapis.com/v1/${release.rulesetName}`);
const liveSrc = live.source?.files?.[0]?.content ?? '';
if (liveSrc === source) {
  console.log('live rules already equal firestore.rules: nothing to do');
  process.exit(0);
}
const a = liveSrc.split('\n');
const b = source.split('\n');
const onlyLocal = b.filter((l) => !a.includes(l)).length;
const onlyLive = a.filter((l) => !b.includes(l)).length;
console.log(`differs: ${onlyLocal} line(s) only in firestore.rules, ${onlyLive} only live`);
if (!commit) {
  console.log('dry run: pass --commit to deploy');
  process.exit(0);
}
const rs = await api('POST', `${base}/rulesets`, { source: { files: [{ name: 'firestore.rules', content: source }] } });
console.log(`created ruleset ${rs.name}`);
const upd = await api('PATCH', `${base}/releases/cloud.firestore`, {
  release: { name: `projects/${project}/releases/cloud.firestore`, rulesetName: rs.name },
});
console.log(`release cloud.firestore -> ${upd.rulesetName} (updated ${upd.updateTime})\nrollback target: ${release.rulesetName}`);
