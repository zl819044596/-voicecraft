import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppLayout } from "@/components/app/layout/AppLayout";

// App-area layout — every page under /app is part of the authenticated
// workbench and must never be indexed (PRD §6.1). The metadata block here
// applies noindex/follow-off to the whole subtree; the marketing Nav/Footer
// are intentionally not used on app pages (Sidebar + TopBar replace them).
export const metadata: Metadata = {
  title: "Workbench",
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

export default function AppLayoutRoot({ children }: { children: ReactNode }) {
  return <AppLayout>{children}</AppLayout>;
}
