import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { version } from "../package.json";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "DocCompare",
  description: "IEC 62366 문서 버전 비교 및 변경 검색",
};

export default function RootLayout({ children }) {
  return (
    <html
      id="root"
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body id="body-root" className="h-full">
        {children}
        <footer
          id="app-version-footer"
          className="pointer-events-none fixed bottom-1 right-2 z-50 text-[10px] text-gray-400"
        >
          Doc Comparator v{version}
        </footer>
      </body>
    </html>
  );
}
