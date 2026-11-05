// WhatsApp side effects of the calendar flow (kept out of googleCal.ts so its tests stay network-free).
import * as linksMod from '../wa/links';
import * as sendMod from '../wa/send';

export const waChatUrl = (): string => `https://wa.me/${process.env.NUDGE_WA_NUMBER ?? ''}`;

/** After a browser-side connect that started on WhatsApp: confirm in the chat. Best effort (outside the 24 h window it is dropped). */
export async function notifyConnected(uid: string, email: string | undefined, created: number): Promise<void> {
  const link = await linksMod.getLinkByUid(uid);
  if (!link) return;
  const lines = [
    `📅 Google Calendar connected${email ? ` (${email})` : ''}.`,
    created
      ? `I added ${created} upcoming task${created === 1 ? '' : 's'} to a calendar called *Nudge*.`
      : 'Tasks with a time (like "gym 6pm") will show up in a calendar called *Nudge*.',
    'Send */sync* anytime to check it or turn it off.',
  ];
  await sendMod.sendText(link.waId, lines.join('\n'));
}
