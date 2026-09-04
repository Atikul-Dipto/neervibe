import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/shell/AppShell";
import { THEME_BOOTSTRAP } from "@/data/theme";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NeerVibe — Logistics Operating System",
  description: "AI-native logistics control tower and operational intelligence platform for Bangladesh",
};

export const viewport: Viewport = {
  themeColor: "#f2f2f2",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="light" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Stamps the saved theme on <html> before first paint, so the page
            never flashes the wrong one. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="h-full min-h-full bg-nv-950 text-ink-900">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
