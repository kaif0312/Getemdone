// Languages for the WhatsApp bot: English, Hindi, Urdu, Malayalam. Pure (no server imports), so tests need no emulator.
// The user's language lives on waLinks/{waId}.lang (+ langManual = they chose it, so script detection stops overriding).
// Everything the bot prints from fixed text goes through t(lang, key, params). Gemini's free-form lead-in lines follow
// the "Reply language" line in the prompt context (lib/bot/prompt.ts). Coach voice lines, onboarding, fitness-metric
// labels and friend reactions are still English-only (see AGENTS.md "Languages").
// Translations are written by Claude: have a native speaker read the medicine (med*) strings before relying on them.

export type Lang = 'en' | 'hi' | 'ur' | 'ml';
export const LANGS: Lang[] = ['en', 'hi', 'ur', 'ml'];
export const DEFAULT_LANG: Lang = 'en';

/** Name of each language in its own script (list rows, confirmations). */
export const LANG_NAMES: Record<Lang, string> = { en: 'English', hi: 'हिन्दी', ur: 'اردو', ml: 'മലയാളം' };

/** For the Gemini prompt. */
export const LANG_PROMPT: Record<Lang, string> = {
  en: 'English',
  hi: 'Hindi, in Devanagari script',
  ur: 'Urdu, in Arabic (Nastaliq) script',
  ml: 'Malayalam, in Malayalam script',
};

/** BCP-47 locale for dates. */
const LOCALE: Record<Lang, string> = { en: 'en-GB', hi: 'hi-IN', ur: 'ur-PK', ml: 'ml-IN' };
export const localeOf = (l: Lang): string => LOCALE[l];

export function isLang(x: unknown): x is Lang {
  return typeof x === 'string' && (LANGS as string[]).includes(x);
}

export function langOf(link: { lang?: string } | null | undefined): Lang {
  return isLang(link?.lang) ? link!.lang : DEFAULT_LANG;
}

// ---------- detection ----------

const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
/** Letters that exist in Urdu but not in Arabic (ٹ ڈ ڑ ں ھ ہ ے ک گ چ پ ژ). */
const URDU_ONLY = /[ٹڈڑںھہےکگچپژ]/g;

/** The language a message is clearly written in, by script: Malayalam, Devanagari (Hindi), or Urdu letters. null = Latin
 *  text / unclear (never switches back to English: that is only ever an explicit choice). */
export function detectLang(text: string): Lang | null {
  if (!text) return null;
  const ml = count(text, /[ഀ-ൿ]/g);
  const hi = count(text, /[ऀ-ॿ]/g);
  const ur = count(text, URDU_ONLY) >= 2 ? count(text, /[؀-ۿ]/g) : 0;
  const best = Math.max(ml, hi, ur);
  if (best < 2) return null;
  return best === ml ? 'ml' : best === hi ? 'hi' : 'ur';
}

const NAME_TO_LANG: [Lang, string[]][] = [
  ['en', ['english', 'en', 'eng', 'इंग्लिश', 'अंग्रेजी', 'अंग्रेज़ी', 'انگلش', 'انگریزی', 'ഇംഗ്ലീഷ്']],
  ['hi', ['hindi', 'hi', 'हिन्दी', 'हिंदी', 'ہندی', 'ഹിന്ദി']],
  ['ur', ['urdu', 'ur', 'اردو', 'उर्दू', 'ഉർദു', 'ഉറുദു']],
  ['ml', ['malayalam', 'ml', 'mal', 'മലയാളം', 'मलयालम', 'ملیالم']],
];

/** "hindi", "മലയാളം", "ml" (the whole text) -> the language, else null. */
export function parseLangName(s: string): Lang | null {
  const t = s.trim().toLowerCase().replace(/[.!؟?]+$/g, '').trim();
  if (!t) return null;
  for (const [lang, names] of NAME_TO_LANG) if (names.includes(t)) return lang;
  return null;
}

/** True when the text is just the word for "language" in any of the four. */
export function isLangCommand(s: string): boolean {
  return /^(language|lang|bhasha|भाषा|زبان|ഭാഷ|ഭാഷാ)$/i.test(s.trim().replace(/[.!?]+$/g, ''));
}

// ---------- strings ----------

type Entry = Record<Lang, string>;
const e = (en: string, hi: string, ur: string, ml: string): Entry => ({ en, hi, ur, ml });

const HELP_SLASH = '/task <text>, /today, /done 2, /undo, /week, /files, /meds, /language, /help';

