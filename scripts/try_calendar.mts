// Renders sample calendar images to ./tmp-cal/*.png so the design can be eyeballed: npx tsx scripts/try_calendar.mts
import { mkdirSync, writeFileSync } from 'node:fs';
import type { Task } from '../lib/types';
import { buildMonth, buildWeek } from '../lib/calendar/events';
import { renderMonthPng, renderWeekPng } from '../lib/calendar/render';

const tz = 'Asia/Kuwait';
const today = '2026-11-05';
const mk = (id: string, text: string, deferredTo?: string, o: Partial<Task> = {}): Task => ({
  id, userId: 'u', text, isPrivate: false, completed: false, createdAt: 1, completedAt: null, deferredTo, ...o,
});
const tasks: Task[] = [
  mk('1', 'Gym', '2026-11-02T18:00', { completed: true }),
  mk('2', 'Call mom', '2026-11-03', { completed: true }),
  mk('3', 'Finish pitch deck', '2026-11-05T10:30'),
  mk('4', 'Gym', '2026-11-05T18:00'),
  mk('5', 'Dentist appointment', '2026-11-05T16:15'),
  mk('6', 'Reply to Ali', '2026-11-05'),
  mk('7', 'Pay rent', '2026-11-07', { dueDate: Date.parse('2026-11-07T09:00:00+03:00') }),
  mk('8', 'Submit tax docs', undefined, { dueDate: Date.parse('2026-11-12T17:00:00+03:00') }),
  mk('9', 'Team sync', '2026-11-09T11:00'),
  mk('10', 'Birthday dinner', '2026-11-14T20:00'),
  mk('11', 'Read 20 pages', '2026-11-05', { recurrence: { frequency: 'daily', startDate: '2026-11-01', completedDates: ['2026-11-01', '2026-11-02', '2026-11-03'] } }),
  mk('12', 'مراجعة العرض', '2026-11-06T09:00'),
  mk('13', 'Buy gifts', '2026-11-21'), mk('14', 'Flight to Kochi', '2026-11-21T06:00'), mk('15', 'Pack', '2026-11-20'), mk('16', 'Pick up visa', '2026-11-21'),
  mk('17', 'Someday: learn guitar'), mk('18', 'ജിമ്മിൽ പോകണം', '2026-11-06T07:00'), mk('19', '🎂 Mom birthday', '2026-11-06'),
];
mkdirSync('tmp-cal', { recursive: true });
const m = buildMonth(tasks, tz, today, 0);
const w = buildWeek(tasks, tz, today, 0);
const [mp, wp] = await Promise.all([renderMonthPng(m), renderWeekPng(w)]);
writeFileSync('tmp-cal/month.png', mp);
writeFileSync('tmp-cal/week.png', wp);
console.log('ok', mp.length, wp.length, 'total', m.total, 'done', m.done, 'undated', m.undated);
