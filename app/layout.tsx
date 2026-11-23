import type { Metadata } from "next";
import { AppHeader } from "@/components/AppHeader";
import "./globals.css";

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
      className="dark h-full antialiased"
    >
      <body className="flex min-h-full flex-col bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100">
        <AppHeader />
        <div className="flex flex-1 flex-col">{children}</div>
      </body>
    </html>
  );
}
