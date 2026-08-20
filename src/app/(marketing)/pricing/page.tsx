import type { Metadata } from "next";
import PricingClient from "@/components/marketing/PricingClient";
import { SITE_URL } from "@/lib/site-data";

export const metadata: Metadata = {
  title: { absolute: "Pricing · 定价｜AI Video Studio" },
  description:
    "Daily free quota for demo login. Paid plans coming soon. / 演示登录每日免费额度，付费即将上线。",
  alternates: { canonical: `${SITE_URL}/pricing` },
};

export default function PricingPage() {
  return <PricingClient />;
}
