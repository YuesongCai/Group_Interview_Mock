'use client';

import { useState } from 'react';
import styles from './MessageBubble.module.css';

export interface MessageBubbleProps {
  participantName: string;
  content: string;
  isUser: boolean;
  isHost?: boolean;
  isInterrupt: boolean;
  isSystem: boolean;
  avatarColor: string;
  timestamp: string;
  innerMonologue?: string;
  onAvatarClick?: () => void;
}

export default function MessageBubble({
  participantName,
  content,
  isUser,
  isHost,
  isInterrupt,
  isSystem,
  avatarColor,
  timestamp,
  innerMonologue,
  onAvatarClick,
}: MessageBubbleProps) {
  const [showThought, setShowThought] = useState(false);

  if (isSystem) {
    return (
      <div className={styles.systemMessage}>
        <div className={styles.systemContent}>{content}</div>
      </div>
    );
  }

  const time = new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const messageClass = isUser
    ? styles.userMessage
    : isHost
    ? styles.hostMessage
    : styles.aiMessage;

  const bubbleClass = isUser
    ? styles.userBubble
    : isHost
    ? styles.hostBubble
    : styles.aiBubble;

  return (
    <div
      className={`${styles.message} ${messageClass} animate-fade-in`}
    >
      <div
        className={`${styles.avatar} ${onAvatarClick ? styles.avatarClickable : ''}`}
        style={{ backgroundColor: avatarColor }}
        onClick={onAvatarClick}
        title={onAvatarClick ? `查看${participantName}的简历` : undefined}
      >
        {isHost ? '🎙' : participantName[0]}
      </div>
      <div className={styles.bubbleWrapper}>
        <div className={styles.nameRow}>
          <span className={styles.name}>{participantName}</span>
          {isHost && <span className={styles.hostBadge}>主持人</span>}
          {isInterrupt && <span className={styles.interruptBadge}>插入发言</span>}
          <span className={styles.time}>{time}</span>
        </div>
        <div className={`${styles.bubble} ${bubbleClass}`}>
          {content}
          {innerMonologue && (
            <button
              className={styles.thoughtToggle}
              onClick={() => setShowThought(prev => !prev)}
              title="偷看内心想法"
            >
              💭
            </button>
          )}
        </div>
        {showThought && innerMonologue && (
          <div className={styles.thoughtBubble}>
            <span className={styles.thoughtLabel}>内心OS</span>
            {innerMonologue}
          </div>
        )}
      </div>
    </div>
  );
}
