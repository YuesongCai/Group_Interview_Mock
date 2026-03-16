'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import styles from './MessageInput.module.css';

interface MessageInputProps {
  onSend: (content: string) => void;
  disabled: boolean;
  placeholder?: string;
  // Voice support
  isListening?: boolean;
  sttSupported?: boolean;
  voiceTranscript?: string;
  interimTranscript?: string;
  onStartListening?: () => void;
  onStopListening?: () => void;
}

export default function MessageInput({
  onSend,
  disabled,
  placeholder,
  isListening,
  sttSupported,
  voiceTranscript,
  interimTranscript,
  onStartListening,
  onStopListening,
}: MessageInputProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // When voice transcript updates, append to text
  useEffect(() => {
    if (voiceTranscript) {
      setText(prev => prev + voiceTranscript);
    }
  }, [voiceTranscript]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;

    // Stop listening when sending
    if (isListening && onStopListening) {
      onStopListening();
    }

    onSend(trimmed);
    setText('');

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, disabled, onSend, isListening, onStopListening]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  };

  const toggleVoice = () => {
    if (isListening) {
      onStopListening?.();
    } else {
      onStartListening?.();
    }
  };

  return (
    <div className={styles.inputBar}>
      {sttSupported && (
        <button
          className={`${styles.micBtn} ${isListening ? styles.micActive : ''}`}
          onClick={toggleVoice}
          disabled={disabled}
          title={isListening ? '停止语音输入' : '开始语音输入'}
        >
          {isListening ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          )}
        </button>
      )}

      <div className={styles.inputWrapper}>
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || '输入你的观点... (Enter发送, Shift+Enter换行)'}
          disabled={disabled}
          rows={1}
        />
        {isListening && interimTranscript && (
          <div className={styles.interimText}>{interimTranscript}</div>
        )}
      </div>

      <button
        className={`btn btn-primary ${styles.sendBtn}`}
        onClick={handleSend}
        disabled={disabled || !text.trim()}
      >
        发送
      </button>
    </div>
  );
}
