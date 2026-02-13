const STORAGE_KEY = 'getdone-friend-order';

export function loadFriendOrder(): string[] {
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

export function saveFriendOrder(order: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
  } catch {
    // ignore
  }
}

/** Merge friend IDs with saved order - saved order takes precedence, new friends appended */
export function mergeFriendOrder(friendIds: string[], savedOrder: string[]): string[] {
  const ordered = savedOrder.filter((id) => friendIds.includes(id));
  const newFriends = friendIds.filter((id) => !savedOrder.includes(id)).sort();
  return [...ordered, ...newFriends];
}
