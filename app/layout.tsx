import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppHeader } from "@/components/AppHeader";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RoboHire — Booster K1 Humanoid Job Matcher & 3D Simulator",
  description:
    "Upload a short video of your business space to match Booster K1 humanoid robot jobs, estimate ROI and payback, and simulate tasks in 3D.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100">
        <AppHeader />
        <div className="flex flex-1 flex-col">{children}</div>
      </body>
    </html>
  );
}
