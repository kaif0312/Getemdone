'use client';

import { useState, useEffect } from 'react';
import { FaTimes, FaUndo, FaTrash, FaTrashRestoreAlt, FaClock } from 'react-icons/fa';
import { TaskWithUser } from '@/lib/types';
import { formatExpiryInfo, DEFAULT_RETENTION_DAYS } from '@/utils/recycleCleanup';

interface RecycleBinProps {
  isOpen: boolean;
  onClose: () => void;
  onRestore: (taskId: string) => void;
  onPermanentDelete: (taskId: string) => void;
  getDeletedTasks: () => Promise<TaskWithUser[]>;
}

export default function RecycleBin({
  isOpen,
  onClose,
  onRestore,
  onPermanentDelete,
  getDeletedTasks,
}: RecycleBinProps) {
  const [deletedTasks, setDeletedTasks] = useState<TaskWithUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      loadDeletedTasks();
    }
  }, [isOpen]);

  const loadDeletedTasks = async () => {
    setLoading(true);
    const tasks = await getDeletedTasks();
    setDeletedTasks(tasks);
    setLoading(false);
  };

  const handleRestore = async (taskId: string) => {
    // Optimistic UI update - remove immediately for instant feedback
    setDeletedTasks(prev => prev.filter(t => t.id !== taskId));
    
    // Then perform the actual restore in the background
    try {
      await onRestore(taskId);
    } catch (error) {
      console.error('Failed to restore task:', error);
      // If it fails, reload the deleted tasks
      loadDeletedTasks();
    }
  };

  const handlePermanentDelete = async (taskId: string) => {
    if (confirm('Are you sure? This task will be permanently deleted and cannot be recovered.')) {
      // Optimistic UI update - remove immediately for instant feedback
      setDeletedTasks(prev => prev.filter(t => t.id !== taskId));
      
      // Then perform the actual delete in the background
      try {
        await onPermanentDelete(taskId);
      } catch (error) {
        console.error('Failed to permanently delete task:', error);
        // If it fails, reload the deleted tasks
        loadDeletedTasks();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-x-4 top-[10%] md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-2xl z-50 animate-in slide-in-from-top duration-300">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-h-[80vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                <FaTrashRestoreAlt className="text-gray-600 dark:text-gray-300" size={20} />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                  Recycle Bin
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {deletedTasks.length} {deletedTasks.length === 1 ? 'task' : 'tasks'} • Auto-deleted after {DEFAULT_RETENTION_DAYS} days
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
              title="Close"
            >
              <FaTimes className="text-gray-500 dark:text-gray-400" size={20} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100"></div>
              </div>
            ) : deletedTasks.length === 0 ? (
              <div className="text-center py-12">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full mb-4">
                  <FaTrash className="text-gray-400 dark:text-gray-500" size={24} />
                </div>
                <p className="text-gray-500 dark:text-gray-400 text-lg">Recycle bin is empty</p>
                <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
                  Deleted tasks will appear here
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {deletedTasks.map((task) => (
                  <div
                    key={task.id}
                    className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600 group hover:shadow-md transition-all"
                  >
                    <div className="flex items-start gap-3">
                      {/* Task Text */}
                      <div className="flex-1 min-w-0">
                        <p className="text-gray-900 dark:text-gray-100 line-clamp-2">
                          {task.text}
                        </p>
                        <div className="flex flex-col gap-1 mt-2 text-xs">
                          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                            {task.deletedAt && (
                              <span>
                                Deleted {new Date(task.deletedAt).toLocaleDateString()}
                              </span>
                            )}
                            {task.isPrivate && (
                              <span className="px-2 py-0.5 bg-gray-200 dark:bg-gray-600 rounded-full">
                                Private
                              </span>
                            )}
                          </div>
                          {task.deletedAt && (() => {
                            const expiryInfo = formatExpiryInfo(task.deletedAt);
                            return (
                              <div className={`flex items-center gap-1 ${expiryInfo.isExpiringSoon ? 'text-orange-500 dark:text-orange-400 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
                                <FaClock size={10} />
                                <span>
                                  {expiryInfo.daysRemaining === 0 
                                    ? 'Expires today'
                                    : `${expiryInfo.daysRemaining} ${expiryInfo.daysRemaining === 1 ? 'day' : 'days'} until permanent deletion`
                                  }
                                </span>
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Action Buttons - Always visible for mobile */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleRestore(task.id)}
                          className="p-2 bg-green-100 hover:bg-green-200 dark:bg-green-900/30 dark:hover:bg-green-900/50 text-green-600 dark:text-green-400 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                          title="Restore task"
                        >
                          <FaUndo size={18} />
                        </button>
                        <button
                          onClick={() => handlePermanentDelete(task.id)}
                          className="p-2 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                          title="Delete permanently"
                        >
                          <FaTrash size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {deletedTasks.length > 0 && (
            <div className="border-t border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-900/50">
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                💡 Tip: Tap the green button to restore or red button to permanently delete
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