export const STR = {
  apology: e(
    'Sorry, something went wrong on my side. Please try again in a moment 🙏',
    'माफ़ कीजिए, मेरी तरफ़ से कुछ गड़बड़ हो गई। थोड़ी देर बाद फिर कोशिश करें 🙏',
    'معذرت، مجھ سے کچھ غلطی ہو گئی۔ تھوڑی دیر بعد دوبارہ کوشش کریں 🙏',
    'ക്ഷമിക്കണം, എന്റെ ഭാഗത്ത് എന്തോ പിഴവ് പറ്റി. കുറച്ച് കഴിഞ്ഞ് വീണ്ടും ശ്രമിക്കൂ 🙏',
  ),
  unsupported: e(
    'I can read text, voice notes and photos. Send *help* to see what I can do.',
    'आप टेक्स्ट, वॉइस नोट और फ़ोटो भेज सकते हैं। क्या-क्या हो सकता है, यह जानने के लिए *help* भेजें।',
    'آپ ٹیکسٹ، وائس نوٹ اور تصویریں بھیج سکتے ہیں۔ کیا کچھ ہو سکتا ہے، جاننے کے لیے *help* بھیجیں۔',
    'ടെക്സ്റ്റ്, വോയ്സ് നോട്ട്, ഫോട്ടോ എന്നിവ അയക്കാം. എന്തൊക്കെ ചെയ്യാമെന്ന് അറിയാൻ *help* അയക്കൂ.',
  ),
  didntCatch: e(
    "Hmm, I didn't catch that. Try *help* to see what I can do.",
    'हम्म, मुझे समझ नहीं आया। क्या-क्या हो सकता है, यह देखने के लिए *help* भेजें।',
    'ہمم، مجھے سمجھ نہیں آیا۔ کیا کچھ ہو سکتا ہے، دیکھنے کے لیے *help* بھیجیں۔',
    'മനസ്സിലായില്ല. എന്തൊക്കെ ചെയ്യാമെന്ന് കാണാൻ *help* അയക്കൂ.',
  ),
  toolFailed: e(
    '⚠️ One of those did not go through. Please try again.',
    '⚠️ इनमें से एक काम नहीं हो पाया। कृपया फिर कोशिश करें।',
    '⚠️ ان میں سے ایک کام نہیں ہو سکا۔ براہِ کرم دوبارہ کوشش کریں۔',
    '⚠️ അതിൽ ഒന്ന് നടന്നില്ല. ദയവായി വീണ്ടും ശ്രമിക്കൂ.',
  ),
  help: e(
    [
      '*What I can do* 👇',
      '• Add tasks: "gym 6pm, call mom, deck by Fri"',
      '• *today* - your list, then tap a task',
      '• *done 2* or *done 1,3* - tick off',
      '• *undo* - take back the last change',
      '• Log fitness: "ran 5k in 28 min", "82.4 kg"',
      '• *week* - fitness this week, *friends* - what friends did',
      '• "nudge Ali" - cheer a friend on',
      '• *coach* - pick your coach (friendly, hardcore, hype...)',
      '• *meme* - a meme from your coach, *memes off* to stop them',
      '• *language* - English, हिन्दी, اردو, മലയാളം',
      '• Voice notes and screenshots work too',
      '• Send a document or video and I file it in Drive (a photo: forward it, or caption it "save passport" or "/ref name")',
      '• *stop* pauses my messages, *start* resumes',
      '',
      '*Slash commands* (a leading / works on the commands above)',
      '/task <text> add a task, /today, /done 2, /undo, /week',
      '/files your last 5 Drive files, /meds medicine reminders, /language, /help',
    ].join('\n'),
    [
      '*मैं क्या-क्या कर सकता हूँ* 👇',
      '• टास्क जोड़ें: "gym 6pm, call mom, deck by Fri"',
      '• *today* - आज की लिस्ट, फिर किसी टास्क पर टैप करें',
      '• *done 2* या *done 1,3* - पूरा हुआ टिक करें',
      '• *undo* - आख़िरी बदलाव वापस लें',
      '• फ़िटनेस दर्ज करें: "ran 5k in 28 min", "82.4 kg"',
      '• *week* - इस हफ़्ते की फ़िटनेस, *friends* - दोस्तों ने क्या किया',
      '• "nudge Ali" - दोस्त का हौसला बढ़ाएँ',
      '• *coach* - अपना कोच चुनें',
      '• *meme* - कोच की तरफ़ से मीम, बंद करने के लिए *memes off*',
      '• *language* - English, हिन्दी, اردو, മലയാളം',
      '• वॉइस नोट और स्क्रीनशॉट भी भेज सकते हैं',
      '• कोई डॉक्यूमेंट या वीडियो भेजें, मैं उसे Drive में रख दूँगा',
      '• *stop* से मेरे संदेश रुकते हैं, *start* से फिर शुरू',
      '',
      '*स्लैश कमांड*',
      HELP_SLASH,
    ].join('\n'),
    [
      '*میں کیا کیا کر سکتا ہوں* 👇',
      '• ٹاسک شامل کریں: "gym 6pm, call mom, deck by Fri"',
      '• *today* - آج کی فہرست، پھر کسی ٹاسک پر ٹیپ کریں',
      '• *done 2* یا *done 1,3* - مکمل شدہ پر ٹک کریں',
      '• *undo* - آخری تبدیلی واپس لیں',
      '• فٹنس درج کریں: "ran 5k in 28 min", "82.4 kg"',
      '• *week* - اس ہفتے کی فٹنس، *friends* - دوستوں نے کیا کیا',
      '• "nudge Ali" - دوست کی حوصلہ افزائی کریں',
      '• *coach* - اپنا کوچ چنیں',
      '• *meme* - کوچ کی طرف سے میم، بند کرنے کے لیے *memes off*',
      '• *language* - English, हिन्दी, اردو, മലയാളം',
      '• وائس نوٹ اور اسکرین شاٹ بھی بھیج سکتے ہیں',
      '• کوئی دستاویز یا ویڈیو بھیجیں، میں اسے Drive میں رکھ دوں گا',
      '• *stop* سے میرے پیغامات رک جاتے ہیں، *start* سے دوبارہ شروع',
      '',
      '*سلیش کمانڈ*',
      HELP_SLASH,
    ].join('\n'),
    [
      '*എനിക്ക് ചെയ്യാവുന്നത്* 👇',
      '• ടാസ്ക് ചേർക്കാം: "gym 6pm, call mom, deck by Fri"',
      '• *today* - ഇന്നത്തെ ലിസ്റ്റ്, എന്നിട്ട് ഒരു ടാസ്കിൽ അമർത്തുക',
      '• *done 2* അല്ലെങ്കിൽ *done 1,3* - തീർന്നത് ടിക്ക് ചെയ്യാം',
      '• *undo* - അവസാനത്തെ മാറ്റം തിരിച്ചെടുക്കാം',
      '• ഫിറ്റ്നസ് രേഖപ്പെടുത്താം: "ran 5k in 28 min", "82.4 kg"',
      '• *week* - ഈ ആഴ്ചത്തെ ഫിറ്റ്നസ്, *friends* - കൂട്ടുകാർ ചെയ്തത്',
      '• "nudge Ali" - കൂട്ടുകാരനെ പ്രോത്സാഹിപ്പിക്കാം',
      '• *coach* - നിങ്ങളുടെ കോച്ചിനെ തിരഞ്ഞെടുക്കാം',
      '• *meme* - കോച്ചിന്റെ മീം, നിർത്താൻ *memes off*',
      '• *language* - English, हिन्दी, اردو, മലയാളം',
      '• വോയ്സ് നോട്ടും സ്ക്രീൻഷോട്ടും അയക്കാം',
      '• ഡോക്യുമെന്റോ വീഡിയോയോ അയച്ചാൽ ഞാൻ Drive-ൽ സൂക്ഷിക്കും',
      '• *stop* എന്റെ സന്ദേശങ്ങൾ നിർത്തും, *start* വീണ്ടും തുടങ്ങും',
      '',
      '*സ്ലാഷ് കമാൻഡുകൾ*',
      HELP_SLASH,
    ].join('\n'),
  ),
  unknownCmd: e(
    'Unknown command /{cmd}. Send /help to see what I can do.',
    'यह कमांड /{cmd} मुझे नहीं पता। क्या-क्या हो सकता है, यह देखने के लिए /help भेजें।',
    'یہ کمانڈ /{cmd} مجھے معلوم نہیں۔ کیا کچھ ہو سکتا ہے، دیکھنے کے لیے /help بھیجیں۔',
    '/{cmd} എന്ന കമാൻഡ് അറിയില്ല. എന്തൊക്കെ ചെയ്യാമെന്ന് കാണാൻ /help അയക്കൂ.',
  ),
  taskUsage: e(
    'Add a task like this: /task call the bank',
    'टास्क ऐसे जोड़ें: /task बैंक को फ़ोन करना',
    'ٹاسک ایسے شامل کریں: /task بینک کو فون کرنا',
    'ടാസ്ക് ഇങ്ങനെ ചേർക്കാം: /task ബാങ്കിൽ വിളിക്കണം',
  ),
  muted: e(
    "Paused. I won't message you first. Send *start* to resume.",
    'रोक दिया। अब मैं पहले संदेश नहीं भेजूँगा। फिर शुरू करने के लिए *start* भेजें।',
    'روک دیا۔ اب میں پہلے پیغام نہیں بھیجوں گا۔ دوبارہ شروع کرنے کے لیے *start* بھیجیں۔',
    'നിർത്തി. ഇനി ഞാൻ ആദ്യം സന്ദേശം അയക്കില്ല. വീണ്ടും തുടങ്ങാൻ *start* അയക്കൂ.',
  ),
  unmuted: e(
    "Welcome back! I'll check in again. Send *today* to see your list.",
    'वापसी पर स्वागत है! मैं फिर से हाल पूछूँगा। लिस्ट देखने के लिए *today* भेजें।',
    'واپسی پر خوش آمدید! میں پھر سے حال پوچھوں گا۔ فہرست دیکھنے کے لیے *today* بھیجیں۔',
    'സ്വാഗതം! ഞാൻ വീണ്ടും വിവരം അന്വേഷിക്കും. ലിസ്റ്റ് കാണാൻ *today* അയക്കൂ.',
  ),
  checkinSet: e(
    "Done ✅ I'll check in at {time} every day. Send *stop* any time to pause.",
    'हो गया ✅ मैं रोज़ {time} पर हाल पूछूँगा। रोकने के लिए कभी भी *stop* भेजें।',
    'ہو گیا ✅ میں روزانہ {time} پر حال پوچھوں گا۔ روکنے کے لیے کبھی بھی *stop* بھیجیں۔',
    'ശരി ✅ ദിവസവും {time}-ന് ഞാൻ വിവരം അന്വേഷിക്കും. നിർത്താൻ എപ്പോഴും *stop* അയക്കാം.',
  ),
  nothingUndo: e('Nothing to undo.', 'वापस लेने के लिए कुछ नहीं है।', 'واپس لینے کے لیے کچھ نہیں ہے۔', 'തിരിച്ചെടുക്കാൻ ഒന്നുമില്ല.'),
  undone: e('↩️ Undone: {labels}', '↩️ वापस ले लिया', '↩️ واپس لے لیا', '↩️ തിരിച്ചെടുത്തു'),
  // buttons (WhatsApp titles are cut at 20 characters)
  btnDone: e('Done ✅', 'हो गया ✅', 'ہو گیا ✅', 'കഴിഞ്ഞു ✅'),
  btnTomorrow: e('Tomorrow', 'कल', 'کل', 'നാളെ'),
  btnDelete: e('Delete', 'हटाएँ', 'ہٹائیں', 'ഒഴിവാക്കുക'),
  btnUndo: e('Undo ↩️', 'वापस ↩️', 'واپس ↩️', 'തിരിച്ചെടുക്കുക ↩️'),
  pickTask: e('Pick a task', 'टास्क चुनें', 'ٹاسک چنیں', 'ടാസ്ക് തിരഞ്ഞെടുക്കൂ'),
  pickFocus: e('Pick focus', 'फ़ोकस चुनें', 'فوکس چنیں', 'ഫോക്കസ് ടാസ്ക്'),
  btnPlan: e('Plan my day', 'दिन की योजना', 'دن کی منصوبہ بندی', 'ദിവസം പ്ലാൻ ചെയ്യാം'),
  btnSkip: e('Skip today', 'आज छोड़ें', 'آج چھوڑیں', 'ഇന്ന് വേണ്ട'),
  // today
  todayEmptyDone: e(
    "🎉 Nothing left for today ({done} done). Tell me what's next.",
    '🎉 आज के लिए कुछ बाक़ी नहीं ({done} पूरे हुए)। आगे क्या करना है, बताइए।',
    '🎉 آج کے لیے کچھ باقی نہیں ({done} مکمل ہوئے)۔ آگے کیا کرنا ہے، بتائیں۔',
    '🎉 ഇന്നത്തേക്ക് ഒന്നും ബാക്കിയില്ല ({done} തീർന്നു). അടുത്തത് എന്താണെന്ന് പറയൂ.',
  ),
  todayEmpty: e(
    'Nothing on your list today. Tell me what you want to get done.',
    'आज आपकी लिस्ट में कुछ नहीं है। बताइए आज क्या करना है।',
    'آج آپ کی فہرست میں کچھ نہیں ہے۔ بتائیں آج کیا کرنا ہے۔',
    'ഇന്ന് ലിസ്റ്റിൽ ഒന്നുമില്ല. എന്താണ് ചെയ്യേണ്ടതെന്ന് പറയൂ.',
  ),
  todayHead: e('*Today* · {open} open', '*आज* · {open} बाक़ी', '*آج* · {open} باقی', '*ഇന്ന്* · {open} ബാക്കി'),
  todayHeadDone: e('*Today* · {open} open, {done} done', '*आज* · {open} बाक़ी, {done} पूरे', '*آج* · {open} باقی، {done} مکمل', '*ഇന്ന്* · {open} ബാക്കി, {done} തീർന്നു'),
  moreAsk: e('+{n} more (ask me for them)', '+{n} और (मुझसे माँग लें)', '+{n} مزید (مجھ سے مانگ لیں)', '+{n} കൂടി (ചോദിച്ചാൽ കാണിക്കാം)'),
  taskGone: e(
    'That task is gone. Send *today* for your list.',
    'वह टास्क अब नहीं है। लिस्ट के लिए *today* भेजें।',
    'وہ ٹاسک اب نہیں ہے۔ فہرست کے لیے *today* بھیجیں۔',
    'ആ ടാസ്ക് ഇപ്പോൾ ഇല്ല. ലിസ്റ്റിന് *today* അയക്കൂ.',
  ),
  noNumber: e(
    "I don't have a #{n} in your list. Send *today* to see it.",
    'आपकी लिस्ट में #{n} नहीं है। देखने के लिए *today* भेजें।',
    'آپ کی فہرست میں #{n} نہیں ہے۔ دیکھنے کے لیے *today* بھیجیں۔',
    'നിങ്ങളുടെ ലിസ്റ്റിൽ #{n} ഇല്ല. കാണാൻ *today* അയക്കൂ.',
  ),
  cantPin: e(
    'Couldn\'t pin down "{q}". Send *today* and use the number.',
    '"{q}" समझ नहीं आया। *today* भेजें और नंबर बताएँ।',
    '"{q}" سمجھ نہیں آیا۔ *today* بھیجیں اور نمبر بتائیں۔',
    '"{q}" കണ്ടെത്താനായില്ല. *today* അയച്ച് നമ്പർ പറയൂ.',
  ),
  // done / move / delete / add
  couldNotComplete: e('⚠️ Could not complete one of those.', '⚠️ इनमें से एक पूरा नहीं हो पाया।', '⚠️ ان میں سے ایک مکمل نہیں ہو سکا۔', '⚠️ അതിൽ ഒന്ന് പൂർത്തിയാക്കാനായില്ല.'),
  allDone: e('🎉 All done for today!{extra}', '🎉 आज का सब पूरा!{extra}', '🎉 آج کا سب مکمل!{extra}', '🎉 ഇന്നത്തേത് എല്ലാം തീർന്നു!{extra}'),
  streak: e(' 🔥 {n}-day streak', ' 🔥 लगातार {n} दिन', ' 🔥 مسلسل {n} دن', ' 🔥 തുടർച്ചയായി {n} ദിവസം'),
  leftToday: e('{n} left today', 'आज {n} बाक़ी', 'آج {n} باقی', 'ഇന്ന് {n} ബാക്കി'),
  moved: e('➡️ {task} moved to {when}', '➡️ {task} को {when} पर ले गया', '➡️ {task} کو {when} پر لے گیا', '➡️ {task} {when}-ലേക്ക് മാറ്റി'),
  couldNotMove: e('⚠️ Could not move that task.', '⚠️ वह टास्क खिसका नहीं पाया।', '⚠️ وہ ٹاسک منتقل نہیں ہو سکا۔', '⚠️ ആ ടാസ്ക് മാറ്റാനായില്ല.'),
  deleted: e('🗑 Deleted: {task}', '🗑 हटाया: {task}', '🗑 ہٹا دیا: {task}', '🗑 ഒഴിവാക്കി: {task}'),
  couldNotDelete: e('⚠️ Could not delete that task.', '⚠️ वह टास्क हटा नहीं पाया।', '⚠️ وہ ٹاسک ہٹا نہیں سکا۔', '⚠️ ആ ടാസ്ക് ഒഴിവാക്കാനായില്ല.'),
  addedOne: e('📝 Added:', '📝 जोड़ा:', '📝 شامل کیا:', '📝 ചേർത്തു:'),
  addedMany: e('📝 Added {n}:', '📝 {n} जोड़े:', '📝 {n} شامل کیے:', '📝 {n} എണ്ണം ചേർത്തു:'),
  dueOn: e(' · due {when}', ' · अंतिम तिथि {when}', ' · آخری تاریخ {when}', ' · അവസാന തീയതി {when}'),
  today: e('today', 'आज', 'آج', 'ഇന്ന്'),
  tomorrow: e('tomorrow', 'कल', 'کل', 'നാളെ'),
  // reminders
  remUnavailable: e('⚠️ Reminders are not available right now.', '⚠️ रिमाइंडर अभी उपलब्ध नहीं हैं।', '⚠️ ریمائنڈر ابھی دستیاب نہیں ہیں۔', '⚠️ റിമൈൻഡറുകൾ ഇപ്പോൾ ലഭ്യമല്ല.'),
  remOff: e('🔕 No reminder for {task}', '🔕 {task} के लिए कोई रिमाइंडर नहीं', '🔕 {task} کے لیے کوئی ریمائنڈر نہیں', '🔕 {task}-ന് റിമൈൻഡർ വേണ്ട'),
  remWhen: e(
    '⚠️ When should I remind you? e.g. "remind me at 5pm".',
    '⚠️ कब याद दिलाऊँ? जैसे "remind me at 5pm"।',
    '⚠️ کب یاد دلاؤں؟ جیسے "remind me at 5pm"۔',
    '⚠️ എപ്പോഴാണ് ഓർമ്മിപ്പിക്കേണ്ടത്? ഉദാ: "remind me at 5pm".',
  ),
  remPassed: e('⚠️ That time has already passed.', '⚠️ वह समय निकल चुका है।', '⚠️ وہ وقت گزر چکا ہے۔', '⚠️ ആ സമയം കഴിഞ്ഞുപോയി.'),
  remSet: e("⏰ I'll remind you about {task}: {when}", '⏰ {task} के लिए याद दिलाऊँगा: {when}', '⏰ {task} کے لیے یاد دلاؤں گا: {when}', '⏰ {task} ഓർമ്മിപ്പിക്കാം: {when}'),
  remChannelAuto: e(
    '🔔 Reminders will come in the app if you have it, otherwise here on WhatsApp.',
    '🔔 रिमाइंडर ऐप में आएँगे (अगर ऐप है), वरना यहीं WhatsApp पर।',
    '🔔 ریمائنڈر ایپ میں آئیں گے (اگر ایپ ہے)، ورنہ یہیں WhatsApp پر۔',
    '🔔 റിമൈൻഡറുകൾ ആപ്പ് ഉണ്ടെങ്കിൽ അതിൽ വരും, ഇല്ലെങ്കിൽ ഇവിടെ WhatsApp-ൽ.',
  ),
  remChannelApp: e('🔔 Reminders will come in the app only.', '🔔 रिमाइंडर सिर्फ़ ऐप में आएँगे।', '🔔 ریمائنڈر صرف ایپ میں آئیں گے۔', '🔔 റിമൈൻഡറുകൾ ആപ്പിൽ മാത്രം വരും.'),
  remChannelWa: e('🔔 Reminders will come here on WhatsApp only.', '🔔 रिमाइंडर सिर्फ़ यहीं WhatsApp पर आएँगे।', '🔔 ریمائنڈر صرف یہیں WhatsApp پر آئیں گے۔', '🔔 റിമൈൻഡറുകൾ ഇവിടെ WhatsApp-ൽ മാത്രം വരും.'),
  remChannelBoth: e('🔔 Reminders will come in the app and on WhatsApp.', '🔔 रिमाइंडर ऐप और WhatsApp दोनों में आएँगे।', '🔔 ریمائنڈر ایپ اور WhatsApp دونوں میں آئیں گے۔', '🔔 റിമൈൻഡറുകൾ ആപ്പിലും WhatsApp-ലും വരും.'),
  remChannelAsk: e(
    '⚠️ Reminders go to: app, whatsapp, both or auto. Which one?',
    '⚠️ रिमाइंडर कहाँ चाहिए: app, whatsapp, both या auto?',
    '⚠️ ریمائنڈر کہاں چاہئیں: app، whatsapp، both یا auto؟',
    '⚠️ റിമൈൻഡർ എവിടെ വേണം: app, whatsapp, both അല്ലെങ്കിൽ auto?',
  ),
  schedSaved: e('⏰ Saved', '⏰ सहेज लिया', '⏰ محفوظ کر لیا', '⏰ സേവ് ചെയ്തു'),
  schedAsk: e(
    '⚠️ What time should I use? e.g. "check in at 8am".',
    '⚠️ कौन सा समय रखूँ? जैसे "check in at 8am"।',
    '⚠️ کون سا وقت رکھوں؟ جیسے "check in at 8am"۔',
    '⚠️ ഏത് സമയം വെക്കണം? ഉദാ: "check in at 8am".',
  ),
  // fitness
  workoutLogged: e('💪 Logged: {desc}', '💪 दर्ज किया: {desc}', '💪 درج کیا: {desc}', '💪 രേഖപ്പെടുത്തി: {desc}'),
  workoutsWeekGoal: e('{w}/{g} workouts this week', 'इस हफ़्ते {w}/{g} वर्कआउट', 'اس ہفتے {w}/{g} ورزشیں', 'ഈ ആഴ്ച {w}/{g} വർക്കൗട്ട്'),
  workoutsWeek: e('{w} workouts this week', 'इस हफ़्ते {w} वर्कआउट', 'اس ہفتے {w} ورزشیں', 'ഈ ആഴ്ച {w} വർക്കൗട്ട്'),
  weekHead: e('*This week* 🏃', '*इस हफ़्ते* 🏃', '*اس ہفتے* 🏃', '*ഈ ആഴ്ച* 🏃'),
  // friends
  friendsNone: e(
    "No friends on Nudge yet. Add some in the app and I'll show what they get done.",
    'अभी Nudge पर कोई दोस्त नहीं है। ऐप में जोड़ें, फिर मैं दिखाऊँगा कि वे क्या कर रहे हैं।',
    'ابھی Nudge پر کوئی دوست نہیں ہے۔ ایپ میں شامل کریں، پھر میں دکھاؤں گا کہ وہ کیا کر رہے ہیں۔',
    'Nudge-ൽ ഇതുവരെ കൂട്ടുകാരില്ല. ആപ്പിൽ ചേർത്താൽ അവർ ചെയ്യുന്നത് ഞാൻ കാണിക്കാം.',
  ),
  friendsHead: e('*Friends today*', '*आज दोस्त*', '*آج دوست*', '*ഇന്ന് കൂട്ടുകാർ*'),
  // language
  langPick: e(
    'Which language should I use? Right now it is *{cur}*.',
    'मैं किस भाषा में बात करूँ? अभी *{cur}* है।',
    'میں کس زبان میں بات کروں؟ ابھی *{cur}* ہے۔',
    'ഞാൻ ഏത് ഭാഷയിൽ സംസാരിക്കണം? ഇപ്പോൾ *{cur}* ആണ്.',
  ),
  langPickBtn: e('Pick language', 'भाषा चुनें', 'زبان چنیں', 'ഭാഷ തിരഞ്ഞെടുക്കൂ'),
  langSet: e('Okay, I will talk to you in English from now on.', 'ठीक है, अब से मैं हिन्दी में बात करूँगा।', 'ٹھیک ہے، اب سے میں اردو میں بات کروں گا۔', 'ശരി, ഇനി മുതൽ ഞാൻ മലയാളത്തിൽ സംസാരിക്കാം.'),
  // morning check-in / recap (non-English users; English keeps the coach voice)
  morning: e(
    'Good morning {name}! You have {n} tasks today. Pick up to 3 to focus on.',
    'सुप्रभात {name}! आज आपके {n} टास्क हैं। फ़ोकस के लिए 3 तक चुनें।',
    'صبح بخیر {name}! آج آپ کے {n} ٹاسک ہیں۔ فوکس کے لیے 3 تک چنیں۔',
    'സുപ്രഭാതം {name}! ഇന്ന് {n} ടാസ്ക് ഉണ്ട്. ശ്രദ്ധിക്കാൻ 3 എണ്ണം വരെ തിരഞ്ഞെടുക്കൂ.',
  ),
  morningEmpty: e(
    'Good morning {name}! Nothing planned for today yet. Want to plan your day?',
    'सुप्रभात {name}! आज के लिए अभी कुछ तय नहीं है। दिन की योजना बनाएँ?',
    'صبح بخیر {name}! آج کے لیے ابھی کچھ طے نہیں۔ دن کی منصوبہ بندی کریں؟',
    'സുപ്രഭാതം {name}! ഇന്നത്തേക്ക് ഒന്നും പ്ലാൻ ചെയ്തിട്ടില്ല. ദിവസം പ്ലാൻ ചെയ്യണോ?',
  ),
  recapHead: e('Today: {done} done, {open} still open.', 'आज: {done} पूरे, {open} बाक़ी।', 'آج: {done} مکمل، {open} باقی۔', 'ഇന്ന്: {done} തീർന്നു, {open} ബാക്കി.'),
  recapDone: e('Done:', 'पूरे हुए:', 'مکمل ہوئے:', 'തീർന്നത്:'),
  recapOpen: e('Open:', 'बाक़ी:', 'باقی:', 'ബാക്കി:'),
  recapStreak: e('Streak: {n} days', 'लगातार: {n} दिन', 'مسلسل: {n} دن', 'തുടർച്ച: {n} ദിവസം'),
  // reminder message (inside the 24 h window)
  untilNow: e('Now', 'अभी', 'ابھی', 'ഇപ്പോൾ'),
  untilMin: e('in {n} min', '{n} मिनट में', '{n} منٹ میں', '{n} മിനിറ്റിൽ'),
  untilHr: e('in {n} h', '{n} घंटे में', '{n} گھنٹے میں', '{n} മണിക്കൂറിൽ'),
  pushStartsNow: e('Starting now', 'अभी शुरू', 'ابھی شروع', 'ഇപ്പോൾ തുടങ്ങുന്നു'),
  pushStarts: e('Starts {when}', '{when} शुरू', '{when} شروع', '{when} തുടങ്ങും'),
  aTask: e('a task', 'एक टास्क', 'ایک ٹاسک', 'ഒരു ടാസ്ക്'),
  // ---------- medicine reminders (patient side) ----------
  medDue: e(
    '{name}, time for your medicine 💊\n{meds}\n\nTap *Taken* below once you have taken it.',
    '{name}, दवा लेने का समय हो गया 💊\n{meds}\n\nदवा ले लेने के बाद नीचे *ले ली* बटन दबाएँ।',
    '{name}، دوا لینے کا وقت ہو گیا 💊\n{meds}\n\nدوا لینے کے بعد نیچے *لے لی* بٹن دبائیں۔',
    '{name}, മരുന്ന് കഴിക്കാനുള്ള സമയമായി 💊\n{meds}\n\nകഴിച്ചു കഴിഞ്ഞാൽ താഴെയുള്ള *കഴിച്ചു* ബട്ടൺ അമർത്തുക.',
  ),
  medRemind: e(
    '{name}, a gentle reminder 🙏 this medicine is not confirmed yet 💊\n{meds}',
    '{name}, याद दिलाना था 🙏 इस दवा की पुष्टि अभी नहीं हुई 💊\n{meds}',
    '{name}، یاد دہانی 🙏 اس دوا کی ابھی تصدیق نہیں ہوئی 💊\n{meds}',
    '{name}, ഓർമ്മപ്പെടുത്തൽ 🙏 ഈ മരുന്ന് കഴിച്ചതായി ഇതുവരെ അറിയിച്ചിട്ടില്ല 💊\n{meds}',
  ),
  btnTaken: e('Taken ✅', 'ले ली ✅', 'لے لی ✅', 'കഴിച്ചു ✅'),
  btnLater: e('Later ⏰', 'बाद में ⏰', 'بعد میں ⏰', 'പിന്നീട് ⏰'),
  medThanks: e(
    'Thank you {name} 🙏 noted as taken ✅',
    'धन्यवाद {name} 🙏 दवा ले ली, दर्ज कर लिया ✅',
    'شکریہ {name} 🙏 دوا لے لی، درج کر لیا ✅',
    'നന്ദി {name} 🙏 കഴിച്ചതായി രേഖപ്പെടുത്തി ✅',
  ),
  medLater: e(
    "Okay, I'll remind you again in 30 minutes ⏰",
    'ठीक है, 30 मिनट बाद फिर याद दिलाया जाएगा ⏰',
    'ٹھیک ہے، 30 منٹ بعد دوبارہ یاد دلایا جائے گا ⏰',
    'ശരി, 30 മിനിറ്റ് കഴിഞ്ഞ് വീണ്ടും ഓർമ്മിപ്പിക്കാം ⏰',
  ),
  medHelp: e(
    'If you have taken it, send *taken* or tap the button 🙏',
    'दवा ले ली हो तो *ले ली* लिखकर भेजें या बटन दबाएँ 🙏',
    'دوا لے لی ہو تو *لے لی* لکھ کر بھیجیں یا بٹن دبائیں 🙏',
    'മരുന്ന് കഴിച്ചെങ്കിൽ *കഴിച്ചു* എന്ന് അയക്കുക, അല്ലെങ്കിൽ ബട്ടൺ അമർത്തുക 🙏',
  ),
  medNothingDue: e(
    'No medicine is due right now 🙏',
    'अभी कोई दवा बाक़ी नहीं है 🙏',
    'ابھی کوئی دوا باقی نہیں ہے 🙏',
    'ഇപ്പോൾ കഴിക്കേണ്ട മരുന്ന് ഒന്നുമില്ല 🙏',
  ),
  medPassedOn: e(
    'I have passed your message on 🙏',
    'आपका संदेश भेज दिया गया है 🙏',
    'آپ کا پیغام بھیج دیا گیا ہے 🙏',
    'സന്ദേശം അയച്ചുകൊടുത്തിട്ടുണ്ട് 🙏',
  ),
  // ---------- medicine reminders (the family member who set them up) ----------
  ownTaken: e('✅ {name} took {meds} ({time})', '✅ {name} ने {meds} ले ली ({time})', '✅ {name} نے {meds} لے لی ({time})', '✅ {name} {meds} കഴിച്ചു ({time})'),
  ownTakenLate: e(
    '✅ {name} took {meds} (due {time}, confirmed late)',
    '✅ {name} ने {meds} ले ली ({time} की थी, देर से बताया)',
    '✅ {name} نے {meds} لے لی ({time} کی تھی، دیر سے بتایا)',
    '✅ {name} {meds} കഴിച്ചു ({time}-ന്റേത്, വൈകി അറിയിച്ചു)',
  ),
  ownMissed: e(
    '⚠️ {name} has not confirmed {meds} (due {time}). You may want to call.',
    '⚠️ {name} ने {meds} की पुष्टि नहीं की ({time})। शायद फ़ोन करना ठीक रहेगा।',
    '⚠️ {name} نے {meds} کی تصدیق نہیں کی ({time})۔ شاید فون کرنا ٹھیک رہے گا۔',
    '⚠️ {name} {meds} കഴിച്ചതായി അറിയിച്ചിട്ടില്ല ({time}). ഒന്ന് വിളിച്ചു നോക്കൂ.',
  ),
  ownUnreachable: e(
    "⚠️ I couldn't reach {name} on WhatsApp for {meds} ({time}). They may need to send a message to Nudge once to open the chat.",
    '⚠️ {meds} ({time}) के लिए {name} तक WhatsApp पर संदेश नहीं पहुँचा। शायद उन्हें Nudge को एक बार संदेश भेजना होगा।',
    '⚠️ {meds} ({time}) کے لیے {name} تک WhatsApp پر پیغام نہیں پہنچا۔ شاید انہیں Nudge کو ایک بار پیغام بھیجنا ہو گا۔',
    '⚠️ {meds} ({time}) {name}-ന് WhatsApp-ൽ എത്തിക്കാനായില്ല. അവർ Nudge-ലേക്ക് ഒരു തവണ സന്ദേശം അയച്ചാൽ ചാറ്റ് തുറക്കും.',
  ),
  ownNote: e('💬 {name} wrote: "{text}"', '💬 {name} ने लिखा: "{text}"', '💬 {name} نے لکھا: "{text}"', '💬 {name} എഴുതി: "{text}"'),
  ownMedia: e(
    '💬 {name} sent a voice note or photo on Nudge. I cannot forward it, so please check in with them.',
    '💬 {name} ने Nudge पर वॉइस नोट या फ़ोटो भेजा। मैं उसे आगे नहीं भेज सकता, इसलिए उनसे बात कर लें।',
    '💬 {name} نے Nudge پر وائس نوٹ یا تصویر بھیجی۔ میں اسے آگے نہیں بھیج سکتا، اس لیے ان سے بات کر لیں۔',
    '💬 {name} Nudge-ൽ വോയ്സ് നോട്ടോ ഫോട്ടോയോ അയച്ചു. എനിക്കത് ഫോർവേഡ് ചെയ്യാനാവില്ല, അവരെ ഒന്ന് വിളിക്കൂ.',
  ),
  medsHead: e('*Medicines today* 💊', '*आज की दवाइयाँ* 💊', '*آج کی دوائیں* 💊', '*ഇന്നത്തെ മരുന്നുകൾ* 💊'),
  medsNone: e(
    'No medicine reminders yet. Say e.g. "remind Amma to take her BP tablet at 8am and 9pm".',
    'अभी कोई दवा रिमाइंडर नहीं है। जैसे कहें: "remind Amma to take her BP tablet at 8am and 9pm"।',
    'ابھی کوئی دوا ریمائنڈر نہیں ہے۔ جیسے کہیں: "remind Amma to take her BP tablet at 8am and 9pm"۔',
    'മരുന്ന് റിമൈൻഡറുകൾ ഇല്ല. ഇങ്ങനെ പറയൂ: "remind Amma to take her BP tablet at 8am and 9pm".',
  ),
  medsTaken: e('✅ taken {at}', '✅ ले ली {at}', '✅ لے لی {at}', '✅ കഴിച്ചു {at}'),
  medsWaiting: e('⏳ waiting', '⏳ इंतज़ार', '⏳ انتظار', '⏳ കാത്തിരിക്കുന്നു'),
  medsMissed: e('⚠️ not confirmed', '⚠️ पुष्टि नहीं', '⚠️ تصدیق نہیں', '⚠️ അറിയിച്ചിട്ടില്ല'),
  medsLater: e('· later', '· बाद में', '· بعد میں', '· പിന്നീട്'),
  medAdded: e(
    '💊 Added for {name}: {meds} at {times}. They get a reminder with a *Taken* button, and I tell you if they have not confirmed.',
    '💊 {name} के लिए जोड़ा: {meds}, {times} पर। उन्हें *ले ली* बटन वाला रिमाइंडर मिलेगा, और पुष्टि न होने पर मैं आपको बताऊँगा।',
    '💊 {name} کے لیے شامل کیا: {meds}، {times} پر۔ انہیں *لے لی* بٹن والا ریمائنڈر ملے گا، اور تصدیق نہ ہونے پر میں آپ کو بتاؤں گا۔',
    '💊 {name}-ന് ചേർത്തു: {meds}, {times}-ന്. അവർക്ക് *കഴിച്ചു* ബട്ടൺ ഉള്ള റിമൈൻഡർ കിട്ടും, അവർ അറിയിച്ചില്ലെങ്കിൽ ഞാൻ നിങ്ങളോട് പറയാം.',
  ),
  medRemoved: e('💊 Removed {meds} for {name}.', '💊 {name} के लिए {meds} हटा दी।', '💊 {name} کے لیے {meds} ہٹا دی۔', '💊 {name}-ന്റെ {meds} ഒഴിവാക്കി.'),
  medNoPerson: e(
    "⚠️ I don't know who that is. People I can remind: {names}. To add a new person, ask Kaif to set them up first.",
    '⚠️ मैं उस व्यक्ति को नहीं जानता। जिन्हें याद दिला सकता हूँ: {names}। नया व्यक्ति जोड़ने के लिए पहले उन्हें सेट करवाएँ।',
    '⚠️ میں اس شخص کو نہیں جانتا۔ جنہیں یاد دلا سکتا ہوں: {names}۔ نیا شخص شامل کرنے کے لیے پہلے انہیں سیٹ کروائیں۔',
    '⚠️ ആരെന്ന് അറിയില്ല. ഓർമ്മിപ്പിക്കാവുന്നവർ: {names}. പുതിയ ആളെ ചേർക്കാൻ ആദ്യം സെറ്റപ്പ് ചെയ്യിക്കൂ.',
  ),
  medNoMatch: e('⚠️ I could not find that medicine for {name}.', '⚠️ {name} के लिए वह दवा नहीं मिली।', '⚠️ {name} کے لیے وہ دوا نہیں ملی۔', '⚠️ {name}-ന് ആ മരുന്ന് കണ്ടെത്താനായില്ല.'),
  medNeedTimes: e(
    '⚠️ What time(s) should I remind? e.g. "8am and 9pm".',
    '⚠️ किस समय याद दिलाऊँ? जैसे "8am and 9pm"।',
    '⚠️ کس وقت یاد دلاؤں؟ جیسے "8am and 9pm"۔',
    '⚠️ ഏത് സമയത്താണ് ഓർമ്മിപ്പിക്കേണ്ടത്? ഉദാ: "8am and 9pm".',
  ),
} as const satisfies Record<string, Entry>;

export type Key = keyof typeof STR;
export type Params = Record<string, string | number>;

/** Look up `key` in `lang` (falls back to English), filling {placeholders}. */
export function t(lang: Lang, key: Key, params?: Params): string {
  const entry = STR[key] as Entry;
  let s = entry[lang] ?? entry.en;
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** "6:00 PM" in every language (WhatsApp shows Latin digits to all four). */
export function clock12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
