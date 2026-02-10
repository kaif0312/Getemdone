'use client';

import { useState, useEffect } from 'react';
import { FaShare, FaTimes, FaMobileAlt, FaBell, FaCheck, FaCommentDots } from 'react-icons/fa';

interface IOSInstallPromptProps {
  onDismiss?: () => void;
  allowDismiss?: boolean; // If false, user MUST install to continue
  onFeedback?: () => void; // Callback to open feedback modal
}

export default function IOSInstallPrompt({ onDismiss, allowDismiss = false, onFeedback }: IOSInstallPromptProps) {
  const [currentStep, setCurrentStep] = useState(1);

  return (
    <div className="fixed inset-0 z-[9999] bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 overflow-y-auto">
      <div className="min-h-full flex items-center justify-center p-4 py-8">
        <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 md:p-8 relative overflow-hidden my-auto">
          {/* Decorative background */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-blue-100 to-purple-100 rounded-full blur-3xl opacity-50 -translate-y-1/2 translate-x-1/2"></div>
          
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
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 md:w-20 md:h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl shadow-lg flex items-center justify-center">
              <FaBell className="w-8 h-8 md:w-10 md:h-10 text-white" />
            </div>
          </div>

          {/* Title */}
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 text-center mb-2">
            Install GetEmDone
          </h1>
          
          <p className="text-sm md:text-base text-gray-600 text-center mb-6">
            {allowDismiss 
              ? "Get instant notifications and a better experience by installing our app!"
              : "To use GetEmDone on iOS, please install it as an app. This enables instant notifications and offline access!"
            }
          </p>

          {/* Steps */}
          <div className="space-y-4 mb-6">
            {/* Step 1 */}
            <div 
              className={`flex items-start gap-3 p-3 rounded-xl transition-all cursor-pointer ${
                currentStep === 1 ? 'bg-blue-50 border-2 border-blue-500' : 'bg-gray-50 border-2 border-transparent'
              }`}
              onClick={() => setCurrentStep(1)}
            >
              <div className={`flex-shrink-0 w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center font-bold text-sm md:text-base ${
                currentStep === 1 ? 'bg-blue-500 text-white' : 'bg-gray-300 text-gray-600'
              }`}>
                1
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm md:text-base text-gray-900 mb-1">
                  Tap the Share button
                </p>
                <div className="flex items-center gap-2 text-xs md:text-sm text-gray-600 flex-wrap">
                  <span>Look for</span>
                  <div className="bg-blue-500 rounded-lg p-1.5">
                    <FaShare className="w-4 h-4 md:w-5 md:h-5 text-white" />
                  </div>
                  <span>at the bottom of Safari</span>
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div 
              className={`flex items-start gap-3 p-3 rounded-xl transition-all cursor-pointer ${
                currentStep === 2 ? 'bg-purple-50 border-2 border-purple-500' : 'bg-gray-50 border-2 border-transparent'
              }`}
              onClick={() => setCurrentStep(2)}
            >
              <div className={`flex-shrink-0 w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center font-bold text-sm md:text-base ${
                currentStep === 2 ? 'bg-purple-500 text-white' : 'bg-gray-300 text-gray-600'
              }`}>
                2
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm md:text-base text-gray-900 mb-1">
                  Select "Add to Home Screen"
                </p>
                <div className="flex items-center gap-2 text-xs md:text-sm text-gray-600">
                  <FaMobileAlt className="w-4 h-4 md:w-5 md:h-5 text-purple-500 flex-shrink-0" />
                  <span>Scroll down and tap this option</span>
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div 
              className={`flex items-start gap-3 p-3 rounded-xl transition-all cursor-pointer ${
                currentStep === 3 ? 'bg-green-50 border-2 border-green-500' : 'bg-gray-50 border-2 border-transparent'
              }`}
              onClick={() => setCurrentStep(3)}
            >
              <div className={`flex-shrink-0 w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center font-bold text-sm md:text-base ${
                currentStep === 3 ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-600'
              }`}>
                3
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm md:text-base text-gray-900 mb-1">
                  Tap "Add"
                </p>
                <div className="flex items-center gap-2 text-xs md:text-sm text-gray-600">
                  <FaCheck className="w-4 h-4 md:w-5 md:h-5 text-green-500 flex-shrink-0" />
                  <span>Confirm to add the app to your home screen</span>
                </div>
              </div>
            </div>
          </div>

          {/* Benefits */}
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-3 mb-4">
            <p className="text-xs md:text-sm font-semibold text-gray-900 mb-1.5">✨ Why install?</p>
            <ul className="text-xs md:text-sm text-gray-700 space-y-0.5">
              <li>🔔 <strong>Instant notifications</strong> for comments & encouragement</li>
              <li>⚡ <strong>Faster performance</strong> with offline support</li>
              <li>📱 <strong>Full-screen experience</strong> without browser UI</li>
              <li>🎯 <strong>Quick access</strong> from your home screen</li>
            </ul>
          </div>

          {/* Footer note */}
          {!allowDismiss && (
            <p className="text-xs text-center text-gray-500 mb-3">
              This is required for iOS users to receive push notifications
            </p>
          )}

          {/* Feedback button */}
          {onFeedback && (
            <button
              onClick={onFeedback}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 rounded-xl text-gray-700 font-medium text-sm transition-colors"
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
