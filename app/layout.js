import './globals.css';

export const metadata = {
  title: 'Doc Comparator',
  description: '문서 버전 비교 도구',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body className="bg-gray-50 min-h-screen">{children}</body>
    </html>
  );
}
