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

/** Check if a date (YYYY-MM-DD) matches the recurrence schedule */
export function dateMatchesRecurrence(recurrence: Recurrence, dateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const dayOfWeek = date.getDay(); // 0=Sun, 6=Sat

  if (dateStr < recurrence.startDate) return false;

  switch (recurrence.frequency) {
    case 'daily':
      return true;
    case 'weekdays':
      return dayOfWeek >= 1 && dayOfWeek <= 5;
    case 'weekly':
      return recurrence.days?.includes(dayOfWeek) ?? true;
    case 'custom':
      return (recurrence.days?.length ?? 0) > 0 && (recurrence.days?.includes(dayOfWeek) ?? false);
    default:
      return false;
  }
}

/** Human-readable label for recurrence */
export function formatRecurrenceLabel(recurrence: Recurrence): string {
  switch (recurrence.frequency) {
    case 'daily':
      return 'every day';
    case 'weekdays':
      return 'every weekday';
    case 'weekly':
      if (recurrence.days?.length === 1) {
        const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return `every ${names[recurrence.days[0]]}`;
      }
      return 'every week';
    case 'custom':
      if (recurrence.days?.length === 1) {
        const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return `every ${names[recurrence.days[0]]}`;
      }
      if (recurrence.days && recurrence.days.length > 1) {
        const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        return recurrence.days.sort((a, b) => a - b).map(d => names[d]).join(', ');
      }
      return 'custom';
    default:
      return 'custom';
  }
}
