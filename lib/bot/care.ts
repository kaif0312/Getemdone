// Family members added only to receive medicine reminders (WaLink.care = true; scripts/med_plan.mjs). Whatever they send
// lands here, never in the to-do bot: a tap on Taken / Later, a short "kazhichu" / "taken" / "ले ली" reply, a thumbs-up
// reaction on the reminder, or anything else (passed on to the family member who set it up). No model is called.
import type { InboundMessage, WaLink } from '@/lib/wa/types';
import type { BotDeps } from './types';
import { langOf, t, type Lang } from './i18n';

/** Phrases (any script, plus the way people type them in English letters) that mean "I took it". Matched on short messages. */
const CONFIRM_PHRASES = [
  // English
  'taken', 'took', 'done', 'yes', 'okay', 'ok', 'had it', 'finished',
  // Malayalam (script and Manglish)
  'കഴിച്ചു', 'കഴിച്ചൂ', 'കഴിച്ചു ട്ടോ', 'എടുത്തു', 'ശരി', 'ആം', 'അതെ', 'ഓക്കെ', 'ഓകെ',
  'kazhichu', 'kazhichuu', 'kazhicchu', 'kazhichhu', 'kazhich', 'eduthu', 'sheri', 'shari', 'aam', 'athe',
  // Hindi
  'ले ली', 'ले लिया', 'खा ली', 'खा लिया', 'हाँ', 'हां', 'जी', 'ठीक है', 'हो गया', 'ले लीं', 'le li', 'le liya', 'kha li', 'kha liya', 'haan', 'ji', 'theek hai', 'ho gaya',
  // Urdu
  'لے لی', 'لے لیا', 'کھا لی', 'کھا لیا', 'ہاں', 'جی', 'ٹھیک ہے', 'ہو گیا',
  // emoji
  '👍', '✅', '🙏', '👌', '❤️', '😊',
];
/** A "no" anywhere makes it NOT a confirmation ("not taken", "കഴിച്ചില്ല", "नहीं ली", "نہیں لی"). */
const NEGATION = /(^|[\s,.!?])(not|no|nope|didn'?t|haven'?t|nahi|nahin|nhi|illa|illaa|alla|na)([\s,.!?]|$)|ഇല്ല|അല്ല|नहीं|नही|نہیں|نہ |کچھ نہیں|kazhichilla|kazhichittilla/i;
const POSITIVE_REACTIONS = ['👍', '✅', '👌', '❤️', '🙏', '😊', '💊', '👍🏻', '👍🏽', '👍🏾', '👍🏿', '👍🏼'];

export function isConfirmation(raw: string): boolean {
  const s = raw.trim().toLowerCase().replace(/[.!؟?,।]+$/g, '').trim();
  if (!s || s.length > 30 || NEGATION.test(s)) return false;
  const words = s.split(/\s+/);
  // Very short phrases ("ok", "ji", "ശരി") must be the whole message or a whole word; longer ones may sit inside it.
  return CONFIRM_PHRASES.some((p) => (Array.from(p).length <= 3 ? words.includes(p) : s.includes(p)));
}

export async function handleCare(d: BotDeps, link: WaLink, msg: InboundMessage): Promise<void> {
  const lang: Lang = langOf(link);
  const m = d.meds;
  d.markRead(msg.id).catch(() => undefined);
  if (msg.timestamp > link.lastInboundAt) d.updateLink(msg.from, { lastInboundAt: msg.timestamp }).catch(() => undefined);
  if (!m) { await d.sendText(msg.from, t(lang, 'medHelp')); return; }
  const now = d.now();

  const confirm = async (doseId: string) => {
    const r = await m.takeDose(doseId, msg.from, now);
    if (!r.ok) { await d.sendText(msg.from, t(lang, 'medNothingDue')); return; }
    await d.sendText(msg.from, t(r.lang, 'medThanks', { name: r.name }));
  };

  // Button taps (interactive reply, or the quick-reply on the template).
  if (msg.reply) {
    const id = msg.reply.id;
    if (id.startsWith('med:taken:')) { await confirm(id.slice('med:taken:'.length)); return; }
    if (id.startsWith('med:later:')) {
      const r = await m.snoozeDose(id.slice('med:later:'.length), msg.from, now);
      await d.sendText(msg.from, r.ok ? t(r.lang, 'medLater') : t(lang, 'medNothingDue'));
      return;
    }
    await d.sendText(msg.from, t(lang, 'medHelp'));
    return;
  }

  // A thumbs-up on the reminder itself counts as "taken".
  if (msg.type === 'reaction') {
    const emoji = msg.reaction?.emoji ?? '';
    if (!POSITIVE_REACTIONS.includes(emoji)) return;
    const open = await m.openDosesFor(msg.from, now);
    const hit = open.find((x) => x.wamid && x.wamid === msg.reaction?.messageId);
    if (hit) await confirm(hit.id);
    return;
  }

  if (msg.type === 'text' && msg.text) {
    if (isConfirmation(msg.text)) {
      const open = await m.openDosesFor(msg.from, now);
      if (open[0]) await confirm(open[0].id);
      else await d.sendText(msg.from, t(lang, 'medNothingDue'));
      return;
    }
    await m.forwardToOwner(msg.from, { text: msg.text }, now);
    await d.sendText(msg.from, t(lang, 'medPassedOn'));
    return;
  }
  // Voice note, photo, document...
  await m.forwardToOwner(msg.from, { media: true }, now);
  await d.sendText(msg.from, t(lang, 'medPassedOn'));
}
