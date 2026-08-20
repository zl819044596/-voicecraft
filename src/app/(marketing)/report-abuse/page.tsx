import type { Metadata } from "next";
import ReportAbuseForm from "@/components/ReportAbuseForm";

export const metadata: Metadata = {
  title: {
    absolute: "Report Abuse — AI Video Studio",
  },
  description:
    "Report content generated or distributed with AI Video Studio that you believe violates our Terms of Service. Reviewed by a human, no account required.",
  alternates: { canonical: "/report-abuse" },
};

// 营销区 · 滥用举报（合规 R4）。结构对照原型 report-abuse.html：
// 左对齐标题 + legal-wrap 表单区 + "What happens next" + 隐私引导。
export default function ReportAbusePage() {
  return (
    <main className="legal-wrap">
      <div className="kicker">Trust &amp; Safety</div>
      <h1>Report abuse</h1>
      <p className="legal-meta">Reviewed by a human · No account required</p>

      <p>
        Use this form to report content generated or distributed with AI Video Studio that you
        believe violates our <a href="/terms">Terms of Service</a> — for example non-consensual
        depictions of real people, impersonation, IP infringement, or illegal content. Reports are
        reviewed in the order received; we may contact you if details are missing.
      </p>

      {/* 举报表单（客户端组件，提交 → BFF → 后端 POST /api/report-abuse） */}
      <div style={{ borderTop: "2px solid var(--ink)", marginTop: 28, paddingTop: 26 }}>
        <ReportAbuseForm />
      </div>

      <h2>What happens next</h2>
      <ul>
        <li>
          <b>Acknowledgement</b> — duplicate submissions collapse into one case.
        </li>
        <li>
          <b>Review</b> — a human reviews the report against the prohibited-use clauses in our Terms.
        </li>
        <li>
          <b>Action</b> — confirmed violations lead to content removal and, where applicable, account
          suspension. We do not disclose reporter identity to the reported party.
        </li>
      </ul>
      <p className="muted" style={{ fontSize: 13 }}>
        For privacy requests (data export or deletion), see the{" "}
        <a href="/privacy">Privacy Policy</a> instead — those are handled self-service from
        /app/settings.
      </p>
    </main>
  );
}
