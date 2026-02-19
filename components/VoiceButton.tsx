'use client';

import { useState } from 'react';
import { FaMicrophone, FaStop } from 'react-icons/fa';
import { LuCheck } from 'react-icons/lu';
import { useVoiceInput } from '@/hooks/useVoiceInput';

interface VoiceButtonProps {
  onTranscript: (text: string) => void;
  language?: string;
  disabled?: boolean;
  /** Ghost: secondary text color, no background (for compact task input bar) */
  variant?: 'default' | 'ghost';
}

export default function VoiceButton({ 
  onTranscript, 
  language = 'en-US',
  disabled = false,
  variant = 'default',
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
        className={`p-2 rounded-full transition-all min-w-[36px] min-h-[36px] flex items-center justify-center ${
          variant === 'ghost'
            ? isListening
              ? 'bg-error text-white animate-pulse'
              : 'text-fg-secondary hover:text-fg-primary'
            : isListening
              ? 'bg-error text-on-accent animate-pulse shadow-elevation-2'
              : 'bg-primary/15 text-primary hover:bg-primary/25'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
        title={isListening ? 'Stop recording' : `Voice input (${currentLanguage.name})`}
      >
        {isListening ? <FaStop size={14} /> : <FaMicrophone size={variant === 'ghost' ? 20 : 14} />}
      </button>

      {/* Language Selector Badge */}
      {!isListening && (
        <button
          type="button"
          onClick={() => setShowLanguageMenu(!showLanguageMenu)}
          className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-surface border-2 border-primary text-xs flex items-center justify-center hover:scale-110 transition-transform"
          title="Change language"
        >
          {currentLanguage.flag}
        </button>
      )}

      {/* Interim Transcript Popup */}
      {isListening && (interimTranscript || fullTranscript) && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-surface rounded-lg shadow-elevation-2 p-3 min-w-[200px] max-w-[300px] border border-border-subtle">
          <div className="text-sm">
            <p className="text-fg-primary font-medium">
              {fullTranscript}
              <span className="text-primary">
                {interimTranscript}
              </span>
            </p>
          </div>
          <div className="mt-2 flex items-center gap-1 text-xs text-fg-tertiary">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
            Listening...
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && !isListening && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-error/10 dark:bg-error/20 rounded-lg shadow-elevation-2 p-3 min-w-[200px] max-w-[300px] border border-error/30">
          <p className="text-sm text-error">{error}</p>
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
          <div className="absolute bottom-full mb-2 left-0 md:left-auto md:right-0 bg-surface rounded-lg shadow-elevation-2 border border-border-subtle py-2 min-w-[180px] max-w-[calc(100vw-2rem)] z-50 max-h-[300px] overflow-y-auto">
            <div className="px-3 py-1 text-xs font-semibold text-fg-tertiary uppercase">
              Select Language
            </div>
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleLanguageSelect(lang.code)}
                className={`w-full text-left px-3 py-2 hover:bg-surface-muted flex items-center gap-2 ${
                  lang.code === selectedLanguage 
                    ? 'bg-primary/15 text-primary' 
                    : 'text-fg-primary'
                }`}
              >
                <span className="text-lg">{lang.flag}</span>
                <span className="text-sm">{lang.name}</span>
                {lang.code === selectedLanguage && (
                  <span className="ml-auto text-primary"><LuCheck size={14} /></span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
