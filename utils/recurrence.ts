import { Recurrence } from '@/lib/types';

/** Day names for parsing (0=Sun) */
const DAY_NAMES: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

/** Parse recurrence from natural text. Returns { recurrence, cleanedText } or null. */
export function parseRecurrenceFromText(text: string): { recurrence: Recurrence; cleanedText: string } | null {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  // Patterns that indicate recurrence (order matters - more specific first)
  const patterns: Array<{ regex: RegExp; frequency: Recurrence['frequency']; days?: number[] }> = [
    // "every weekday" / "weekdays"
    { regex: /\b(every\s+)?weekday(s)?\b/i, frequency: 'weekdays' },
    { regex: /\bweekday(s)?\b/i, frequency: 'weekdays' },
    // "daily" / "every day" / "each day"
    { regex: /\b(every\s+)?daily\b/i, frequency: 'daily' },
    { regex: /\b(every\s+)?(each\s+)?day\b/i, frequency: 'daily' },
    // "weekly" / "every week"
    { regex: /\b(every\s+)?weekly\b/i, frequency: 'weekly' },
    { regex: /\b(every\s+)?week\b/i, frequency: 'weekly' },
    // "every monday" / "on mondays" / "mondays"
    { regex: /\b(every|on)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b/i, frequency: 'custom' },
    { regex: /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b/i, frequency: 'custom' },
  ];

  let match: RegExpMatchArray | null = null;
  let matchedPattern: (typeof patterns)[0] | null = null;

  for (const p of patterns) {
    match = lower.match(p.regex);
    if (match) {
      matchedPattern = p;
      break;
    }
  }

  if (!match || !matchedPattern) return null;

  const today = new Date();
  const startDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  let days: number[] | undefined;
  if (matchedPattern.frequency === 'custom') {
    const dayPart = (match[2] ?? match[1] ?? match[0]).replace(/s$/i, '').toLowerCase();
    const dayNum = DAY_NAMES[dayPart];
    if (dayNum !== undefined) {
      days = [dayNum];
    } else {
      days = [today.getDay()];
    }
  }

  const recurrence: Recurrence = {
    frequency: matchedPattern.frequency,
    startDate,
    ...(days !== undefined && { days }),
  };

  // Remove the recurrence phrase from text (keep task description)
  const phrase = match[0];
  const phraseStart = lower.indexOf(phrase);
  let cleanedText = trimmed;
  if (phraseStart >= 0) {
    const before = trimmed.slice(0, phraseStart).trim();
    const after = trimmed.slice(phraseStart + phrase.length).trim();
    cleanedText = [before, after].filter(Boolean).join(' ').trim();
  }
  if (!cleanedText) cleanedText = trimmed; // fallback

  return { recurrence, cleanedText };
}

/** Days between two dates (YYYY-MM-DD) */
function daysBetween(a: string, b: string): number {
  const d1 = new Date(a);
  const d2 = new Date(b);
  return Math.floor((d2.getTime() - d1.getTime()) / (24 * 60 * 60 * 1000));
}

/** Weeks between two dates (YYYY-MM-DD), aligned to startDate */
function weeksBetween(startDate: string, dateStr: string): number {
  const d = daysBetween(startDate, dateStr);
  return Math.floor(d / 7);
}

/** Check if past end condition */
function isPastEnd(recurrence: Recurrence, dateStr: string, occurrenceIndex: number): boolean {
  if (recurrence.endType === 'never' || !recurrence.endType) return false;
  if (recurrence.endType === 'onDate' && recurrence.endDate) return dateStr > recurrence.endDate;
  if (recurrence.endType === 'afterOccurrences' && recurrence.endAfterOccurrences != null) {
    return occurrenceIndex >= recurrence.endAfterOccurrences;
  }
  return false;
}

