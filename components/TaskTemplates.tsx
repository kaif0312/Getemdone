'use client';

import { useState, useEffect } from 'react';
import { FaTimes, FaPlus, FaTrash, FaClock } from 'react-icons/fa';

interface TaskTemplatesProps {
  onSelectTemplate: (text: string) => void;
  onClose: () => void;
  recentTasks: string[];
}

const DEFAULT_TEMPLATES = [
  '🏃 Morning workout',
  '📚 Read for 30 min',
  '🧘 Meditate',
  '💧 Drink 8 glasses of water',
  '📝 Journal',
  '🎯 Review goals',
  '💤 Sleep by 10 PM',
  '🥗 Meal prep',
];

export default function TaskTemplates({ onSelectTemplate, onClose, recentTasks }: TaskTemplatesProps) {
  const [customTemplates, setCustomTemplates] = useState<string[]>([]);
  const [newTemplate, setNewTemplate] = useState('');
  const [showAddNew, setShowAddNew] = useState(false);

  // Load custom templates from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('taskTemplates');
      if (saved) {
        try {
          setCustomTemplates(JSON.parse(saved));
        } catch (e) {
          console.error('Failed to load templates:', e);
        }
      }
    }
  }, []);

  const saveCustomTemplates = (templates: string[]) => {
    setCustomTemplates(templates);
    if (typeof window !== 'undefined') {
      localStorage.setItem('taskTemplates', JSON.stringify(templates));
    }
  };

  const handleAddTemplate = () => {
    if (newTemplate.trim()) {
      const updated = [...customTemplates, newTemplate.trim()];
      saveCustomTemplates(updated);
      setNewTemplate('');
      setShowAddNew(false);
    }
  };

  const handleDeleteTemplate = (index: number) => {
    const updated = customTemplates.filter((_, i) => i !== index);
    saveCustomTemplates(updated);
  };

  const handleSelect = (template: string) => {
    onSelectTemplate(template);
    onClose();
  };

  // Get unique recent tasks (excluding current templates)
  const allTemplates = [...DEFAULT_TEMPLATES, ...customTemplates];
  const uniqueRecent = recentTasks
    .filter((task, index, self) => self.indexOf(task) === index)
    .filter(task => !allTemplates.includes(task))
    .slice(0, 5);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-elevation-3 max-w-md w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-2xl font-bold text-gray-900">Quick Templates</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <FaTimes size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Recent Tasks */}
          {uniqueRecent.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <FaClock className="text-blue-500" size={16} />
                <h3 className="text-sm font-semibold text-gray-700 uppercase">Recent</h3>
              </div>
              <div className="grid gap-2">
                {uniqueRecent.map((task, index) => (
                  <button
                    key={`recent-${index}`}
                    onClick={() => handleSelect(task)}
                    className="text-left px-4 py-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors text-gray-900"
                  >
                    {task}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Custom Templates */}
          {customTemplates.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3">Your Templates</h3>
              <div className="grid gap-2">
                {customTemplates.map((template, index) => (
                  <div
                    key={`custom-${index}`}
                    className="flex items-center gap-2 group"
                  >
                    <button
                      onClick={() => handleSelect(template)}
                      className="flex-1 text-left px-4 py-3 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors text-gray-900"
                    >
                      {template}
                    </button>
                    <button
                      onClick={() => handleDeleteTemplate(index)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete template"
                    >
                      <FaTrash size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Default Templates */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3">Popular</h3>
            <div className="grid gap-2">
              {DEFAULT_TEMPLATES.map((template, index) => (
                <button
                  key={`default-${index}`}
                  onClick={() => handleSelect(template)}
                  className="text-left px-4 py-3 bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg transition-colors text-gray-900"
                >
                  {template}
                </button>
              ))}
            </div>
          </div>

          {/* Add New Template */}
          <div>
            {showAddNew ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTemplate}
                  onChange={(e) => setNewTemplate(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleAddTemplate();
                    } else if (e.key === 'Escape') {
                      setShowAddNew(false);
                      setNewTemplate('');
                    }
                  }}
                  placeholder="Enter template text..."
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder:text-gray-400"
                  autoFocus
                />
                <button
                  onClick={handleAddTemplate}
                  className="px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  Add
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAddNew(true)}
                className="w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors flex items-center justify-center gap-2 text-gray-600 hover:text-blue-600"
              >
                <FaPlus size={14} />
                <span>Create Custom Template</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
