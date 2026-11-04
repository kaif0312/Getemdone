// WhatsApp onboarding for friends who were added by number (scripts/add_friend.mjs) instead of the web app.
// State lives on the link: waLinks/{waId}.onboarding = { step, tz? }. No `onboarding` field = nothing to do, so every
// existing user is untouched. `setup` (or /setup) re-runs it for anyone. The scheduler skips links that are mid-setup.
// Steps: welcome -> name -> tz -> tzconfirm -> morning -> recap -> goal -> done (field set to null).
import type { InboundMessage, WaLink, OnboardStep } from '@/lib/wa/types';
import type { BotDeps } from './types';
import { time12 } from './format';

/** Cities / countries people type, no model needed. Lowercase keys. */
const PLACES: Record<string, string> = {
  belgium: 'Europe/Brussels', brussels: 'Europe/Brussels', antwerp: 'Europe/Brussels', ghent: 'Europe/Brussels', leuven: 'Europe/Brussels',
  netherlands: 'Europe/Amsterdam', amsterdam: 'Europe/Amsterdam', germany: 'Europe/Berlin', berlin: 'Europe/Berlin',
  france: 'Europe/Paris', paris: 'Europe/Paris', spain: 'Europe/Madrid', madrid: 'Europe/Madrid', italy: 'Europe/Rome', rome: 'Europe/Rome',
  switzerland: 'Europe/Zurich', zurich: 'Europe/Zurich', sweden: 'Europe/Stockholm', ireland: 'Europe/Dublin', dublin: 'Europe/Dublin',
  uk: 'Europe/London', 'united kingdom': 'Europe/London', england: 'Europe/London', london: 'Europe/London',
  turkey: 'Europe/Istanbul', istanbul: 'Europe/Istanbul', moscow: 'Europe/Moscow', russia: 'Europe/Moscow',
  uae: 'Asia/Dubai', dubai: 'Asia/Dubai', 'abu dhabi': 'Asia/Dubai', sharjah: 'Asia/Dubai', 'united arab emirates': 'Asia/Dubai',
  kuwait: 'Asia/Kuwait', saudi: 'Asia/Riyadh', 'saudi arabia': 'Asia/Riyadh', riyadh: 'Asia/Riyadh', jeddah: 'Asia/Riyadh',
  qatar: 'Asia/Qatar', doha: 'Asia/Qatar', oman: 'Asia/Muscat', muscat: 'Asia/Muscat', bahrain: 'Asia/Bahrain',
  india: 'Asia/Kolkata', kerala: 'Asia/Kolkata', mumbai: 'Asia/Kolkata', delhi: 'Asia/Kolkata', bangalore: 'Asia/Kolkata',
  bengaluru: 'Asia/Kolkata', kochi: 'Asia/Kolkata', calicut: 'Asia/Kolkata', kozhikode: 'Asia/Kolkata', chennai: 'Asia/Kolkata',
  pakistan: 'Asia/Karachi', karachi: 'Asia/Karachi', 'sri lanka': 'Asia/Colombo', colombo: 'Asia/Colombo',
  bangladesh: 'Asia/Dhaka', dhaka: 'Asia/Dhaka', singapore: 'Asia/Singapore', malaysia: 'Asia/Kuala_Lumpur',
  korea: 'Asia/Seoul', 'south korea': 'Asia/Seoul', seoul: 'Asia/Seoul', japan: 'Asia/Tokyo', tokyo: 'Asia/Tokyo',
  china: 'Asia/Shanghai', 'hong kong': 'Asia/Hong_Kong', australia: 'Australia/Sydney', sydney: 'Australia/Sydney',
  melbourne: 'Australia/Melbourne', 'new zealand': 'Pacific/Auckland', egypt: 'Africa/Cairo', cairo: 'Africa/Cairo',
  nigeria: 'Africa/Lagos', 'south africa': 'Africa/Johannesburg', kenya: 'Africa/Nairobi',
  'new york': 'America/New_York', nyc: 'America/New_York', usa: 'America/New_York', us: 'America/New_York',
  chicago: 'America/Chicago', 'los angeles': 'America/Los_Angeles', la: 'America/Los_Angeles', 'san francisco': 'America/Los_Angeles',
  toronto: 'America/Toronto', canada: 'America/Toronto', brazil: 'America/Sao_Paulo', mexico: 'America/Mexico_City',
};

