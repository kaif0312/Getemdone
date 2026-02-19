import { TaskWithUser } from '@/lib/types';
import { normalizeTagToIconId } from '@/lib/tagIcons';

const COLLAPSED_SECTIONS_KEY = 'nudge_collapsed_sections';

/** Load collapsed section IDs from sessionStorage */
export function loadCollapsedSections(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = sessionStorage.getItem(COLLAPSED_SECTIONS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

/** Save collapsed section IDs to sessionStorage */
export function saveCollapsedSections(ids: Set<string>) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(COLLAPSED_SECTIONS_KEY, JSON.stringify([...ids]));
  } catch {
    // ignore
  }
}

/** Section key for null (Inbox) */
export function sectionKey(tag: string | null): string {
  return tag === null ? 'inbox' : tag;
}

/**
 * Get primary tag for grouping - first tag that appears in tagOrder (by normalized icon ID), or first by normalized form
 */
function getPrimaryTag(task: TaskWithUser, tagOrder: string[]): string | null {
  const tags = task.tags || [];
  if (tags.length === 0) return null;
  // Prefer first tag in tagOrder (match by normalized icon ID)
  for (const orderedId of tagOrder) {
    if (tags.some((t) => normalizeTagToIconId(t) === orderedId)) return orderedId;
  }
  // Fallback: first tag by normalized form
  const normalized = [...new Set(tags.map(normalizeTagToIconId))].sort();
  return normalized[0] ?? null;
}

/**
 * Group tasks by their primary tag.
 * Order: Inbox (null) first, then categories with overdue tasks (by tagOrder), then rest (by tagOrder), then remaining.
 * Empty categories are hidden.
 */
export function groupTasksByTag<T extends TaskWithUser>(
  tasks: T[],
  tagOrder: string[],
  overdueTaskIds?: Set<string>
): { tag: string | null; tasks: T[] }[] {
  const byTag = new Map<string | null, T[]>();

  for (const task of tasks) {
    const tag = getPrimaryTag(task, tagOrder);
    const list = byTag.get(tag) || [];
    list.push(task);
    byTag.set(tag, list);
  }

  const hasOverdue = (list: T[]) =>
    overdueTaskIds ? list.some((t) => overdueTaskIds.has(t.id)) : false;

  const result: { tag: string | null; tasks: T[] }[] = [];

  // 1. Inbox (no-tag) first
  const noTag = byTag.get(null);
  if (noTag?.length) {
    result.push({ tag: null, tasks: noTag });
  }

  // 2. Categories with overdue tasks (by tagOrder)
  const withOverdue: string[] = [];
  const withoutOverdue: string[] = [];
  for (const tag of tagOrder) {
    const list = byTag.get(tag);
    if (list?.length) {
      if (hasOverdue(list)) withOverdue.push(tag);
      else withoutOverdue.push(tag);
    }
  }
  for (const tag of withOverdue) {
    result.push({ tag, tasks: byTag.get(tag)! });
  }
  for (const tag of withoutOverdue) {
    result.push({ tag, tasks: byTag.get(tag)! });
  }

  // 3. Remaining tags not in tagOrder (sorted)
  const remaining = Array.from(byTag.keys()).filter(
    (tag): tag is string => tag !== null && !tagOrder.includes(tag)
  ).sort();
  for (const tag of remaining) {
    const list = byTag.get(tag)!;
    if (list.length) result.push({ tag, tasks: list });
  }

  return result;
}
