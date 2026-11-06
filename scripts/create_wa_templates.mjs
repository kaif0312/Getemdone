// Creates the Nudge WhatsApp UTILITY templates on the Nudge WABA, in English, Hindi (hi), Urdu (ur) and Malayalam (ml).
//   node scripts/create_wa_templates.mjs                         -> dry run: prints the JSON bodies, sends nothing
//   node scripts/create_wa_templates.mjs --commit                -> POSTs them to Meta (needs WA_TOKEN)
//   node scripts/create_wa_templates.mjs --commit --only nudge_med_reminder,nudge_med_alert   -> just those names
//   node scripts/create_wa_templates.mjs --commit --lang ml      -> just that language
// Env: WA_TOKEN (business token), NUDGE_WABA_ID (default 1694312582258170), WA_GRAPH_VERSION (default v26.0).
// Same name + another language = a translation of the same template; the bot sends the user's language and falls back to
// English when Meta has no approved version (lib/wa/send.ts sendTemplateFallback). Every language of a name must keep the
// same variables and the same number of buttons.
// Wording is strictly transactional on purpose: Meta re-categorises promotional-sounding templates as MARKETING. Meta also
// rejects a variable at the very start or end of the body, and too few words per variable.
// Quick-reply payloads (checkin:start, checkin:skip, nudge:<uid>, med:taken:<id>, med:later:<id>) are NOT set here: they are
// passed per send via sendTemplate(..., { buttonPayloads }). Button texts carry no emoji (not allowed on every button type).
// Translations were written by Claude: have a native speaker read them before --commit, especially the medicine ones.

const WABA = process.env.NUDGE_WABA_ID || '1694312582258170';
const VERSION = process.env.WA_GRAPH_VERSION || 'v26.0';
const commit = process.argv.includes('--commit');
const argOf = (flag) => { const i = process.argv.indexOf(flag); return i > 0 ? process.argv[i + 1] : ''; };
const only = argOf('--only').split(',').filter(Boolean);
const onlyLang = argOf('--lang');

const tpl = (name, language, text, example, buttons = []) => ({
  name,
  language,
  // Meta classed nudge_checkin and nudge_friend as MARKETING (their English versions); every language of a name must match.
  category: ['nudge_checkin', 'nudge_friend'].includes(name) ? 'MARKETING' : 'UTILITY',
  components: [
    { type: 'BODY', text, example: { body_text: [example] } },
    ...(buttons.length ? [{ type: 'BUTTONS', buttons: buttons.map((b) => ({ type: 'QUICK_REPLY', text: b })) }] : []),
  ],
});

