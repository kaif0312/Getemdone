// Creates the Nudge WhatsApp UTILITY templates on the Nudge WABA.
//   node scripts/create_wa_templates.mjs            -> dry run: prints the JSON bodies, sends nothing
//   node scripts/create_wa_templates.mjs --commit   -> POSTs them to Meta (needs WA_TOKEN)
// Env: WA_TOKEN (business token), NUDGE_WABA_ID (default 1694312582258170), WA_GRAPH_VERSION (default v26.0).
// Wording is strictly transactional on purpose: Meta re-categorises promotional-sounding templates as MARKETING.
// Quick-reply payloads (checkin:start, checkin:skip, nudge:<uid>) are NOT set here: they are passed per send via
// sendTemplate(..., { buttonPayloads }).

const WABA = process.env.NUDGE_WABA_ID || '1694312582258170';
const VERSION = process.env.WA_GRAPH_VERSION || 'v26.0';
const commit = process.argv.includes('--commit');

const templates = [
  {
    name: 'nudge_checkin',
    language: 'en',
    category: 'UTILITY',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, you have {{2}} tasks on your Nudge list today. Tap a button below to plan your day or skip it.',
        example: { body_text: [['Sam', '4']] },
      },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'QUICK_REPLY', text: 'Plan my day' },
          { type: 'QUICK_REPLY', text: 'Skip today' },
        ],
      },
    ],
  },
  {
    name: 'nudge_friend',
    language: 'en',
    category: 'UTILITY',
    components: [
      {
        type: 'BODY',
        text: '{{1}} nudged you on Nudge: "{{2}}"',
        example: { body_text: [['Ali', 'Finish your tasks for today']] },
      },
      { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Nudge back' }] },
    ],
  },
  {
    name: 'nudge_reminder',
    language: 'en',
    category: 'UTILITY',
    components: [
      {
        type: 'BODY',
        text: 'Reminder from Nudge: "{{1}}" is scheduled for {{2}}.',
        example: { body_text: [['Call the bank', '5:30 PM']] },
      },
    ],
  },
];

if (!commit) {
  console.log(`# DRY RUN: WABA ${WABA}, nothing sent. Re-run with --commit to create these.`);
  console.log(JSON.stringify(templates, null, 2));
  process.exit(0);
}

const token = process.env.WA_TOKEN;
if (!token) {
  console.error('WA_TOKEN is not set');
  process.exit(1);
}

let failed = 0;
for (const t of templates) {
  const res = await fetch(`https://graph.facebook.com/${VERSION}/${WABA}/message_templates`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(t),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) failed++;
  console.log(t.name, res.status, JSON.stringify(json));
}
process.exit(failed ? 1 : 0);
