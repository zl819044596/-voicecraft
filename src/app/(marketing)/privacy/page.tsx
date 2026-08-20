import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";
import { PRIVACY } from "@/lib/legal-content";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How AI Video Studio collects, uses, and protects your data, including third-party processors, BYOK key storage, and GDPR rights.",
};

export default function PrivacyPage() {
  return <LegalPage doc={PRIVACY} />;
}
