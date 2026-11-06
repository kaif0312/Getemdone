import React from 'react';
import { Chip, type IconName } from '@/ui';
import type { Meeting } from '@/lib/meetingsTypes';
import { sourceMeta } from './view';

const ICON: Partial<Record<Meeting['createdVia'], IconName>> = { 'claude-code': 'sparkle', bot: 'whatsapp' };

/** Non-pressable pill: Claude Code (primary), WhatsApp (success), Nudge (neutral, no icon). */
export function SourceBadge({ via }: { via: Meeting['createdVia'] }) {
  const m = sourceMeta(via);
  return <Chip size="sm" label={m.label} tone={m.tone} icon={ICON[via]} />;
}
