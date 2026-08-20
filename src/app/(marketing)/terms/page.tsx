import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";
import { TERMS } from "@/lib/legal-content";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The terms that govern your use of AI Video Studio, including content ownership, BYOK responsibility, credits, and prohibited uses.",
};

export default function TermsPage() {
  return <LegalPage doc={TERMS} />;
}
