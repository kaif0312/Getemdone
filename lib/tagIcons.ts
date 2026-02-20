'use client';

import {
  LuClipboardList,
  LuSquareCheck,
  LuTarget,
  LuFlag,
  LuStar,
  LuClock,
  LuCalendar,
  LuListTodo,
  LuLayoutGrid,
  LuBriefcase,
  LuLaptop,
  LuCode,
  LuPresentation,
  LuFileText,
  LuMail,
  LuPhone,
  LuBuilding2,
  LuHeartPulse,
  LuDumbbell,
  LuActivity,
  LuApple,
  LuBrain,
  LuMoon,
  LuDroplet,
  LuBookOpen,
  LuGraduationCap,
  LuPencil,
  LuLightbulb,
  LuFlaskConical,
  LuLibrary,
  LuLanguages,
  LuWallet,
  LuCreditCard,
  LuPiggyBank,
  LuCoins,
  LuTrendingUp,
  LuReceipt,
  LuBanknote,
  LuHouse,
  LuShoppingCart,
  LuUtensilsCrossed,
  LuCar,
  LuPlane,
  LuWrench,
  LuShirt,
  LuPawPrint,
  LuUsers,
  LuMessageCircle,
  LuVideo,
  LuGift,
  LuPartyPopper,
  LuHandshake,
  LuPalette,
  LuCamera,
  LuMusic,
  LuPenTool,
  LuFilm,
  LuMic,
  LuTag,
  LuPill,
} from 'react-icons/lu';
import type { IconType } from 'react-icons';

export type TagIconId = string;

export interface TagIconDef {
  id: TagIconId;
  Icon: IconType;
  label: string;
  keywords: readonly string[];
}