const templates = [
  // ---- morning check-in (vars: name, number of tasks; buttons: plan / skip)
  tpl('nudge_checkin', 'en', 'Hi {{1}}, you have {{2}} tasks on your Nudge list today. Tap a button below to plan your day or skip it.', ['Sam', '4'], ['Plan my day', 'Skip today']),
  tpl('nudge_checkin', 'hi', 'नमस्ते {{1}}, आज आपकी Nudge लिस्ट में {{2}} टास्क हैं। दिन की योजना बनाने या छोड़ने के लिए नीचे दिया गया बटन दबाएँ।', ['राहुल', '4'], ['दिन प्लान करें', 'आज छोड़ें']),
  tpl('nudge_checkin', 'ur', 'السلام علیکم {{1}}، آج آپ کی Nudge فہرست میں {{2}} ٹاسک ہیں۔ دن کا پلان بنانے یا چھوڑنے کے لیے نیچے بٹن دبائیں۔', ['احمد', '4'], ['دن کا پلان', 'آج چھوڑیں']),
  tpl('nudge_checkin', 'ml', 'നമസ്കാരം {{1}}, ഇന്ന് നിങ്ങളുടെ Nudge ലിസ്റ്റിൽ {{2}} ടാസ്ക് ഉണ്ട്. ദിവസം പ്ലാൻ ചെയ്യാനോ ഒഴിവാക്കാനോ താഴെയുള്ള ബട്ടൺ അമർത്തുക.', ['അനു', '4'], ['ദിവസം പ്ലാൻ ചെയ്യാം', 'ഇന്ന് വേണ്ട']),

  // ---- a friend's nudge (vars: friend, message; button: nudge back)
  // Meta: no variable at the start/end, and enough words per variable (errors 2388299 / 2388293).
  tpl('nudge_friend', 'en', 'Your friend {{1}} sent you a nudge on Nudge: "{{2}}". Reply here to see your tasks for today, or tap the button to nudge them back.', ['Ali', 'Finish your tasks for today'], ['Nudge back']),
  tpl('nudge_friend', 'hi', 'आपके दोस्त {{1}} ने Nudge पर आपको नज भेजा है: "{{2}}"। आज के टास्क देखने के लिए यहाँ जवाब दें, या बटन दबाकर उन्हें वापस नज करें।', ['अली', 'आज के टास्क पूरे करो'], ['वापस नज करें']),
  tpl('nudge_friend', 'ur', 'آپ کے دوست {{1}} نے Nudge پر آپ کو نج بھیجا ہے: "{{2}}"۔ آج کے ٹاسک دیکھنے کے لیے یہاں جواب دیں، یا بٹن دبا کر انہیں واپس نج کریں۔', ['علی', 'آج کے ٹاسک مکمل کرو'], ['واپس نج کریں']),
  tpl('nudge_friend', 'ml', 'നിങ്ങളുടെ സുഹൃത്ത് {{1}} Nudge-ൽ നിങ്ങൾക്ക് ഒരു നഡ്ജ് അയച്ചിട്ടുണ്ട്: "{{2}}". ഇന്നത്തെ ടാസ്ക് കാണാൻ ഇവിടെ മറുപടി അയക്കൂ, അല്ലെങ്കിൽ ബട്ടൺ അമർത്തി തിരിച്ച് നഡ്ജ് ചെയ്യൂ.', ['അലി', 'ഇന്നത്തെ ടാസ്ക് തീർക്കൂ'], ['തിരിച്ച് നഡ്ജ്']),

  // ---- task reminder when the 24 h window is closed (vars: task, time)
  tpl('nudge_reminder', 'en', 'Reminder from Nudge: "{{1}}" is scheduled for {{2}} today. Reply done when it is finished, or reply later to move it.', ['Call the bank', '5:30 PM']),
  tpl('nudge_reminder', 'hi', 'Nudge की ओर से रिमाइंडर: "{{1}}" आज {{2}} पर तय है। पूरा हो जाए तो done लिखें, या आगे बढ़ाने के लिए later लिखें।', ['बैंक को फ़ोन करना', '5:30 PM']),
  tpl('nudge_reminder', 'ur', 'Nudge کی طرف سے یاد دہانی: "{{1}}" آج {{2}} پر طے ہے۔ مکمل ہو جائے تو done لکھیں، یا آگے بڑھانے کے لیے later لکھیں۔', ['بینک کو فون کرنا', '5:30 PM']),
  tpl('nudge_reminder', 'ml', 'Nudge-ൽ നിന്നുള്ള ഓർമ്മപ്പെടുത്തൽ: "{{1}}" ഇന്ന് {{2}}-ന് ആണ്. കഴിഞ്ഞാൽ done എന്നും, മാറ്റിവയ്ക്കാൻ later എന്നും അയക്കൂ.', ['ബാങ്കിൽ വിളിക്കണം', '5:30 PM']),

  // ---- medicine reminder for family (vars: name, medicines, time; buttons: taken / later). Needs to exist because the
  //      parent's 24 h window is usually closed at the first dose of the day. See lib/server/meds.ts.
  tpl('nudge_med_reminder', 'en', 'Medicine reminder from Nudge: {{1}}, it is time for {{2}} (scheduled for {{3}}). Please tap Taken below once you have taken it.', ['Amma', 'BP tablet', '8:00 AM'], ['Taken', 'Later']),
  tpl('nudge_med_reminder', 'hi', 'Nudge की ओर से दवा का रिमाइंडर: {{1}}, {{2}} लेने का समय हो गया है ({{3}})। दवा लेने के बाद नीचे "ले ली" बटन दबाएँ।', ['माँ', 'BP की गोली', '8:00 AM'], ['ले ली', 'बाद में']),
  tpl('nudge_med_reminder', 'ur', 'Nudge کی طرف سے دوا کی یاد دہانی: {{1}}، {{2}} لینے کا وقت ہو گیا ہے ({{3}})۔ دوا لینے کے بعد نیچے "لے لی" کا بٹن دبائیں۔', ['امی', 'BP کی گولی', '8:00 AM'], ['لے لی', 'بعد میں']),
  tpl('nudge_med_reminder', 'ml', 'Nudge-ൽ നിന്ന് മരുന്ന് ഓർമ്മ: {{1}}, {{2}} കഴിക്കാൻ സമയമായിട്ടോ ({{3}}). കഴിച്ചിട്ട് താഴെ "കഴിച്ചു" അമർത്തണേ.', ['അമ്മേ', 'BP ഗുളിക', '8:00 AM'], ['കഴിച്ചു', 'പിന്നെ കഴിക്കാം']),

  // ---- meetings (2026-11-06; sent by lib/server/meetingInvites.ts). The Meet link goes in the body (a URL button would need a fixed
  //      base URL); the body must not start or end with a variable. Vars: invite = inviter, title, date, time, link;
  //      reminder = title, time, link; cancelled = inviter, title, date, time.
  tpl('nudge_meeting_invite', 'en', 'Nudge meeting invite: {{1}} invited you to "{{2}}" on {{3}} at {{4}}. Join with this link: {{5}} (opens Google Meet).', ['Ibrahim', 'Project sync', 'Sat 7 Nov', '11:00 PM (Asia/Kolkata)', 'https://meet.google.com/abc-defg-hij']),
  tpl('nudge_meeting_invite', 'hi', 'Nudge मीटिंग निमंत्रण: {{1}} ने आपको "{{2}}" के लिए {{3}} को {{4}} पर आमंत्रित किया है। इस लिंक से जुड़ें: {{5}} (Google Meet खुलेगा)।', ['इब्राहिम', 'प्रोजेक्ट सिंक', 'शनि 7 नवं', '11:00 PM (Asia/Kolkata)', 'https://meet.google.com/abc-defg-hij']),
  tpl('nudge_meeting_invite', 'ur', 'Nudge میٹنگ دعوت: {{1}} نے آپ کو "{{2}}" کے لیے {{3}} کو {{4}} پر مدعو کیا ہے۔ اس لنک سے شامل ہوں: {{5}} (Google Meet کھلے گا)۔', ['ابراہیم', 'پروجیکٹ سنک', 'ہفتہ 7 نومبر', '11:00 PM (Asia/Kolkata)', 'https://meet.google.com/abc-defg-hij']),
  tpl('nudge_meeting_invite', 'ml', 'Nudge മീറ്റിംഗ് ക്ഷണം: {{1}} നിങ്ങളെ "{{2}}" എന്ന മീറ്റിംഗിലേക്ക് {{3}} ന് {{4}} ക്ക് ക്ഷണിച്ചിരിക്കുന്നു. ഈ ലിങ്കിൽ ചേരാം: {{5}} (Google Meet തുറക്കും).', ['ഇബ്രാഹിം', 'പ്രോജക്ട് സിങ്ക്', 'ശനി 7 നവം', '11:00 PM (Asia/Kolkata)', 'https://meet.google.com/abc-defg-hij']),

  tpl('nudge_meeting_reminder', 'en', 'Meeting reminder from Nudge: "{{1}}" starts at {{2}}. Join with this link: {{3}} (opens Google Meet).', ['Project sync', '11:00 PM (Asia/Kolkata)', 'https://meet.google.com/abc-defg-hij']),
  tpl('nudge_meeting_reminder', 'hi', 'Nudge की ओर से मीटिंग रिमाइंडर: "{{1}}" {{2}} पर शुरू होगी। इस लिंक से जुड़ें: {{3}} (Google Meet खुलेगा)।', ['प्रोजेक्ट सिंक', '11:00 PM (Asia/Kolkata)', 'https://meet.google.com/abc-defg-hij']),
  tpl('nudge_meeting_reminder', 'ur', 'Nudge کی طرف سے میٹنگ کی یاد دہانی: "{{1}}" {{2}} پر شروع ہوگی۔ اس لنک سے شامل ہوں: {{3}} (Google Meet کھلے گا)۔', ['پروجیکٹ سنک', '11:00 PM (Asia/Kolkata)', 'https://meet.google.com/abc-defg-hij']),
  tpl('nudge_meeting_reminder', 'ml', 'Nudge-ൽ നിന്നുള്ള മീറ്റിംഗ് ഓർമ്മപ്പെടുത്തൽ: "{{1}}" {{2}} ക്ക് തുടങ്ങും. ഈ ലിങ്കിൽ ചേരാം: {{3}} (Google Meet തുറക്കും).', ['പ്രോജക്ട് സിങ്ക്', '11:00 PM (Asia/Kolkata)', 'https://meet.google.com/abc-defg-hij']),

  tpl('nudge_meeting_cancelled', 'en', 'Nudge meeting update: {{1}} cancelled "{{2}}", which was planned for {{3}} at {{4}}. You do not need to do anything.', ['Ibrahim', 'Project sync', 'Sat 7 Nov', '11:00 PM']),
  tpl('nudge_meeting_cancelled', 'hi', 'Nudge मीटिंग अपडेट: {{1}} ने "{{2}}" रद्द कर दी है, जो {{3}} को {{4}} पर तय थी। आपको कुछ करने की ज़रूरत नहीं है।', ['इब्राहिम', 'प्रोजेक्ट सिंक', 'शनि 7 नवं', '11:00 PM']),
  tpl('nudge_meeting_cancelled', 'ur', 'Nudge میٹنگ اپ ڈیٹ: {{1}} نے "{{2}}" منسوخ کر دی ہے، جو {{3}} کو {{4}} پر طے تھی۔ آپ کو کچھ کرنے کی ضرورت نہیں ہے۔', ['ابراہیم', 'پروجیکٹ سنک', 'ہفتہ 7 نومبر', '11:00 PM']),
  tpl('nudge_meeting_cancelled', 'ml', 'Nudge മീറ്റിംഗ് അപ്ഡേറ്റ്: {{1}} "{{2}}" എന്ന മീറ്റിംഗ് റദ്ദാക്കി. ഇത് {{3}} ന് {{4}} ക്ക് നിശ്ചയിച്ചതായിരുന്നു. നിങ്ങൾ ഒന്നും ചെയ്യേണ്ടതില്ല.', ['ഇബ്രാഹിം', 'പ്രോജക്ട് സിങ്ക്', 'ശനി 7 നവം', '11:00 PM']),

  // ---- to the family member when a dose is still not confirmed and their own window is closed (vars: person, medicines, time)
  tpl('nudge_med_alert', 'en', 'Medicine check from Nudge: {{1}} has not confirmed {{2}} due at {{3}}. Please check on them.', ['Amma', 'BP tablet', '8:00 AM']),
];

const chosen = templates.filter((t) => (!only.length || only.includes(t.name)) && (!onlyLang || t.language === onlyLang));

if (!commit) {
  console.log(`# DRY RUN: WABA ${WABA}, nothing sent. Re-run with --commit to create these (${chosen.length} of ${templates.length}).`);
  console.log(JSON.stringify(chosen, null, 2));
  process.exit(0);
}

const token = process.env.WA_TOKEN;
if (!token) {
  console.error('WA_TOKEN is not set');
  process.exit(1);
}

let failed = 0;
for (const t of chosen) {
  const res = await fetch(`https://graph.facebook.com/${VERSION}/${WABA}/message_templates`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(t),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) failed++;
  console.log(t.name, t.language, res.status, JSON.stringify(json));
}
process.exit(failed ? 1 : 0);
