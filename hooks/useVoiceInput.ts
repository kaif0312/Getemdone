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
  const SpeechRecognitionClass = useRef<any>(null);

  useEffect(() => {
    // Check if Web Speech API is supported and store the class
    if (typeof window !== 'undefined') {
      const SpeechRecognition = 
        (window as any).SpeechRecognition || 
        (window as any).webkitSpeechRecognition;
      
      console.log('[useVoiceInput] SpeechRecognition available:', !!SpeechRecognition);
      setIsSupported(!!SpeechRecognition);
      SpeechRecognitionClass.current = SpeechRecognition;
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // ignore
        }
      }
    };
  }, []);

  const startListening = useCallback(async () => {
    if (!SpeechRecognitionClass.current || isListening) {
      console.log('[useVoiceInput] Cannot start - no class or already listening');
      return;
    }

    try {
      // Stop any existing recognition
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // ignore
        }
      }

      console.log('[useVoiceInput] Creating NEW recognition instance');
      
      // Create a FRESH recognition instance
      const recognition = new SpeechRecognitionClass.current();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = language;
      recognition.maxAlternatives = 1;

      // Setup event handlers for this instance
      recognition.onstart = () => {
        console.log('[useVoiceInput] ✅ Recognition started');
        setIsListening(true);
        setError(null);
        if ('vibrate' in navigator) {
          navigator.vibrate(50);
        }
      };

      recognition.onend = () => {
        console.log('[useVoiceInput] ⛔ Recognition ended');
        setIsListening(false);
        setInterimTranscript('');
      };

      recognition.onaudiostart = () => {
        console.log('[useVoiceInput] 🎤 Audio capture started');
      };

      recognition.onaudioend = () => {
        console.log('[useVoiceInput] 🎤 Audio capture ended');
      };

      recognition.onsoundstart = () => {
        console.log('[useVoiceInput] 🔊 Sound detected');
      };

      recognition.onsoundend = () => {
        console.log('[useVoiceInput] 🔇 Sound ended');
      };

      recognition.onspeechstart = () => {
        console.log('[useVoiceInput] 🗣️ Speech started');
      };

      recognition.onspeechend = () => {
        console.log('[useVoiceInput] 🤐 Speech ended');
      };

      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        let interimText = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimText += transcript;
          }
        }

        if (finalTranscript) {
          console.log('[useVoiceInput] 📝 Final transcript:', finalTranscript);
          setTranscript(prev => prev + finalTranscript);
          onResult(finalTranscript);
          if ('vibrate' in navigator) {
            navigator.vibrate([30, 50, 30]);
          }
        }
        
        setInterimTranscript(interimText);
      };

      recognition.onerror = (event: any) => {
        console.error('[useVoiceInput] ❌ Error:', event.error);
        
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

      // Store the new instance
      recognitionRef.current = recognition;

      // Clear states and start
      setError(null);
      setTranscript('');
      setInterimTranscript('');
      
      console.log('[useVoiceInput] Starting recognition...');
      recognition.start();

    } catch (err: any) {
      console.error('[useVoiceInput] Failed to start:', err);
      setError('Failed to start voice input');
      if (onError) onError('Failed to start voice input');
    }
  }, [isListening, language, onResult, onError]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        console.log('[useVoiceInput] 🛑 Stopping recognition');
        recognitionRef.current.stop();
      } catch (err) {
        console.error('[useVoiceInput] Error stopping:', err);
      }
    }
    setIsListening(false);
    setInterimTranscript('');
  }, []);

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
