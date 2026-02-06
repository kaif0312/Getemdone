'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface VoiceInputOptions {
  onResult: (transcript: string) => void;
  onError?: (error: string) => void;
  language?: string;
  continuous?: boolean;
}

interface VoiceInputHook {
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  isSupported: boolean;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
  error: string | null;
}

export function useVoiceInput({
  onResult,
  onError,
  language = 'en-US',
  continuous = false,
}: VoiceInputOptions): VoiceInputHook {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // Check if Web Speech API is supported
    if (typeof window !== 'undefined') {
      const SpeechRecognition = 
        (window as any).SpeechRecognition || 
        (window as any).webkitSpeechRecognition;
      
      console.log('[useVoiceInput] SpeechRecognition available:', !!SpeechRecognition);
      console.log('[useVoiceInput] Browser:', navigator.userAgent);
      console.log('[useVoiceInput] Online:', navigator.onLine);
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/57ba9c7c-d66c-49e3-b3ac-38a58928614f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useVoiceInput.ts:init',message:'Browser check',data:{hasSpeechRecognition:!!SpeechRecognition,browser:navigator.userAgent.includes('Chrome')?'Chrome':navigator.userAgent.includes('Firefox')?'Firefox':'Other',online:navigator.onLine,platform:navigator.platform},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H10'})}).catch(()=>{});
      // #endregion
      
      setIsSupported(!!SpeechRecognition);

      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = true; // Always continuous
        recognitionRef.current.interimResults = true;
        recognitionRef.current.lang = language;
        recognitionRef.current.maxAlternatives = 1;
        
        // These settings help keep it alive longer
        if ('maxTimeBeforeNoSpeechRecognized' in recognitionRef.current) {
          recognitionRef.current.maxTimeBeforeNoSpeechRecognized = 30000; // 30 seconds
        }
        
        console.log('[useVoiceInput] Speech recognition initialized');
        console.log('[useVoiceInput] continuous: true (always)');
        console.log('[useVoiceInput] interimResults:', true);
        console.log('[useVoiceInput] lang:', language);
        console.log('[useVoiceInput] maxAlternatives:', 1);

        recognitionRef.current.onstart = () => {
          const now = Date.now();
          console.log('[useVoiceInput] Recognition started at:', now);
          console.log('[useVoiceInput] continuous:', recognitionRef.current.continuous);
          console.log('[useVoiceInput] interimResults:', recognitionRef.current.interimResults);
          console.log('[useVoiceInput] lang:', recognitionRef.current.lang);
          setIsListening(true);
          setError(null);
          // Haptic feedback on mobile
          if ('vibrate' in navigator) {
            navigator.vibrate(50);
          }
        };

        recognitionRef.current.onend = () => {
          const now = Date.now();
          console.log('[useVoiceInput] Recognition ended at:', now);
          console.log('[useVoiceInput] Was continuous?', recognitionRef.current.continuous);
          console.log('[useVoiceInput] Current state - isListening:', isListening);
          setIsListening(false);
          setInterimTranscript('');
        };
        
        // Debug handlers to see what's happening
        recognitionRef.current.onsoundstart = () => {
          console.log('[useVoiceInput] 🔊 Sound detected!');
        };
        
        recognitionRef.current.onsoundend = () => {
          console.log('[useVoiceInput] 🔇 Sound ended');
        };
        
        recognitionRef.current.onspeechstart = () => {
          console.log('[useVoiceInput] 🗣️ Speech started!');
        };
        
        recognitionRef.current.onspeechend = () => {
          console.log('[useVoiceInput] 🤐 Speech ended');
        };
        
        recognitionRef.current.onaudiostart = () => {
          console.log('[useVoiceInput] 🎤 Audio capture started');
        };
        
        recognitionRef.current.onaudioend = () => {
          console.log('[useVoiceInput] 🎤 Audio capture ended');
        };

        recognitionRef.current.onresult = (event: any) => {
          let finalTranscript = '';
          let interimText = '';

          // Process all results
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript;
            } else {
              interimText += transcript;
            }
          }

          // Update transcripts
          if (finalTranscript) {
            setTranscript(prev => prev + finalTranscript);
            onResult(finalTranscript);
            // Haptic feedback
            if ('vibrate' in navigator) {
              navigator.vibrate([30, 50, 30]);
            }
          }
          
          setInterimTranscript(interimText);
        };

        recognitionRef.current.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error);
          
          // Ignore aborted errors (user stopped)
          if (event.error === 'aborted') {
            return;
          }
          
          let errorMessage = 'Voice input error';
          switch (event.error) {
            case 'no-speech':
              errorMessage = 'No speech detected. Please try again.';
              break;
            case 'audio-capture':
              errorMessage = 'Microphone not accessible.';
              break;
            case 'not-allowed':
              errorMessage = 'Microphone access denied.';
              break;
            case 'network':
              errorMessage = 'Network error. Check connection.';
              break;
            default:
              errorMessage = `Error: ${event.error}`;
          }
          
          setError(errorMessage);
          setIsListening(false);
          if (onError) onError(errorMessage);
        };
      }
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [language, onResult, onError]);

  const startListening = useCallback(async () => {
    if (recognitionRef.current && !isListening) {
      try {
        setError(null);
        setTranscript('');
        setInterimTranscript('');
        
        // Set these RIGHT BEFORE starting
        recognitionRef.current.lang = language;
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.maxAlternatives = 1;
        
        recognitionRef.current.start();
        console.log('[useVoiceInput] Started continuous recognition with settings:', {
          lang: language,
          continuous: true,
          interimResults: true
        });
      } catch (err: any) {
        console.error('[useVoiceInput] Failed to start:', err);
        setError('Failed to start voice input');
        if (onError) onError('Failed to start voice input');
      }
    }
  }, [isListening, language, onError]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      try {
        recognitionRef.current.stop();
        console.log('[useVoiceInput] Stopped recognition');
      } catch (err) {
        console.error('[useVoiceInput] Error stopping:', err);
      }
    }
    setIsListening(false);
    setInterimTranscript('');
  }, [isListening]);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
    setError(null);
  }, []);

  return {
    isListening,
    transcript,
    interimTranscript,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
    error,
  };
}
