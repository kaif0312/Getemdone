/**
 * Everything the Friends tab shows, derived from the shared hooks: today's ranked board (you included), the per-friend
 * activity feed, live focus presence and the nudge state. One call per screen (it opens one presence + one fitness listener per friend).
 */
import { useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useFitness } from '@/hooks/useFitness';
import { useFriends } from '@/hooks/useFriends';
import { usePresence } from '@/hooks/usePresence';
import { useStreak } from '@/hooks/useStreak';
import { useTasks } from '@/hooks/useTasks';
import { useToday } from '@/hooks/useToday';
import { addDays } from '@/lib/dates';
import { useFriendsWorkouts, useNudges } from './hooks';
import { boardHeadline, buildFeed, dayStats, rankBoard, type BoardRow, type DayStats } from './logic';

export function useBoard() {
  const { uid, profile } = useAuth();
  const { friends, loading, friendTasks, tasksLoading, incomingInvites } = useFriends();
  const { tasks } = useTasks();
  const { current } = useStreak();
  const fitness = useFitness();
  const { today, zone } = useToday();

  const friendIds = useMemo(() => friends.map((f) => f.id), [friends]);
  const presence = usePresence(friendIds);
  const yesterday = addDays(today, -1);
  const workouts = useFriendsWorkouts(friendIds, yesterday);
  const nudges = useNudges(friendIds);

  const stats = useMemo(() => {
    const by: Record<string, DayStats> = {};
    for (const f of friends) {
      by[f.id] = dayStats(friendTasks.filter((t) => t.userId === f.id && !t.hidden).map((t) => t.raw), today, zone);
    }
    return by;
  }, [friends, friendTasks, today, zone]);

  const myStats = useMemo(() => dayStats(tasks, today, zone), [tasks, today, zone]);
  const myWorkouts = fitness.dayMap[today]?.workouts?.length ?? 0;

  const workoutsToday = (fid: string) => (workouts[fid] ?? []).filter((w) => w.date === today).length;

  const ranked = useMemo(() => {
    const rows: BoardRow[] = friends.map((f) => ({
      id: f.id, name: f.displayName, photoURL: f.photoURL, me: false,
      done: stats[f.id]?.done ?? 0, total: stats[f.id]?.total ?? 0,
      workouts: (workouts[f.id] ?? []).filter((w) => w.date === today).length,
      streak: f.streakData?.currentStreak ?? 0,
    }));
    if (uid && profile) {
      rows.push({
        id: uid, name: profile.displayName || 'You', photoURL: profile.photoURL, me: true, done: myStats.done, total: myStats.total,
        workouts: myWorkouts, streak: current,
      });
    }
    return rankBoard(rows);
  }, [friends, stats, workouts, today, uid, profile, myStats, myWorkouts, current]);

  // Completions from the last 2 days (today in the user's zone starts at midnight; two days keeps late-night finishers visible)
  const since = useMemo(() => Date.now() - 36 * 3600 * 1000, [today]);
  const feeds = useMemo(() => {
    const all = buildFeed(friends, friendTasks, workouts, since);
    return {
      active: all.filter((f) => f.items.length > 0).sort((a, b) => b.latest - a.latest),
      quiet: all.filter((f) => f.items.length === 0),
    };
  }, [friends, friendTasks, workouts, since]);

  return {
    loading: loading || (friends.length > 0 && tasksLoading),
    friends, presence, ranked, feeds, stats, nudges, today, incomingInvites,
    headline: boardHeadline(ranked),
    workoutsToday,
  };
}
