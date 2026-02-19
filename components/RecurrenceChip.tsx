'use client';

import { Recurrence } from '@/lib/types';
import { formatRecurrenceLabel } from '@/utils/recurrence';
import { FaTimes } from 'react-icons/fa';
import { LuRepeat } from 'react-icons/lu';

interface RecurrenceChipProps {
  recurrence: Recurrence;
  onEdit: () => void;
  onRemove: () => void;
}

export default function RecurrenceChip({ recurrence, onEdit, onRemove }: RecurrenceChipProps) {
  const label = formatRecurrenceLabel(recurrence);

  return (
    <div className="flex items-center gap-1.5 mt-2">
      <button
        type="button"
        onClick={onEdit}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/15 text-primary text-xs font-medium hover:bg-primary/25 transition-colors"
      >
        <LuRepeat size={12} />
        <span>Repeats: {label}</span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="p-1 rounded-full hover:bg-surface-muted text-fg-tertiary transition-colors"
        title="Remove recurrence"
      >
        <FaTimes size={10} />
      </button>
    </div>
  );
}
