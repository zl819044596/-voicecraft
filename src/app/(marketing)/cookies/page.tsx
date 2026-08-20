import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";
import { COOKIES } from "@/lib/legal-content";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description:
    "How AI Video Studio uses cookies and browser storage, and how to control non-essential cookies.",
};

export default function CookiesPage() {
  return <LegalPage doc={COOKIES} />;
}
