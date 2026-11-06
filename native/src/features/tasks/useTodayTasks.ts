/** Shared "what is on my plate today" model for Today, the focus ritual and the recap. */
import { useEffect, useMemo, useState } from 'react';
import { useTasks } from '@/hooks/useTasks';
import { useToday } from '@/hooks/useToday';
import { localTime } from '@/lib/dates';
import { shouldShowInTodayView } from '@/lib/taskFilter';
import { buildSections, parseScheduled, timedToday } from './helpers';

export function useTodayTasks() {
  const { tasks, loading, error, retry } = useTasks();
  const { today, zone } = useToday();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 5 * 60 * 1000); // keeps the hour-based prompts current
    return () => clearInterval(id);
  }, []);
  return useMemo(() => {
    const visible = tasks.filter((t) => shouldShowInTodayView(t, today));
    const sections = buildSections(visible, today);
    const open = visible.filter((t) => !t.completed);
    // "Left today" ignores things scheduled for a later day.
    const openToday = open.filter((t) => {
      const s = parseScheduled(t.deferredTo);
      return !(s && s.date > today);
    });
    const done = visible.filter((t) => t.completed);
    const hour = Number(localTime(zone).slice(0, 2));
    return { tasks, loading, error, retry, today, zone, hour, visible, sections, open, openToday, done, schedule: timedToday(visible, today) };
  }, [tasks, loading, error, retry, today, zone, tick]);
}
