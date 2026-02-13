'use client';

import { Recurrence } from '@/lib/types';
import { formatRecurrenceLabel } from '@/utils/recurrence';
import { FaTimes } from 'react-icons/fa';

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
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-medium hover:bg-blue-200 dark:hover:bg-blue-900/60 transition-colors"
      >
        <span>🔁</span>
        <span>Repeats: {label}</span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400 transition-colors"
        title="Remove recurrence"
      >
        <FaTimes size={10} />
      </button>
    </div>
  );
}
