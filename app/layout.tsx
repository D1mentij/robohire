import type { Metadata } from "next";
import { AppHeader } from "@/components/AppHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: "RoboHire — Commercial B2B RaaS Brokerage & 3D ROI Simulator",
  description:
    "Compare 15 real commercial & industrial service robots against verified 2026 Latvia full employer labor costs (incl. 23.59% VSAOI) across 1–3 shifts and simulate deployments in 3D.",
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
