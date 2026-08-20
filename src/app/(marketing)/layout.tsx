import type { ReactNode } from "react";
import MktFooter from "@/components/marketing/MktFooter";
import MktHeader from "@/components/marketing/MktHeader";
import "../marketing.css";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <MktHeader />
      <div>{children}</div>
      <MktFooter />
    </>
  );
}
