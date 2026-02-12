const STORAGE_KEY = 'getdone-tag-order';

export function loadTagOrder(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
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

/** Merge used emojis with saved order - saved order takes precedence, new emojis appended */
export function mergeTagOrder(usedEmojis: string[], savedOrder: string[]): string[] {
  const ordered = savedOrder.filter((e) => usedEmojis.includes(e));
  const newEmojis = usedEmojis.filter((e) => !savedOrder.includes(e)).sort();
  return [...ordered, ...newEmojis];
}
