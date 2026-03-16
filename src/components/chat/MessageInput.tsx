'use client';

import { useState, useRef, useCallback } from 'react';
import styles from './MessageInput.module.css';

interface MessageInputProps {
  onSend: (content: string) => void;
  disabled: boolean;
  placeholder?: string;
}

export default function MessageInput({ onSend, disabled, placeholder }: MessageInputProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;

    onSend(trimmed);
    setText('');

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, disabled, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    // Auto-resize
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  };

  return (
    <div className={styles.inputBar}>
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