/** Check if a date (YYYY-MM-DD) matches the recurrence schedule */
export function dateMatchesRecurrence(recurrence: Recurrence, dateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const dayOfWeek = date.getDay(); // 0=Sun, 6=Sat
  const dayOfMonth = date.getDate();

  if (dateStr < recurrence.startDate) return false;

  const [sy, sm, sd] = recurrence.startDate.split('-').map(Number);
  const startDateObj = new Date(sy, sm - 1, sd);
  const startDayOfWeek = startDateObj.getDay();
  const startDayOfMonth = startDateObj.getDate();

  let matches = false;
  let occurrenceIndex = 0;

  switch (recurrence.frequency) {
    case 'daily':
      matches = true;
      occurrenceIndex = daysBetween(recurrence.startDate, dateStr);
      break;
    case 'weekdays':
      matches = dayOfWeek >= 1 && dayOfWeek <= 5;
      if (matches) {
        let count = 0;
        for (let i = 0; i <= daysBetween(recurrence.startDate, dateStr); i++) {
          const d = new Date(sy, sm - 1, sd + i);
          const dow = d.getDay();
          if (dow >= 1 && dow <= 5) count++;
        }
        occurrenceIndex = count - 1;
      }
      break;
    case 'weekly': {
      const weeklyDays = recurrence.days?.length ? recurrence.days : [startDayOfWeek];
      matches = weeklyDays.includes(dayOfWeek);
      if (matches) occurrenceIndex = weeksBetween(recurrence.startDate, dateStr);
      break;
    }
    case 'biweekly': {
      const biweeklyDays = recurrence.days?.length ? recurrence.days : [startDayOfWeek];
      matches = biweeklyDays.includes(dayOfWeek);
      if (matches) {
        const w = weeksBetween(recurrence.startDate, dateStr);
        matches = w % 2 === 0;
        occurrenceIndex = Math.floor(w / 2);
      }
      break;
    }
    case 'monthly':
      if (recurrence.dayOfMonth === -1 || recurrence.dayOfMonth === 31) {
        const lastDay = new Date(y, m, 0).getDate();
        matches = dayOfMonth === lastDay;
      } else {
        const targetDay = recurrence.dayOfMonth ?? startDayOfMonth;
        matches = dayOfMonth === Math.min(targetDay, new Date(y, m, 0).getDate());
      }
      if (matches) {
        occurrenceIndex = (y - sy) * 12 + (m - sm);
      }
      break;
    case 'custom':
      const interval = recurrence.interval ?? 1;
      const unit = recurrence.intervalUnit ?? 'days';
      if (unit === 'days') {
        const d = daysBetween(recurrence.startDate, dateStr);
        matches = d % interval === 0;
        occurrenceIndex = Math.floor(d / interval);
      } else if (unit === 'weeks') {
        const days = recurrence.days ?? [startDayOfWeek];
        matches = days.includes(dayOfWeek);
        if (matches) {
          const w = weeksBetween(recurrence.startDate, dateStr);
          matches = w % interval === 0;
          occurrenceIndex = Math.floor(w / interval);
        }
      } else {
        // months
        const dom = recurrence.dayOfMonth ?? startDayOfMonth;
        const lastDayOfThisMonth = new Date(y, m, 0).getDate();
        const targetDay = dom === -1 ? lastDayOfThisMonth : Math.min(dom, lastDayOfThisMonth);
        matches = dayOfMonth === targetDay;
        if (matches) {
          const monthsDiff = (y - sy) * 12 + (m - sm);
          matches = monthsDiff % interval === 0;
          occurrenceIndex = Math.floor(monthsDiff / interval);
        }
      }
      break;
    default:
      return false;
  }

  if (!matches) return false;
  return !isPastEnd(recurrence, dateStr, occurrenceIndex);
}

const DAY_NAMES_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Human-readable label for recurrence (compact, for chips) */
export function formatRecurrenceLabel(recurrence: Recurrence): string {
  switch (recurrence.frequency) {
    case 'daily':
      return 'every day';
    case 'weekdays':
      return 'every weekday';
    case 'weekly':
      if (recurrence.days?.length === 1) {
        return `every ${DAY_NAMES_FULL[recurrence.days[0]]}`;
      }
      if (recurrence.days && recurrence.days.length > 1) {
        return recurrence.days.sort((a, b) => a - b).map(d => DAY_NAMES_SHORT[d]).join(', ');
      }
      return 'every week';
    case 'biweekly':
      if (recurrence.days?.length === 1) {
        return `every 2 weeks on ${DAY_NAMES_FULL[recurrence.days[0]]}`;
      }
      if (recurrence.days && recurrence.days.length > 1) {
        return `every 2 weeks on ${recurrence.days.sort((a, b) => a - b).map(d => DAY_NAMES_SHORT[d]).join(', ')}`;
      }
      return 'every 2 weeks';
    case 'monthly':
      if (recurrence.dayOfMonth === -1 || recurrence.dayOfMonth === 31) {
        return 'last day of month';
      }
      const dom = recurrence.dayOfMonth ?? 1;
      const suffix = dom === 1 ? 'st' : dom === 2 ? 'nd' : dom === 3 ? 'rd' : 'th';
      return `${dom}${suffix} of each month`;
    case 'custom':
      const interval = recurrence.interval ?? 1;
      const unit = recurrence.intervalUnit ?? 'days';
      if (unit === 'days') {
        return interval === 1 ? 'every day' : `every ${interval} days`;
      }
      if (unit === 'weeks') {
        if (recurrence.days && recurrence.days.length > 0) {
          const dayStr = recurrence.days.length === 1
            ? DAY_NAMES_FULL[recurrence.days[0]]
            : recurrence.days.sort((a, b) => a - b).map(d => DAY_NAMES_SHORT[d]).join(', ');
          return interval === 1 ? `every week on ${dayStr}` : `every ${interval} weeks on ${dayStr}`;
        }
        return interval === 1 ? 'every week' : `every ${interval} weeks`;
      }
      if (unit === 'months') {
        const dm = recurrence.dayOfMonth ?? 1;
        if (dm === -1) {
          return interval === 1 ? 'last day of each month' : `every ${interval} months (last day)`;
        }
        const suf = dm === 1 ? 'st' : dm === 2 ? 'nd' : dm === 3 ? 'rd' : 'th';
        return interval === 1 ? `${dm}${suf} of each month` : `every ${interval} months on the ${dm}${suf}`;
      }
      return 'custom';
    default:
      return 'custom';
  }
}

/** Full human-readable summary for recurrence picker */
export function getRecurrenceSummary(recurrence: Recurrence | null): string {
  if (!recurrence) return '';
  const base = formatRecurrenceLabel(recurrence);
  const parts: string[] = [`Repeats ${base}`];
  if (recurrence.endType === 'onDate' && recurrence.endDate) {
    parts.push(`, ends ${recurrence.endDate}`);
  } else if (recurrence.endType === 'afterOccurrences' && recurrence.endAfterOccurrences != null) {
    parts.push(`, ends after ${recurrence.endAfterOccurrences} times`);
  }
  return parts.join('');
}
