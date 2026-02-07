'use client';

import { useAuth } from '@/contexts/AuthContext';
import { FaClock, FaEnvelope, FaCheckCircle, FaSignOutAlt, FaArrowLeft } from 'react-icons/fa';

export default function PendingApproval() {
  const { user, userData, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 w-full max-w-md text-center">
        <div className="text-6xl mb-4">⏳</div>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-4">
          Pending Approval
        </h1>
        
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6 mb-6">
          <div className="flex items-center justify-center gap-2 mb-3">
            <FaCheckCircle className="text-blue-600 dark:text-blue-400" />
            <p className="text-lg font-semibold text-blue-900 dark:text-blue-100">
              Your account has been created!
            </p>
          </div>
          <p className="text-sm text-blue-800 dark:text-blue-200 mb-4">
            This app is currently in <strong>beta testing</strong>. Your sign-up request has been submitted and is pending admin approval.
          </p>
        </div>

        <div className="space-y-4 text-left mb-6">
          <div className="flex items-start gap-3 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <FaEnvelope className="text-gray-600 dark:text-gray-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                Email Notification
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                We'll notify you at <strong className="text-gray-900 dark:text-white">{userData?.email || user?.email}</strong> once your request is approved.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <FaClock className="text-gray-600 dark:text-gray-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                What's Next?
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                You can check back later or try refreshing this page. Once approved, you'll have full access to the app!
              </p>
            </div>
          </div>
        </div>

        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-6">
          <p className="text-xs text-amber-800 dark:text-amber-200">
            💡 <strong>Tip:</strong> The page will automatically update when your request is approved. No need to sign out and back in!
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => {
              // Clear auth and reload to show sign up page
              signOut();
            }}
            className="flex-1 flex items-center justify-center gap-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 py-3 rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            <FaSignOutAlt /> Sign Out
          </button>
          <button
            onClick={() => {
              // Sign out and the app will show AuthModal
              signOut();
            }}
            className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            <FaArrowLeft /> Back to Sign In
          </button>
        </div>
      </div>
    </div>
  );
}
