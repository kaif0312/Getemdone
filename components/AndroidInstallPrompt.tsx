'use client';

import { useState } from 'react';
import { FaTimes, FaMobileAlt, FaBell, FaCheck, FaMenu, FaCommentDots } from 'react-icons/fa';

interface AndroidInstallPromptProps {
  onDismiss?: () => void;
  allowDismiss?: boolean; // If false, user MUST install to continue
  onFeedback?: () => void; // Callback to open feedback modal
}

export default function AndroidInstallPrompt({ onDismiss, allowDismiss = false, onFeedback }: AndroidInstallPromptProps) {
  const [currentStep, setCurrentStep] = useState(1);

  return (
    <div className="fixed inset-0 z-[9999] bg-gradient-to-br from-green-600 via-teal-600 to-blue-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 relative overflow-hidden">
        {/* Decorative background */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-green-100 to-teal-100 rounded-full blur-3xl opacity-50 -translate-y-1/2 translate-x-1/2"></div>
        
        {/* Close button (only if dismissable) */}
        {allowDismiss && onDismiss && (
          <button
            onClick={onDismiss}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors z-10"
            aria-label="Close"
          >
            <FaTimes className="w-6 h-6" />
          </button>
        )}

        {/* Content */}
        <div className="relative z-10">
          {/* App Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-teal-600 rounded-2xl shadow-lg flex items-center justify-center">
              <FaBell className="w-10 h-10 text-white" />
            </div>
          </div>

          {/* Title */}
          <h1 className="text-3xl font-bold text-gray-900 text-center mb-2">
            Install GetEmDone
          </h1>
          
          <p className="text-gray-600 text-center mb-8">
            {allowDismiss 
              ? "Get instant notifications and a better experience by installing our app!"
              : "To use GetEmDone on Android, please install it as an app. This enables instant notifications and offline access!"
            }
          </p>

          {/* Steps */}
          <div className="space-y-6 mb-8">
            {/* Step 1 */}
            <div 
              className={`flex items-start gap-4 p-4 rounded-2xl transition-all cursor-pointer ${
                currentStep === 1 ? 'bg-green-50 border-2 border-green-500' : 'bg-gray-50 border-2 border-transparent'
              }`}
              onClick={() => setCurrentStep(1)}
            >
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                currentStep === 1 ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-600'
              }`}>
                1
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900 mb-2">
                  Tap the Menu button
                </p>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <span>Look for</span>
                  <div className="bg-green-500 rounded-lg p-2">
                    <FaMenu className="w-5 h-5 text-white" />
                  </div>
                  <span>in the browser toolbar</span>
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div 
              className={`flex items-start gap-4 p-4 rounded-2xl transition-all cursor-pointer ${
                currentStep === 2 ? 'bg-teal-50 border-2 border-teal-500' : 'bg-gray-50 border-2 border-transparent'
              }`}
              onClick={() => setCurrentStep(2)}
            >
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                currentStep === 2 ? 'bg-teal-500 text-white' : 'bg-gray-300 text-gray-600'
              }`}>
                2
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900 mb-2">
                  Select "Install app" or "Add to Home screen"
                </p>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <FaMobileAlt className="w-5 h-5 text-teal-500" />
                  <span>Look for this option in the menu</span>
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div 
              className={`flex items-start gap-4 p-4 rounded-2xl transition-all cursor-pointer ${
                currentStep === 3 ? 'bg-blue-50 border-2 border-blue-500' : 'bg-gray-50 border-2 border-transparent'
              }`}
              onClick={() => setCurrentStep(3)}
            >
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                currentStep === 3 ? 'bg-blue-500 text-white' : 'bg-gray-300 text-gray-600'
              }`}>
                3
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900 mb-2">
                  Tap "Install" or "Add"
                </p>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <FaCheck className="w-5 h-5 text-blue-500" />
                  <span>Confirm to add the app to your home screen</span>
                </div>
              </div>
            </div>
          </div>

          {/* Benefits */}
          <div className="bg-gradient-to-r from-green-50 to-teal-50 rounded-2xl p-4 mb-6">
            <p className="text-sm font-semibold text-gray-900 mb-2">✨ Why install?</p>
            <ul className="text-sm text-gray-700 space-y-1">
              <li>🔔 <strong>Instant notifications</strong> for comments & encouragement</li>
              <li>⚡ <strong>Faster performance</strong> with offline support</li>
              <li>📱 <strong>Full-screen experience</strong> without browser UI</li>
              <li>🎯 <strong>Quick access</strong> from your home screen</li>
            </ul>
          </div>

          {/* Footer note */}
          {!allowDismiss && (
            <p className="text-xs text-center text-gray-500 mb-4">
              This is required for Android users to receive push notifications
            </p>
          )}

          {/* Feedback button */}
          {onFeedback && (
            <button
              onClick={onFeedback}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 hover:bg-gray-200 rounded-xl text-gray-700 font-medium transition-colors"
            >
              <FaCommentDots className="w-4 h-4" />
              <span>Having trouble? Send feedback</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
