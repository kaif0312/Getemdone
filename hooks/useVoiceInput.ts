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
  const hasReceivedSpeech = useRef(false);
  const restartTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isManuallyStopped = useRef(false);

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
        recognitionRef.current.continuous = continuous;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.lang = language;
        recognitionRef.current.maxAlternatives = 1;
        
        console.log('[useVoiceInput] Speech recognition initialized');
        console.log('[useVoiceInput] continuous:', continuous);
        console.log('[useVoiceInput] interimResults:', true);
        console.log('[useVoiceInput] lang:', language);
        console.log('[useVoiceInput] maxAlternatives:', 1);

        recognitionRef.current.onstart = () => {
          console.log('[useVoiceInput] onstart event fired!');
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/57ba9c7c-d66c-49e3-b3ac-38a58928614f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useVoiceInput.ts:onstart',message:'Recognition started',data:{lang:language,continuous:continuous},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1'})}).catch(()=>{});
          // #endregion
          setIsListening(true);
          setError(null);
          // Haptic feedback on mobile
          if ('vibrate' in navigator) {
            navigator.vibrate(50);
          }
        };

        recognitionRef.current.onend = () => {
          console.log('[useVoiceInput] onend event fired!');
          console.log('[useVoiceInput] Has received speech:', hasReceivedSpeech.current);
          console.log('[useVoiceInput] Is manually stopped:', isManuallyStopped.current);
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/57ba9c7c-d66c-49e3-b3ac-38a58928614f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useVoiceInput.ts:onend',message:'Recognition ended',data:{hadTranscript:!!transcript,hadInterim:!!interimTranscript,hasReceivedSpeech:hasReceivedSpeech.current,isManuallyStopped:isManuallyStopped.current},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1'})}).catch(()=>{});
          // #endregion
          
          // Only auto-restart if NOT manually stopped and haven't received speech yet
          if (continuous && !hasReceivedSpeech.current && !isManuallyStopped.current && recognitionRef.current) {
            console.log('[useVoiceInput] Auto-restarting recognition...');
            restartTimeoutRef.current = setTimeout(() => {
              try {
                if (recognitionRef.current && !isManuallyStopped.current) {
                  recognitionRef.current.start();
                  console.log('[useVoiceInput] Recognition restarted');
                }
              } catch (err) {
                console.error('[useVoiceInput] Failed to restart:', err);
                setIsListening(false);
                setInterimTranscript('');
              }
            }, 100);
          } else {
            setIsListening(false);
            setInterimTranscript('');
            hasReceivedSpeech.current = false;
            isManuallyStopped.current = false;
          }
        };
        
        recognitionRef.current.onaudiostart = () => {
          console.log('[useVoiceInput] onaudiostart - mic is capturing audio');
          const startTime = Date.now();
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/57ba9c7c-d66c-49e3-b3ac-38a58928614f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useVoiceInput.ts:onaudiostart',message:'Audio capture started',data:{timestamp:startTime},timestamp:startTime,sessionId:'debug-session',hypothesisId:'H2'})}).catch(()=>{});
          // #endregion
        };
        
        recognitionRef.current.onaudioend = () => {
          console.log('[useVoiceInput] onaudioend - mic stopped capturing');
          const endTime = Date.now();
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/57ba9c7c-d66c-49e3-b3ac-38a58928614f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useVoiceInput.ts:onaudioend',message:'Audio capture ended',data:{timestamp:endTime,note:'Check duration from onaudiostart'},timestamp:endTime,sessionId:'debug-session',hypothesisId:'H2'})}).catch(()=>{});
          // #endregion
        };
        
        recognitionRef.current.onsoundstart = () => {
          console.log('[useVoiceInput] onsoundstart - sound detected');
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/57ba9c7c-d66c-49e3-b3ac-38a58928614f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useVoiceInput.ts:onsoundstart',message:'Sound detected',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H10'})}).catch(()=>{});
          // #endregion
        };
        
        recognitionRef.current.onsoundend = () => {
          console.log('[useVoiceInput] onsoundend - sound ended');
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/57ba9c7c-d66c-49e3-b3ac-38a58928614f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useVoiceInput.ts:onsoundend',message:'Sound ended',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H10'})}).catch(()=>{});
          // #endregion
        };
        
        recognitionRef.current.onspeechstart = () => {
          console.log('[useVoiceInput] onspeechstart - speech detected!');
          hasReceivedSpeech.current = true;
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/57ba9c7c-d66c-49e3-b3ac-38a58928614f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useVoiceInput.ts:onspeechstart',message:'Speech detected',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H4'})}).catch(()=>{});
          // #endregion
        };
        
        recognitionRef.current.onspeechend = () => {
          console.log('[useVoiceInput] onspeechend - speech stopped');
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/57ba9c7c-d66c-49e3-b3ac-38a58928614f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useVoiceInput.ts:onspeechend',message:'Speech ended',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H4'})}).catch(()=>{});
          // #endregion
        };
        
        recognitionRef.current.onnomatch = () => {
          console.log('[useVoiceInput] onnomatch - speech not recognized');
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/57ba9c7c-d66c-49e3-b3ac-38a58928614f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useVoiceInput.ts:onnomatch',message:'No speech match',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H4'})}).catch(()=>{});
          // #endregion
        };

        recognitionRef.current.onresult = (event: any) => {
          console.log('[useVoiceInput] onresult event fired!', event);
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/57ba9c7c-d66c-49e3-b3ac-38a58928614f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useVoiceInput.ts:onresult',message:'Result received',data:{resultIndex:event.resultIndex,resultsLength:event.results.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3'})}).catch(()=>{});
          // #endregion
          
          let finalTranscript = '';
          let interimText = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            console.log('[useVoiceInput] Result', i, ':', transcript, 'isFinal:', event.results[i].isFinal);
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/57ba9c7c-d66c-49e3-b3ac-38a58928614f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useVoiceInput.ts:onresult-loop',message:'Processing result',data:{index:i,transcript:transcript,isFinal:event.results[i].isFinal,confidence:event.results[i][0].confidence},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3'})}).catch(()=>{});
            // #endregion
            if (event.results[i].isFinal) {
              finalTranscript += transcript;
            } else {
              interimText += transcript;
            }
          }

          console.log('[useVoiceInput] Final transcript:', finalTranscript);
          console.log('[useVoiceInput] Interim text:', interimText);
          
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/57ba9c7c-d66c-49e3-b3ac-38a58928614f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useVoiceInput.ts:onresult-after',message:'Transcripts processed',data:{finalTranscript:finalTranscript,interimText:interimText,hasFinal:!!finalTranscript,hasInterim:!!interimText},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3'})}).catch(()=>{});
          // #endregion

          if (finalTranscript) {
            setTranscript(prev => prev + finalTranscript);
            setInterimTranscript('');
            console.log('[useVoiceInput] Calling onResult with:', finalTranscript);
            onResult(finalTranscript);
            // Haptic feedback on success
            if ('vibrate' in navigator) {
              navigator.vibrate([30, 50, 30]);
            }
          } else {
            setInterimTranscript(interimText);
          }
        };

        recognitionRef.current.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error);
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/57ba9c7c-d66c-49e3-b3ac-38a58928614f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useVoiceInput.ts:onerror',message:'Recognition error',data:{error:event.error,message:event.message,type:event.type},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H12'})}).catch(()=>{});
          // #endregion
          
          let errorMessage = 'Voice input error';
          switch (event.error) {
            case 'no-speech':
              errorMessage = 'No speech detected. Please try again.';
              break;
            case 'audio-capture':
              errorMessage = 'Microphone not accessible. Please check permissions.';
              break;
            case 'not-allowed':
              errorMessage = 'Microphone access denied. Please enable in browser settings.';
              break;
            case 'network':
              errorMessage = 'Network error. Please check your connection.';
              break;
            case 'service-not-allowed':
              errorMessage = 'Speech recognition service blocked. Check Chrome settings.';
              break;
            case 'aborted':
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/57ba9c7c-d66c-49e3-b3ac-38a58928614f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useVoiceInput.ts:onerror-aborted',message:'Recognition aborted',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H12'})}).catch(()=>{});
              // #endregion
              // User stopped, not really an error
              return;
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
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [language, continuous, onResult, onError]);

  const startListening = useCallback(async () => {
    console.log('[useVoiceInput] startListening called');
    console.log('[useVoiceInput] recognitionRef.current:', !!recognitionRef.current);
    console.log('[useVoiceInput] isListening:', isListening);
    console.log('[useVoiceInput] language:', language);
    
    // Reset the manually stopped flag when starting
    isManuallyStopped.current = false;
    hasReceivedSpeech.current = false;
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/57ba9c7c-d66c-49e3-b3ac-38a58928614f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useVoiceInput.ts:startListening',message:'Checking mic permissions',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H6'})}).catch(()=>{});
    // #endregion
    
    // Check microphone permissions first
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('[useVoiceInput] Microphone access granted');
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/57ba9c7c-d66c-49e3-b3ac-38a58928614f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useVoiceInput.ts:getUserMedia',message:'Mic permission granted',data:{audioTracks:stream.getAudioTracks().length,trackLabel:stream.getAudioTracks()[0]?.label},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H6'})}).catch(()=>{});
      // #endregion
      // Stop the stream, we just needed to check permissions
      stream.getTracks().forEach(track => track.stop());
    } catch (err: any) {
      console.error('[useVoiceInput] Microphone permission error:', err);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/57ba9c7c-d66c-49e3-b3ac-38a58928614f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useVoiceInput.ts:getUserMedia-error',message:'Mic permission denied',data:{error:err.name,message:err.message},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H6'})}).catch(()=>{});
      // #endregion
      setError('Microphone access denied. Please allow microphone in browser settings.');
      if (onError) onError('Microphone access denied');
      return;
    }
    
    if (recognitionRef.current && !isListening) {
      try {
        setError(null);
        setTranscript('');
        setInterimTranscript('');
        recognitionRef.current.lang = language;
        console.log('[useVoiceInput] Calling recognition.start()...');
        recognitionRef.current.start();
        console.log('[useVoiceInput] recognition.start() called successfully');
      } catch (err: any) {
        console.error('[useVoiceInput] Failed to start recognition:', err);
        console.error('[useVoiceInput] Error message:', err.message);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/57ba9c7c-d66c-49e3-b3ac-38a58928614f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useVoiceInput.ts:start-error',message:'Recognition start failed',data:{error:err.name,message:err.message},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H7'})}).catch(()=>{});
        // #endregion
        setError('Failed to start voice input: ' + err.message);
      }
    } else {
      console.log('[useVoiceInput] Cannot start - recognitionRef:', !!recognitionRef.current, 'isListening:', isListening);
    }
  }, [isListening, language, onError]);

  const stopListening = useCallback(() => {
    console.log('[useVoiceInput] stopListening called - manually stopping');
    
    // Set the manually stopped flag FIRST
    isManuallyStopped.current = true;
    hasReceivedSpeech.current = false;
    
    // Clear any pending restart
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
    
    // Stop recognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
        console.log('[useVoiceInput] Recognition stopped');
      } catch (err) {
        console.error('[useVoiceInput] Error stopping recognition:', err);
      }
    }
    
    // Update UI state
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
