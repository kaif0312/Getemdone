'use client';

import { FaLock, FaEnvelope, FaArrowLeft } from 'react-icons/fa';
import { useAuth } from '@/contexts/AuthContext';

export default function AccessRemovedScreen() {
  const { signOut } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl shadow-elevation-3 p-8 w-full max-w-md text-center">
        <div className="mb-6">
          <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <FaLock className="text-red-600 dark:text-red-400" size={40} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Access Removed
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Your access to this application has been revoked.
          </p>
        </div>

        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
          <p className="text-sm text-red-800 dark:text-red-200">
            Your account has been removed from the whitelist. To regain access, please contact an administrator.
          </p>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-center gap-2 text-gray-600 dark:text-gray-400">
            <FaEnvelope size={16} />
            <span className="text-sm">Contact the administrator for assistance</span>
          </div>

          <button
            onClick={signOut}
            className="w-full bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 py-3 rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors flex items-center justify-center gap-2"
          >
            <FaArrowLeft size={14} />
            Return to Sign In
          </button>
        </div>
      </div>
    </div>
  );
}
