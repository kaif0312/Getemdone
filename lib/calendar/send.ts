// Render a calendar model to PNG, upload it to WhatsApp and send it with buttons. Kept apart from lib/bot so tests never
// load next/og. Returns false (never throws) so the bot can fall back to a text agenda.
import { renderMonthPng, renderWeekPng } from './render';
import type { MonthModel, WeekModel } from './events';
import { sendImageButtons, sendImageId, uploadMedia } from '@/lib/wa/media';

export async function sendCalendarImage(
  to: string,
  view: 'month' | 'week',
  model: MonthModel | WeekModel,
  caption: string,
  buttons: { id: string; title: string }[],
): Promise<boolean> {
  try {
    const png = view === 'month' ? await renderMonthPng(model as MonthModel) : await renderWeekPng(model as WeekModel);
    const mediaId = await uploadMedia(png, 'image/png', `nudge-${view}.png`);
    if (!mediaId) return false;
    if (buttons.length && (await sendImageButtons(to, mediaId, caption, buttons))) return true;
    return !!(await sendImageId(to, mediaId, caption));
  } catch (e) {
    console.error('[calendar] render/send failed', e);
    return false;
  }
}
