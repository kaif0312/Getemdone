'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { Subtask } from '@/lib/types';
import { MdDragIndicator } from 'react-icons/md';

interface SortableSubtaskRowProps {
  subtask: Subtask;
  taskId: string;
  isOwnTask: boolean;
  canEdit: boolean;
  canDrag: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onEdit: (title: string) => void;
  editingSubtaskId: string | null;
  editingSubtaskTitle: string;
  onStartEdit: (id: string, title: string) => void;
  onUpdateEditTitle: (title: string) => void;
  onFinishEdit: () => void;
  onCancelEdit: () => void;
  renderSubtask: (dragHandle: React.ReactNode) => React.ReactNode;
}

function SortableSubtaskRow({
  subtask,
  taskId,
  canDrag,
  renderSubtask,
}: SortableSubtaskRowProps) {
  const sortableId = `subtask-${taskId}-${subtask.id}`;
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: sortableId,
    disabled: !canDrag,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const dragHandle = canDrag ? (
    <div
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      className="flex-shrink-0 w-9 h-9 min-w-[36px] min-h-[36px] -ml-1 -mr-0.5 flex items-center justify-center rounded-md touch-manipulation cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
      style={{ touchAction: 'none' }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={() => {
        if ('vibrate' in navigator) navigator.vibrate(30);
      }}
    >
      <MdDragIndicator size={18} />
    </div>
  ) : null;

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'z-50' : ''}>
      {renderSubtask(dragHandle)}
    </div>
  );
}

interface SortableSubtaskListProps {
  taskId: string;
  subtasks: Subtask[];
  isOwnTask: boolean;
  taskCompleted: boolean;
  onReorder: (newSubtasks: Subtask[]) => void;
  onToggle: (subtask: Subtask) => void;
  onDelete: (subtask: Subtask) => void;
  onEdit: (subtask: Subtask, title: string) => void;
  editingSubtaskId: string | null;
  editingSubtaskTitle: string;
  onStartEdit: (id: string, title: string) => void;
  onUpdateEditTitle: (title: string) => void;
  onFinishEdit: (subtask: Subtask) => void;
  onCancelEdit: () => void;
  renderSubtaskRow: (subtask: Subtask, dragHandle: React.ReactNode) => React.ReactNode;
}

export default function SortableSubtaskList({
  taskId,
  subtasks,
  isOwnTask,
  taskCompleted,
  onReorder,
  renderSubtaskRow,
}: SortableSubtaskListProps) {
  const canDrag = isOwnTask && !taskCompleted && subtasks.length > 1;

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = subtasks.findIndex((s) => `subtask-${taskId}-${s.id}` === active.id);
    const newIndex = subtasks.findIndex((s) => `subtask-${taskId}-${s.id}` === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(subtasks, oldIndex, newIndex);
    onReorder(reordered);
  };

  const sortableIds = subtasks.map((s) => `subtask-${taskId}-${s.id}`);

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        {subtasks.map((st) => (
          <SortableSubtaskRow
            key={st.id}
            subtask={st}
            taskId={taskId}
            isOwnTask={isOwnTask}
            canEdit={isOwnTask && !taskCompleted}
            canDrag={canDrag}
            onToggle={() => {}}
            onDelete={() => {}}
            onEdit={() => {}}
            editingSubtaskId={null}
            editingSubtaskTitle=""
            onStartEdit={() => {}}
            onUpdateEditTitle={() => {}}
            onFinishEdit={() => {}}
            onCancelEdit={() => {}}
            renderSubtask={(dragHandle) => renderSubtaskRow(st, dragHandle)}
          />
        ))}
      </SortableContext>
    </DndContext>
  );
}
