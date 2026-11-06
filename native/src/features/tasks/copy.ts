/** Coach copy for the task screens. Short, direct, a little strict. Picked deterministically per day so it does not flicker. */
import { Linking } from 'react-native';

export const COACH_WHATSAPP = 'https://wa.me/96560091617';

export function openCoachWhatsApp(): void {
  void Linking.openURL(COACH_WHATSAPP).catch(() => {});
}

function pick<T>(list: T[], seed: string): T {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return list[Math.abs(h) % list.length];
}

export function leftLine(left: number, done: number, seed: string): { big: string; small: string } {
  if (left === 0 && done === 0) return { big: 'Nothing yet', small: 'Add one. Start small.' };
  if (left === 0) return { big: 'All done', small: pick(['Cleared. Do not get comfortable.', 'Clean list. Tomorrow starts early.', 'Good. Now rest properly.'], seed) };
  if (left === 1) return { big: '1 left', small: pick(['One. Finish it.', 'Last one. Go.', 'So close. Do not stop.'], seed) };
  if (left <= 3) return { big: `${left} left`, small: pick(['Move.', 'Pick one. Start.', 'That is nothing. Go.'], seed) };
  return { big: `${left} left`, small: pick(['Pick the first one. Start.', 'One at a time. Start now.', 'Long list. Short excuses.'], seed) };
}

export function clearedLine(seed: string): string {
  return pick(
    ['List cleared. Do not get comfortable.', 'Done. Tomorrow I expect the same.', 'Everything ticked. That is the standard.', 'Clean sheet. Do not slack tomorrow.'],
    seed,
  );
}

export function recapLine(done: number, total: number, streak: number, seed: string): string {
  if (total === 0) return 'No plan, no progress. Tomorrow, plan.';
  if (done === total) return pick(['Everything done. Exactly right.', 'Full marks. Keep that standard.'], seed);
  if (done === 0) return pick(['Zero. We both know you can do better.', 'Nothing done. Tomorrow is a fresh start, not a free pass.'], seed);
  if (done / total >= 0.6) return streak > 2 ? `Solid. ${streak} days running, keep it alive.` : 'Solid day. Finish the rest tomorrow.';
  return 'Half a day. Tomorrow, fewer tasks and more finishing.';
}
