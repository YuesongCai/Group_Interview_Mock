'use client';

import styles from './MessageBubble.module.css';

interface MessageBubbleProps {
  participantName: string;
  content: string;
  isUser: boolean;
  isInterrupt: boolean;
  isSystem: boolean;
  avatarColor: string;
  timestamp: string;
}

export default function MessageBubble({
  participantName,
  content,
  isUser,
  isInterrupt,
  isSystem,
  avatarColor,
  timestamp,
}: MessageBubbleProps) {
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

  return (
    <div
      className={`${styles.message} ${isUser ? styles.userMessage : styles.aiMessage} animate-fade-in`}
    >
      <div
        className={styles.avatar}
        style={{ backgroundColor: avatarColor }}
      >
        {participantName[0]}
      </div>
      <div className={styles.bubbleWrapper}>
        <div className={styles.nameRow}>
          <span className={styles.name}>{participantName}</span>
          {isInterrupt && <span className={styles.interruptBadge}>插入发言</span>}
          <span className={styles.time}>{time}</span>
        </div>
        <div className={`${styles.bubble} ${isUser ? styles.userBubble : styles.aiBubble}`}>
          {content}
        </div>
      </div>
    </div>
  );
}
