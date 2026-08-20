import type { Metadata } from "next";
import type { ReactNode } from "react";
import MktHeader from "@/components/marketing/MktHeader";
import "../marketing.css";

export const metadata: Metadata = {
  title: "Log in",
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

export default function LoginLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <MktHeader />
      {children}
    </>
  );
}
