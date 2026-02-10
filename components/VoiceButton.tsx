'use client';

import { useState } from 'react';
import { FaMicrophone, FaStop } from 'react-icons/fa';
import { useVoiceInput } from '@/hooks/useVoiceInput';

interface VoiceButtonProps {
  onTranscript: (text: string) => void;
  language?: string;
  disabled?: boolean;
}

export default function VoiceButton({ 
  onTranscript, 
  language = 'en-US',
  disabled = false 
}: VoiceButtonProps) {
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState(language);
  const [fullTranscript, setFullTranscript] = useState('');

  const { 
    isListening, 
    interimTranscript,
    isSupported,
    startListening, 
    stopListening,
    error 
  } = useVoiceInput({
    onResult: (transcript) => {
      console.log('Voice transcript received:', transcript);
      // Accumulate transcripts - add space if there's already text
      setFullTranscript(prev => {
        const newText = prev ? prev + ' ' + transcript.trim() : transcript.trim();
        console.log('Accumulated transcript:', newText);
        // Update the input field with accumulated text
        onTranscript(newText);
        return newText;
      });
    },
    onError: (error) => {
      console.error('Voice input error:', error);
    },
    language: selectedLanguage,
    continuous: true,
  });

  const languages = [
    { code: 'en-US', name: 'English (US)', flag: '🇺🇸' },
    { code: 'en-GB', name: 'English (UK)', flag: '🇬🇧' },
    { code: 'hi-IN', name: 'हिन्दी', flag: '🇮🇳' },
    { code: 'es-ES', name: 'Español', flag: '🇪🇸' },
    { code: 'fr-FR', name: 'Français', flag: '🇫🇷' },
    { code: 'de-DE', name: 'Deutsch', flag: '🇩🇪' },
    { code: 'zh-CN', name: '中文', flag: '🇨🇳' },
    { code: 'ja-JP', name: '日本語', flag: '🇯🇵' },
    { code: 'ko-KR', name: '한국어', flag: '🇰🇷' },
    { code: 'ar-SA', name: 'العربية', flag: '🇸🇦' },
  ];

  const currentLanguage = languages.find(l => l.code === selectedLanguage) || languages[0];

  const handleToggle = () => {
    console.log('Voice button clicked. Currently listening:', isListening);
    console.log('Selected language:', selectedLanguage);
    if (isListening) {
      console.log('Stopping voice input...');
      stopListening();
      // Keep the accumulated transcript - don't clear it
    } else {
      console.log('Starting voice input...');
      setFullTranscript(''); // Clear transcript when starting fresh
      startListening();
    }
  };

  const handleLanguageSelect = (langCode: string) => {
    setSelectedLanguage(langCode);
    setShowLanguageMenu(false);
    // Save preference to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('voiceInputLanguage', langCode);
    }
  };

  // Load saved language preference
  useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('voiceInputLanguage');
      if (saved) {
        setSelectedLanguage(saved);
      }
    }
  });

  if (!isSupported) {
    return null; // Don't show button if not supported
  }

  return (
    <div className="relative">
      {/* Voice Input Button */}
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        className={`p-2 md:p-3 rounded-full transition-all min-w-[36px] min-h-[36px] md:min-w-[44px] md:min-h-[44px] flex items-center justify-center ${
          isListening
            ? 'bg-red-500 text-white animate-pulse shadow-lg'
            : 'bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/70'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
        title={isListening ? 'Stop recording' : `Voice input (${currentLanguage.name})`}
      >
        {isListening ? <FaStop size={14} className="md:w-[18px] md:h-[18px]" /> : <FaMicrophone size={14} className="md:w-[18px] md:h-[18px]" />}
      </button>

      {/* Language Selector Badge */}
      {!isListening && (
        <button
          type="button"
          onClick={() => setShowLanguageMenu(!showLanguageMenu)}
          className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white dark:bg-gray-800 border-2 border-purple-500 dark:border-purple-400 text-xs flex items-center justify-center hover:scale-110 transition-transform"
          title="Change language"
        >
          {currentLanguage.flag}
        </button>
      )}

      {/* Interim Transcript Popup */}
      {isListening && (interimTranscript || fullTranscript) && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-3 min-w-[200px] max-w-[300px] border border-purple-200 dark:border-purple-800">
          <div className="text-sm">
            <p className="text-gray-900 dark:text-gray-100 font-medium">
              {fullTranscript}
              <span className="text-purple-600 dark:text-purple-400">
                {interimTranscript}
              </span>
            </p>
          </div>
          <div className="mt-2 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
            Listening...
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && !isListening && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-red-50 dark:bg-red-900/50 rounded-lg shadow-xl p-3 min-w-[200px] max-w-[300px] border border-red-200 dark:border-red-800">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Language Selection Menu */}
      {showLanguageMenu && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setShowLanguageMenu(false)}
          />
          
          {/* Menu - Positioned to stay within viewport on mobile */}
          <div className="absolute bottom-full mb-2 left-0 md:left-auto md:right-0 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-2 min-w-[180px] max-w-[calc(100vw-2rem)] z-50 max-h-[300px] overflow-y-auto">
            <div className="px-3 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
              Select Language
            </div>
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleLanguageSelect(lang.code)}
                className={`w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 ${
                  lang.code === selectedLanguage 
                    ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' 
                    : 'text-gray-700 dark:text-gray-300'
                }`}
              >
                <span className="text-lg">{lang.flag}</span>
                <span className="text-sm">{lang.name}</span>
                {lang.code === selectedLanguage && (
                  <span className="ml-auto text-purple-600 dark:text-purple-400">✓</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
