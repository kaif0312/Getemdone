import { normalizeTagToIconId } from './tagIcons';

const STORAGE_KEY = 'nudge-tag-order';

/** Load tag order from localStorage, migrating any emoji to icon IDs */
export function loadTagOrder(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : [];
    return arr.map((t: string) => normalizeTagToIconId(t));
  } catch {
    return [];
  }
}

export function saveTagOrder(order: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
  } catch {
    // ignore
  }
}

/** Merge used tags (emoji or icon IDs) with saved order - saved order takes precedence, new tags appended as icon IDs */
export function mergeTagOrder(usedTags: string[], savedOrder: string[]): string[] {
  const usedIds = [...new Set(usedTags.map(normalizeTagToIconId))];
  const ordered = savedOrder.filter((id) => usedIds.includes(id));
  const newIds = usedIds.filter((id) => !savedOrder.includes(id)).sort();
  return [...ordered, ...newIds];
}
