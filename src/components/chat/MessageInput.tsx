'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import styles from './MessageInput.module.css';

interface MentionCandidate {
  id: string;
  display_name: string;
  avatar_color: string;
}

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
  // @mention support
  mentionCandidates?: MentionCandidate[];
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
  mentionCandidates = [],
}: MessageInputProps) {
  const [text, setText] = useState('');
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [selectedMentionIdx, setSelectedMentionIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // When voice transcript updates, append to text
  useEffect(() => {
    if (voiceTranscript) {
      setText(prev => prev + voiceTranscript);
    }
  }, [voiceTranscript]);

  const filteredCandidates = useMemo(() => {
    if (!mentionFilter) return mentionCandidates;
    return mentionCandidates.filter(c =>
      c.display_name.includes(mentionFilter)
    );
  }, [mentionCandidates, mentionFilter]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;

    if (isListening && onStopListening) {
      onStopListening();
    }

    onSend(trimmed);
    setText('');
    setShowMentionMenu(false);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, disabled, onSend, isListening, onStopListening]);

  const insertMention = useCallback((candidate: MentionCandidate) => {
    // Replace the @partial with @fullname
    const lastAtIdx = text.lastIndexOf('@');
    const before = lastAtIdx >= 0 ? text.substring(0, lastAtIdx) : text;
    setText(`${before}@${candidate.display_name} `);
    setShowMentionMenu(false);
    setMentionFilter('');
    setSelectedMentionIdx(0);
    textareaRef.current?.focus();
  }, [text]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showMentionMenu && filteredCandidates.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedMentionIdx(prev => (prev + 1) % filteredCandidates.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedMentionIdx(prev => (prev - 1 + filteredCandidates.length) % filteredCandidates.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(filteredCandidates[selectedMentionIdx]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowMentionMenu(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setText(value);

    // Check for @mention trigger
    const lastAtIdx = value.lastIndexOf('@');
    if (lastAtIdx >= 0 && mentionCandidates.length > 0) {
      const afterAt = value.substring(lastAtIdx + 1);
      // Only show menu if @ is at the end or followed by partial name (no space after name yet)
      if (!afterAt.includes(' ') && !afterAt.includes('\n')) {
        setShowMentionMenu(true);
        setMentionFilter(afterAt);
        setSelectedMentionIdx(0);
      } else {
        setShowMentionMenu(false);
      }
    } else {
      setShowMentionMenu(false);
    }

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
          placeholder={placeholder || '输入你的观点... (Enter发送, Shift+Enter换行, @点名)'}
          disabled={disabled}
          rows={1}
        />
        {isListening && interimTranscript && (
          <div className={styles.interimText}>{interimTranscript}</div>
        )}

        {/* @mention dropdown */}
        {showMentionMenu && filteredCandidates.length > 0 && (
          <div className={styles.mentionMenu}>
            {filteredCandidates.map((c, i) => (
              <button
                key={c.id}
                className={`${styles.mentionItem} ${i === selectedMentionIdx ? styles.mentionItemActive : ''}`}
                onClick={() => insertMention(c)}
                onMouseEnter={() => setSelectedMentionIdx(i)}
              >
                <span
                  className={styles.mentionAvatar}
                  style={{ background: c.avatar_color }}
                />
                <span className={styles.mentionName}>{c.display_name}</span>
              </button>
            ))}
          </div>
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
