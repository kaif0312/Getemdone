'use client';

import { FaTimes, FaRocket, FaBug, FaHeart } from 'react-icons/fa';

interface QuickInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function QuickInfoModal({ isOpen, onClose }: QuickInfoModalProps) {
  if (!isOpen) return null;

  const updates = [
    { type: 'feature', text: 'Friend comment notifications', version: '1.0.0' },
    { type: 'feature', text: 'Bug reporting with screenshots', version: '1.0.0' },
    { type: 'feature', text: 'Media attachments (images/PDFs)', version: '1.0.0' },
    { type: 'feature', text: 'Profile picture uploads', version: '1.0.0' },
    { type: 'feature', text: 'Storage management (100MB/user)', version: '1.0.0' },
    { type: 'fix', text: 'Fixed storage usage real-time updates', version: '1.0.0' },
    { type: 'fix', text: 'Fixed PDF delete button visibility', version: '1.0.0' },
    { type: 'fix', text: 'Improved mobile button sizes', version: '1.0.0' },
  ];

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/30 z-50 animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal - Small and Compact */}
      <div className="fixed top-16 left-4 right-4 md:left-auto md:right-auto md:top-20 md:left-1/2 md:-translate-x-1/2 md:w-96 z-50 animate-in slide-in-from-top-2 duration-200">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Header - Minimal */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-gray-700 dark:to-gray-800">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0">
                <svg width="14" height="14" viewBox="0 0 512 512" className="text-white">
                  <path d="M140 250 L220 330 L380 170" stroke="currentColor" strokeWidth="40" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">GetDone</h3>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
            >
              <FaTimes className="text-gray-500 dark:text-gray-400" size={14} />
            </button>
          </div>

          {/* Created By - Very Compact */}
          <div className="px-4 py-3 text-center text-xs text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
            Made with <FaHeart className="inline text-red-500 text-[10px]" /> by <span className="font-semibold text-gray-900 dark:text-white">Kaifu Ten</span> • v1.0.0
          </div>

          {/* Updates List - Compact */}
          <div className="max-h-64 overflow-y-auto">
            <div className="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide bg-gray-50 dark:bg-gray-700/50">
              Recent Updates
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {updates.map((update, idx) => (
                <div key={idx} className="px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <div className="flex items-start gap-2">
                    <div className="flex-shrink-0 mt-0.5">
                      {update.type === 'feature' ? (
                        <FaRocket className="text-green-500" size={12} />
                      ) : (
                        <FaBug className="text-orange-500" size={12} />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-gray-700 dark:text-gray-300">
                        {update.text}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="px-4 py-2 text-center text-[10px] text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50">
            © {new Date().getFullYear()} GetDone. Built with Next.js & Firebase
          </div>
        </div>
      </div>
    </>
  );
}
