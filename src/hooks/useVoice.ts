'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface VoiceConfig {
  lang?: string;
  // TTS voice assignment per participant (participant_id -> voice settings)
  voiceMap?: Map<string, { pitch: number; rate: number }>;
}

interface UseVoiceReturn {
  // STT
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  startListening: () => void;
  stopListening: () => void;
  sttSupported: boolean;
  // TTS
  isSpeaking: boolean;
  speak: (text: string, participantId?: string) => void;
  stopSpeaking: () => void;
  ttsSupported: boolean;
  ttsEnabled: boolean;
  setTtsEnabled: (enabled: boolean) => void;
}

// Default voice settings for different participant indices
const VOICE_PRESETS = [
  { pitch: 1.0, rate: 1.0 },   // Host: neutral
  { pitch: 1.1, rate: 1.05 },  // Participant 1: slightly higher
  { pitch: 0.85, rate: 0.95 }, // Participant 2: lower, slower
  { pitch: 1.2, rate: 1.1 },   // Participant 3: higher, faster
  { pitch: 0.9, rate: 1.0 },   // Participant 4: slightly low
  { pitch: 1.05, rate: 0.9 },  // Participant 5: medium, slower
];

export function useVoice(config: VoiceConfig = {}): UseVoiceReturn {
  const { lang = 'zh-CN' } = config;

  // STT state
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // TTS state
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const speechQueueRef = useRef<{ text: string; participantId?: string }[]>([]);
  const isSpeakingRef = useRef(false);
  const participantIndexRef = useRef(new Map<string, number>());
  const voiceMapRef = useRef(config.voiceMap);
  voiceMapRef.current = config.voiceMap;

  // Check browser support
  const sttSupported = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
  const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  // Initialize speech recognition
  useEffect(() => {
    if (!sttSupported) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      if (final) {
        setTranscript(prev => prev + final);
        setInterimTranscript('');
      } else {
        setInterimTranscript(interim);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);
      if (event.error !== 'no-speech') {
        setIsListening(false);
      }
    };

    recognition.onend = () => {
      // Auto-restart if still in listening mode
      if (recognitionRef.current && isListening) {
        try {
          recognition.start();
        } catch {
          setIsListening(false);
        }
      }
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.abort();
      recognitionRef.current = null;
    };
  }, [sttSupported, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const startListening = useCallback(() => {
    if (!recognitionRef.current || isListening) return;
    setTranscript('');
    setInterimTranscript('');
    try {
      recognitionRef.current.start();
      setIsListening(true);
    } catch (e) {
      console.error('Failed to start recognition:', e);
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current) return;
    recognitionRef.current.stop();
    setIsListening(false);
    setInterimTranscript('');
  }, []);

  // TTS: get voice settings for a participant
  const getVoiceSettings = useCallback((participantId?: string) => {
    if (!participantId) return VOICE_PRESETS[0];

    // Check custom voice map
    if (voiceMapRef.current?.has(participantId)) {
      return voiceMapRef.current.get(participantId)!;
    }

    // Assign based on index
    if (!participantIndexRef.current.has(participantId)) {
      const nextIdx = participantIndexRef.current.size;
      participantIndexRef.current.set(participantId, nextIdx);
    }
    const idx = participantIndexRef.current.get(participantId)!;
    return VOICE_PRESETS[idx % VOICE_PRESETS.length];
  }, []);

  // Process TTS queue
  const processQueue = useCallback(() => {
    if (!ttsSupported || isSpeakingRef.current || speechQueueRef.current.length === 0) return;

    const { text, participantId } = speechQueueRef.current.shift()!;
    const settings = getVoiceSettings(participantId);

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.pitch = settings.pitch;
    utterance.rate = settings.rate;

    // Try to find a Chinese voice
    const voices = speechSynthesis.getVoices();
    const zhVoice = voices.find(v => v.lang.startsWith('zh'));
    if (zhVoice) {
      utterance.voice = zhVoice;
    }

    utterance.onstart = () => {
      isSpeakingRef.current = true;
      setIsSpeaking(true);
    };

    utterance.onend = () => {
      isSpeakingRef.current = false;
      setIsSpeaking(false);
      // Process next in queue
      processQueue();
    };

    utterance.onerror = () => {
      isSpeakingRef.current = false;
      setIsSpeaking(false);
      processQueue();
    };

    speechSynthesis.speak(utterance);
  }, [ttsSupported, lang, getVoiceSettings]);

  const speak = useCallback((text: string, participantId?: string) => {
    if (!ttsSupported || !ttsEnabled) return;
    speechQueueRef.current.push({ text, participantId });
    processQueue();
  }, [ttsSupported, ttsEnabled, processQueue]);

  const stopSpeaking = useCallback(() => {
    if (!ttsSupported) return;
    speechQueueRef.current = [];
    speechSynthesis.cancel();
    isSpeakingRef.current = false;
    setIsSpeaking(false);
  }, [ttsSupported]);

  return {
    isListening,
    transcript,
    interimTranscript,
    startListening,
    stopListening,
    sttSupported,
    isSpeaking,
    speak,
    stopSpeaking,
    ttsSupported,
    ttsEnabled,
    setTtsEnabled,
  };
}

// Extend Window for webkit prefix
declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}