export const TAG_ICON_CATEGORIES = [
  {
    id: 'productivity',
    label: 'Productivity',
    icons: [
      { id: 'clipboard', Icon: LuClipboardList, label: 'Clipboard', keywords: ['clipboard', 'list', 'tasks'] },
      { id: 'check-square', Icon: LuSquareCheck, label: 'Check', keywords: ['check', 'done', 'complete'] },
      { id: 'target', Icon: LuTarget, label: 'Target', keywords: ['target', 'goal', 'aim'] },
      { id: 'flag', Icon: LuFlag, label: 'Flag', keywords: ['flag', 'priority'] },
      { id: 'star', Icon: LuStar, label: 'Star', keywords: ['star', 'favorite', 'important'] },
      { id: 'clock', Icon: LuClock, label: 'Clock', keywords: ['clock', 'time'] },
      { id: 'calendar', Icon: LuCalendar, label: 'Calendar', keywords: ['calendar', 'date'] },
      { id: 'list-todo', Icon: LuListTodo, label: 'To-do', keywords: ['todo', 'list'] },
      { id: 'kanban', Icon: LuLayoutGrid, label: 'Kanban', keywords: ['kanban', 'board'] },
    ],
  },
  {
    id: 'work',
    label: 'Work',
    icons: [
      { id: 'briefcase', Icon: LuBriefcase, label: 'Briefcase', keywords: ['work', 'job', 'office'] },
      { id: 'laptop', Icon: LuLaptop, label: 'Laptop', keywords: ['laptop', 'computer', 'work'] },
      { id: 'code', Icon: LuCode, label: 'Code', keywords: ['code', 'programming', 'dev'] },
      { id: 'presentation', Icon: LuPresentation, label: 'Presentation', keywords: ['presentation', 'slides'] },
      { id: 'file-text', Icon: LuFileText, label: 'Document', keywords: ['document', 'file'] },
      { id: 'mail', Icon: LuMail, label: 'Mail', keywords: ['mail', 'email'] },
      { id: 'phone', Icon: LuPhone, label: 'Phone', keywords: ['phone', 'call'] },
      { id: 'building', Icon: LuBuilding2, label: 'Building', keywords: ['building', 'office'] },
    ],
  },
  {
    id: 'health',
    label: 'Health & Fitness',
    icons: [
      { id: 'heart-pulse', Icon: LuHeartPulse, label: 'Health', keywords: ['health', 'heart'] },
      { id: 'dumbbell', Icon: LuDumbbell, label: 'Fitness', keywords: ['fitness', 'gym', 'workout'] },
      { id: 'activity', Icon: LuActivity, label: 'Activity', keywords: ['activity', 'running', 'exercise'] },
      { id: 'apple', Icon: LuApple, label: 'Nutrition', keywords: ['apple', 'food', 'nutrition'] },
      { id: 'brain', Icon: LuBrain, label: 'Mind', keywords: ['brain', 'mind', 'mental'] },
      { id: 'moon', Icon: LuMoon, label: 'Sleep', keywords: ['moon', 'sleep', 'rest'] },
      { id: 'droplet', Icon: LuDroplet, label: 'Water', keywords: ['water', 'hydration'] },
      { id: 'pill', Icon: LuPill, label: 'Medicine', keywords: ['pill', 'medicine', 'health'] },
    ],
  },
  {
    id: 'education',
    label: 'Education',
    icons: [
      { id: 'book-open', Icon: LuBookOpen, label: 'Book', keywords: ['book', 'read'] },
      { id: 'graduation-cap', Icon: LuGraduationCap, label: 'Study', keywords: ['study', 'school'] },
      { id: 'pencil', Icon: LuPencil, label: 'Write', keywords: ['pencil', 'write', 'notes'] },
      { id: 'lightbulb', Icon: LuLightbulb, label: 'Idea', keywords: ['lightbulb', 'idea'] },
      { id: 'beaker', Icon: LuFlaskConical, label: 'Science', keywords: ['beaker', 'science', 'lab'] },
      { id: 'library', Icon: LuLibrary, label: 'Library', keywords: ['library'] },
      { id: 'languages', Icon: LuLanguages, label: 'Language', keywords: ['language', 'translate'] },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    icons: [
      { id: 'wallet', Icon: LuWallet, label: 'Wallet', keywords: ['wallet', 'money'] },
      { id: 'credit-card', Icon: LuCreditCard, label: 'Card', keywords: ['card', 'payment'] },
      { id: 'piggy-bank', Icon: LuPiggyBank, label: 'Savings', keywords: ['savings', 'piggy'] },
      { id: 'coins', Icon: LuCoins, label: 'Coins', keywords: ['coins', 'money'] },
      { id: 'trending-up', Icon: LuTrendingUp, label: 'Invest', keywords: ['invest', 'trending'] },
      { id: 'receipt', Icon: LuReceipt, label: 'Receipt', keywords: ['receipt', 'expense'] },
      { id: 'banknote', Icon: LuBanknote, label: 'Cash', keywords: ['cash', 'bill'] },
    ],
  },
  {
    id: 'home',
    label: 'Home & Life',
    icons: [
      { id: 'home', Icon: LuHouse, label: 'Home', keywords: ['home', 'house'] },
      { id: 'shopping-cart', Icon: LuShoppingCart, label: 'Shopping', keywords: ['shopping', 'cart'] },
      { id: 'utensils', Icon: LuUtensilsCrossed, label: 'Food', keywords: ['food', 'cooking', 'meal'] },
      { id: 'car', Icon: LuCar, label: 'Car', keywords: ['car', 'drive'] },
      { id: 'plane', Icon: LuPlane, label: 'Travel', keywords: ['plane', 'travel'] },
      { id: 'wrench', Icon: LuWrench, label: 'Repair', keywords: ['wrench', 'repair', 'fix'] },
      { id: 'shirt', Icon: LuShirt, label: 'Clothes', keywords: ['shirt', 'clothes'] },
      { id: 'paw-print', Icon: LuPawPrint, label: 'Pet', keywords: ['paw', 'pet', 'dog'] },
    ],
  },
  {
    id: 'social',
    label: 'Social',
    icons: [
      { id: 'users', Icon: LuUsers, label: 'People', keywords: ['users', 'people'] },
      { id: 'message-circle', Icon: LuMessageCircle, label: 'Chat', keywords: ['message', 'chat'] },
      { id: 'video', Icon: LuVideo, label: 'Video', keywords: ['video', 'call'] },
      { id: 'gift', Icon: LuGift, label: 'Gift', keywords: ['gift'] },
      { id: 'party-popper', Icon: LuPartyPopper, label: 'Party', keywords: ['party', 'celebrate'] },
      { id: 'handshake', Icon: LuHandshake, label: 'Meeting', keywords: ['handshake', 'meeting'] },
    ],
  },
  {
    id: 'creative',
    label: 'Creative',
    icons: [
      { id: 'palette', Icon: LuPalette, label: 'Art', keywords: ['palette', 'art'] },
      { id: 'camera', Icon: LuCamera, label: 'Photo', keywords: ['camera', 'photo'] },
      { id: 'music', Icon: LuMusic, label: 'Music', keywords: ['music'] },
      { id: 'pen-tool', Icon: LuPenTool, label: 'Design', keywords: ['pen', 'design'] },
      { id: 'film', Icon: LuFilm, label: 'Video', keywords: ['film', 'video'] },
      { id: 'mic', Icon: LuMic, label: 'Voice', keywords: ['mic', 'voice'] },
    ],
  },
] as const;

/** All icon definitions flattened */
export const ALL_TAG_ICONS: TagIconDef[] = TAG_ICON_CATEGORIES.flatMap((cat) =>
  cat.icons.map((i) => ({ id: i.id, Icon: i.Icon, label: i.label, keywords: [...i.keywords] }))
);

/** Map icon ID to definition (includes fallback 'tag') */
const ICON_BY_ID = new Map<string, TagIconDef>([
  ...ALL_TAG_ICONS.map((def) => [def.id, def] as const),
  ['tag', { id: 'tag', Icon: LuTag, label: 'Tag', keywords: ['tag'] }],
]);

/** Emoji → icon ID migration map */
export const EMOJI_TO_ICON_ID: Record<string, TagIconId> = {
  '🏠': 'home',
  '💼': 'briefcase',
  '🏋️': 'dumbbell',
  '🏋': 'dumbbell',
  '📚': 'book-open',
  '🔬': 'beaker',
  '💰': 'coins',
  '🏃': 'activity',
  '📝': 'pencil',
  '💊': 'pill',
  '🎯': 'target',
  '🛒': 'shopping-cart',
  '💻': 'laptop',
  '🎨': 'palette',
  '🎵': 'music',
  '🔧': 'wrench',
  '🐕': 'paw-print',
  '💡': 'lightbulb',
  '✍️': 'pencil',
  '✍': 'pencil',
  '🧹': 'wrench',
  '🍳': 'utensils',
  '📧': 'mail',
  '📱': 'laptop',
  '🚗': 'car',
  '🧘': 'moon',
  '📖': 'book-open',
  '🥗': 'apple',
  '☕': 'utensils',
  '🗂️': 'file-text',
  '🌸': 'palette',
  '👶': 'users',
  '📋': 'clipboard',
  '✅': 'check-square',
  '⭐': 'star',
};

/** Parse tag string (e.g. "book-open", "book-open:teal") into iconId and optional tintId */
export function parseTag(tag: string): { iconId: TagIconId; tintId?: string } {
  if (!tag?.trim()) return { iconId: 'tag' };
  const trimmed = tag.trim();
  if (trimmed.includes(':')) {
    const [iconId, tintId] = trimmed.split(':');
    const id = iconId?.trim() || 'tag';
    return {
      iconId: EMOJI_TO_ICON_ID[id] || (ICON_BY_ID.has(id) ? id : 'tag'),
      tintId: tintId?.trim() || undefined,
    };
  }
  const mapped = EMOJI_TO_ICON_ID[trimmed];
  if (mapped) return { iconId: mapped };
  if (ICON_BY_ID.has(trimmed)) return { iconId: trimmed };
  return { iconId: 'tag' };
}

/** Normalize tag (emoji or icon ID or "iconId:tintId") to canonical icon ID */
export function normalizeTagToIconId(tag: string): TagIconId {
  return parseTag(tag).iconId;
}

/** Get Tailwind color class for tag tint (for icon). Legacy/no tint: secondary; primary tint: accent; else tint color. */
export function getTintClassForTag(tag: string): string {
  const { tintId } = parseTag(tag);
  if (!tintId) return 'text-fg-secondary';
  if (tintId === 'primary') return 'text-primary';
  const t = TAG_TINT_COLORS.find((c) => c.id === tintId);
  return t?.class ?? 'text-fg-secondary';
}

/** Get Tailwind background class for tag pill (subtle tint). Legacy: surface-muted; else tint at 12% opacity. */
export function getTintBgClassForTag(tag: string): string {
  const { tintId } = parseTag(tag);
  if (!tintId) return 'bg-surface-muted';
  if (tintId === 'primary') return 'bg-primary/12';
  const map: Record<string, string> = {
    teal: 'bg-cyan-500/12',
    green: 'bg-emerald-500/12',
    yellow: 'bg-amber-500/12',
    orange: 'bg-orange-500/12',
    red: 'bg-red-500/12',
    pink: 'bg-pink-500/12',
    purple: 'bg-purple-500/12',
  };
  return map[tintId] ?? 'bg-primary/12';
}

/** Get Icon component for a tag (emoji or icon ID or "iconId:tintId") */
export function getIconForTag(tag: string): IconType {
  const id = normalizeTagToIconId(tag);
  return ICON_BY_ID.get(id)?.Icon ?? LuTag;
}

/** Get short label for a tag (for category bar) */
export function getLabelForTag(tagId: string): string {
  return ICON_BY_ID.get(tagId)?.label ?? tagId;
}

/** Get effective label: custom if set, else default. For category bar rename. */
export function getEffectiveLabelForTag(tagId: string, customLabels?: Record<string, string> | null): string {
  if (customLabels?.[tagId]?.trim()) return customLabels[tagId].trim();
  return getLabelForTag(tagId);
}

/** Tag tint colors (for optional color picker) */
export const TAG_TINT_COLORS = [
  { id: 'primary', name: 'Blue', class: 'text-primary' },
  { id: 'teal', name: 'Teal', class: 'text-cyan-500' },
  { id: 'green', name: 'Green', class: 'text-emerald-500' },
  { id: 'yellow', name: 'Yellow', class: 'text-amber-500' },
  { id: 'orange', name: 'Orange', class: 'text-orange-500' },
  { id: 'red', name: 'Red', class: 'text-red-500' },
  { id: 'pink', name: 'Pink', class: 'text-pink-500' },
  { id: 'purple', name: 'Purple', class: 'text-purple-500' },
] as const;
