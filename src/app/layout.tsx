import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Trial Booking System",
  description: "Reliable, concurrency-safe trial class booking and roster management",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900 font-sans">
        <header className="border-b border-slate-200 bg-white sticky top-0 z-30">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
            <div className="flex items-center gap-6">
              <Link href="/classes" className="flex items-center gap-2 font-semibold text-slate-900 text-sm tracking-tight">
                <span className="w-2.5 h-2.5 rounded-full bg-teal-600 inline-block" />
                Trial Booking System
              </Link>
              <nav className="flex items-center gap-1">
                <Link
                  href="/classes"
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                >
                  Trial Classes
                </Link>
                <Link
                  href="/admin/roster"
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                >
                  Teacher Roster
                </Link>
              </nav>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>PostgreSQL • Cap: 4</span>
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">
          {children}
        </main>

        <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
          <div className="max-w-6xl mx-auto px-4">
            Trial Booking Reliability Slice • Concurrency-safe atomic invariant demo
          </div>
        </footer>
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
