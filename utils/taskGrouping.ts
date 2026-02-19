import { TaskWithUser } from '@/lib/types';
import { normalizeTagToIconId } from '@/lib/tagIcons';

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
 * Group tasks by their primary tag. No-tag tasks first, then by tagOrder.
 * Returns array of { tag: string | null, tasks: TaskWithUser[] }
 */
export function groupTasksByTag<T extends TaskWithUser>(
  tasks: T[],
  tagOrder: string[]
): { tag: string | null; tasks: T[] }[] {
  const byTag = new Map<string | null, T[]>();

  for (const task of tasks) {
    const tag = getPrimaryTag(task, tagOrder);
    const list = byTag.get(tag) || [];
    list.push(task);
    byTag.set(tag, list);
  }

  const result: { tag: string | null; tasks: T[] }[] = [];
  // No-tag first
  const noTag = byTag.get(null);
  if (noTag?.length) {
    result.push({ tag: null, tasks: noTag });
  }
  // Then by tagOrder
  for (const tag of tagOrder) {
    const list = byTag.get(tag);
    if (list?.length) {
      result.push({ tag, tasks: list });
    }
  }
  // Any remaining tags not in tagOrder (sorted for consistency)
  const remainingTags = Array.from(byTag.keys()).filter(
    (tag): tag is string => tag !== null && !tagOrder.includes(tag)
  ).sort();
  for (const tag of remainingTags) {
    const list = byTag.get(tag);
    if (list?.length) result.push({ tag, tasks: list });
  }

  return result;
}
