/** Pure label helpers for routines (same wording as the web RoutinesSheet). */
export const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function daysText(days: number[]): string {
  if (!days.length || days.length === 7) return 'Every day';
  const k = [...days].sort().join(',');
  if (k === '1,2,3,4,5') return 'Weekdays';
  if (k === '0,6') return 'Weekends';
  return [...days].sort().map((d) => DAY_NAMES[d]).join(', ');
}

export const dayFull = (d: number) => DAY_FULL[d];
