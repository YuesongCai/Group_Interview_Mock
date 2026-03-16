import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GroupMock - AI群面模拟器',
  description: 'AI驱动的群面模拟练习平台，与AI候选人进行真实的无领导小组讨论',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