export function validZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz.includes('/')) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

/** "Belgium", "i live in Brussels" -> IANA zone from the table, else null (the caller may ask the model). */
export function zoneFromTable(input: string): string | null {
  const t = input.toLowerCase().replace(/^(i'?m|i am|im|in|from|living in|i live in|based in)\s+/, '').replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (PLACES[t]) return PLACES[t];
  const hit = Object.keys(PLACES).filter((k) => k.length > 2).sort((a, b) => b.length - a.length).find((k) => new RegExp(`\\b${k}\\b`).test(t));
  return hit ? PLACES[hit] : null;
}

/** "6", "6:30", "7am", "9 pm", "21:00" -> "HH:mm"; null if not a time. */
export function parseClock(s: string): string | null {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(s.trim());
  if (!m) return null;
  let h = +m[1];
  const min = m[2] ? +m[2] : 0;
  const ap = m[3]?.toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** "call me Hassan", "I'm Hassan." -> "Hassan"; null if it does not look like a name. */
export function parseName(s: string): string | null {
  if (/\d/.test(s)) return null; // 'gym 6pm' is a task, not a name
  const t = s.replace(/[^\p{L}\p{M}\s'.-]/gu, ' ').replace(/\s+/g, ' ').trim().replace(/^(my name is|call me|i'?m|i am|im|it'?s|its|this is|name is)\s+/i, '').replace(/[.!,]+$/g, '').trim();
  if (!t || t.length > 30 || !/\p{L}/u.test(t) || /\d/.test(t) || t.split(/\s+/).length > 3) return null;
  return t.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

const TZ_TOOL = {
  name: 'set_timezone',
  description: 'The IANA timezone of the place the user named. Empty string if it is not a real place.',
  parameters: { type: 'object', properties: { timezone: { type: 'string', description: 'IANA name like Europe/Brussels, or empty' } }, required: ['timezone'] },
};

async function zoneFromModel(d: BotDeps, input: string): Promise<string | null> {
  try {
    const r = await d.gemini({
      system: 'Map the place the user names (city, region or country) to one IANA timezone. For a country with several zones pick the most populated. Always call set_timezone.',
      user: [{ text: input.slice(0, 120) }],
      tools: [TZ_TOOL],
    });
    const tz = String(r.calls.find((c) => c.name === 'set_timezone')?.args.timezone ?? '');
    return validZone(tz) ? tz : null;
  } catch (e) {
    console.error('[onboarding] tz model failed', e);
    return null;
  }
}

const OFF = /^(no|none|off|skip|nope|never|no thanks)$/i;

async function setStep(d: BotDeps, link: WaLink, step: OnboardStep, tz?: string, nm?: string): Promise<void> {
  await d.updateLink(link.waId, { onboarding: { step, ...(tz ? { tz } : {}), ...(nm ? { nm } : {}) } });
}

async function ask(d: BotDeps, to: string, step: OnboardStep, ctx: { name?: string; tz?: string; now: number }): Promise<void> {
  switch (step) {
    case 'name':
      await d.sendText(to, 'What should I call you?');
      return;
    case 'tz':
      await d.sendText(to, `Nice to meet you${ctx.name ? `, *${ctx.name}*` : ''}! 🙌\n\nWhich city or country are you in? I use it so check-ins and reminders arrive at the right local time.`);
      return;
    case 'tzconfirm': {
      const t = ctx.tz!;
      await d.sendButtons(to, `That's *${t.split('/').pop()!.replace(/_/g, ' ')}* time (${t}). It's ${time12(d.localTime(t, ctx.now))} there now. Right?`, [
        { id: 'ob:tz:yes', title: 'Yes, correct' }, { id: 'ob:tz:no', title: 'No, change it' },
      ]);
      return;
    }
    case 'morning':
      await d.sendButtons(to, 'When should I check in with you each morning? Tap a time, or type your own (like 6:30).', [
        { id: 'ob:morning:07:00', title: '7:00 AM' }, { id: 'ob:morning:08:00', title: '8:00 AM' }, { id: 'ob:morning:09:00', title: '9:00 AM' },
      ]);
      return;
    case 'recap':
      await d.sendButtons(to, 'And an evening recap of how your day went? Tap a time, type your own, or say no.', [
        { id: 'ob:recap:20:00', title: '8:00 PM' }, { id: 'ob:recap:21:00', title: '9:00 PM' }, { id: 'ob:recap:off', title: 'No recap' },
      ]);
      return;
    case 'goal':
      await d.sendButtons(to, 'Last one: what do you mainly want me for?', [
        { id: 'ob:goal:tasks', title: 'Tasks & reminders' }, { id: 'ob:goal:fitness', title: 'Fitness' }, { id: 'ob:goal:both', title: 'Both' },
      ]);
      return;
    default:
  }
}

const INTRO = [
  "Hey! I'm *Nudge* 👋 your todo and accountability buddy, right here in WhatsApp.",
  '',
  'Quick setup first (5 questions, 30 seconds) so I fit you. Send *skip* to keep any default.',
].join('\n');

/**
 * Returns true when the message belonged to onboarding (the caller must stop). Call right after the link lookup.
 * Not mid-setup and not asking for `setup` -> false and nothing happens.
 */
export async function maybeOnboard(d: BotDeps, link: WaLink, msg: InboundMessage): Promise<boolean> {
  if (msg.type === 'reaction') return !!link.onboarding;
  const text = msg.type === 'text' ? (msg.text ?? '').trim() : '';
  const now = d.now();

  if (/^\/?(setup|onboarding)$/i.test(text)) {
    await d.sendText(msg.from, INTRO);
    await setStep(d, link, 'name');
    await ask(d, msg.from, 'name', { now });
    return true;
  }
  const ob = link.onboarding;
  if (!ob) return false;
  d.markRead(msg.id, true).catch(() => undefined);
  const reply = msg.reply?.id ?? '';
  const skip = /^\/?skip$/i.test(text);
  const typed = text && !skip ? text : '';
  const name = (await d.getUserLite(link.uid))?.displayName;
  const nameForAsk = name && name !== 'Friend' ? name : undefined;

  const goTo = async (step: OnboardStep, extra: { name?: string; tz?: string } = {}) => {
    await setStep(d, link, step, extra.tz);
    await ask(d, msg.from, step, { now, name: extra.name ?? nameForAsk, tz: extra.tz });
  };

  switch (ob.step) {
    case 'welcome': {
      await d.sendText(msg.from, INTRO);
      const pn = msg.profileName ? parseName(msg.profileName) : null;
      await setStep(d, link, 'name', undefined, pn ?? undefined);
      if (pn) {
        await d.sendButtons(msg.from, `What should I call you? WhatsApp says *${pn}*.`, [{ id: `ob:name:keep`, title: `Call me ${pn}`.slice(0, 20) }]);
      } else await ask(d, msg.from, 'name', { now });
      return true;
    }
    case 'name': {
      let n: string | null = null;
      if (reply === 'ob:name:keep') n = ob.nm ?? parseName(msg.profileName ?? '');
      else if (typed) n = parseName(typed);
      if (skip) n = ob.nm ?? parseName(msg.profileName ?? '') ?? 'Friend';
      if (!n) { await d.sendText(msg.from, "Just the name you'd like me to use, like *Hassan*."); return true; }
      await d.setProfile?.(link.uid, { displayName: n });
      await goTo('tz', { name: n });
      return true;
    }
    case 'tz': {
      if (skip) { await goTo('morning'); return true; }
      if (!typed) { await d.sendText(msg.from, 'Type your city or country, like *Brussels*.'); return true; }
      const tz = zoneFromTable(typed) ?? (await zoneFromModel(d, typed));
      if (!tz) { await d.sendText(msg.from, "I couldn't place that. Try the nearest big city or your country, like *Brussels* or *Belgium*."); return true; }
      await goTo('tzconfirm', { tz });
      return true;
    }
    case 'tzconfirm': {
      const tz = ob.tz;
      const yes = reply === 'ob:tz:yes' || /^(y|yes|yeah|yep|ok|okay|correct|right)$/i.test(text);
      if (yes && tz && validZone(tz)) {
        await d.updateLink(link.waId, { timezone: tz });
        await d.setProfile?.(link.uid, { timezone: tz });
        await goTo('morning');
      } else {
        await setStep(d, link, 'tz');
        await d.sendText(msg.from, 'No problem. Which city or country are you in?');
      }
      return true;
    }
    case 'morning': {
      let t: string | null | undefined;
      if (reply.startsWith('ob:morning:')) t = reply.slice('ob:morning:'.length);
      else if (skip) t = link.checkinTime ?? '08:00';
      else if (OFF.test(text)) t = null;
      else t = parseClock(text) ?? undefined;
      if (t === undefined) { await d.sendText(msg.from, 'Tap a time, or type one like *6:30* or *7am*. Say *no* for no morning check-in.'); return true; }
      await d.updateLink(link.waId, { checkinTime: t });
      await goTo('recap');
      return true;
    }
    case 'recap': {
      let t: string | null | undefined;
      if (reply === 'ob:recap:off' || OFF.test(text)) t = null;
      else if (reply.startsWith('ob:recap:')) t = reply.slice('ob:recap:'.length);
      else if (skip) t = link.recapTime ?? '21:00';
      else t = parseClock(text) ?? undefined;
      if (t === undefined) { await d.sendText(msg.from, 'Tap a time, or type one like *9pm*. Say *no* for no recap.'); return true; }
      await d.updateLink(link.waId, { recapTime: t });
      await goTo('goal');
      return true;
    }
    case 'goal': {
      const pick = reply.startsWith('ob:goal:') ? reply.slice('ob:goal:'.length)
        : /fit|gym|workout|run/i.test(text) ? (/task|todo|remind/i.test(text) ? 'both' : 'fitness')
        : /task|todo|remind|plan/i.test(text) ? 'tasks' : /both|all|everything/i.test(text) ? 'both' : skip ? 'both' : '';
      if (!pick) { await d.sendText(msg.from, 'Tap one: *Tasks & reminders*, *Fitness* or *Both*.'); return true; }
      await d.updateLink(link.waId, { interest: pick as 'tasks' | 'fitness' | 'both', onboarding: null });
      const n = (await d.getUserLite(link.uid))?.displayName;
      const ci = link.checkinTime;
      const rc = link.recapTime;
      const lines = [
        `All set${n && n !== 'Friend' ? `, *${n}*` : ''}! 🎉`,
        '',
        `• Morning check-in: ${ci ? time12(ci) : 'off'}`,
        `• Evening recap: ${rc ? time12(rc) : 'off'}`,
        '',
        'Just tell me things:',
        '• "gym 6pm, call mom, deck by Fri" adds tasks',
        '• *today* shows your list, *done 2* ticks one off',
        pick === 'tasks' ? '• Voice notes and screenshots work too' : '• "ran 5k in 28 min" logs a workout',
        '',
        'Send *help* any time, or *setup* to redo this.',
      ];
      if (d.sendSticker) { try { await d.sendSticker(msg.from, 'blowing'); } catch { /* decoration */ } }
      await d.sendText(msg.from, lines.join('\n'));
      return true;
    }
  }
  return true;
}
