"use client";

// Client-side abuse report form. Posts to the Next.js BFF route at
// /api/report-abuse, which relays to the backend API. The backend validates
// `reason` against a fixed set of codes (copyright/illegal/spam/privacy/other,
// 03-接口文档 §5.6) and collapses duplicates via `idempotency_key`.
// State is transient (component memory only) — nothing is persisted to
// localStorage, cookies, or sessionStorage.
//
// Styling follows prototype report-abuse.html: .field / .select-line /
// .textarea-line / .input-line / .btn-ink, with .form-err for errors.

import { useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";

// Codes must match the backend's allowed set (api/src/routes/report-abuse.ts).
const REASONS: { code: string; label: string }[] = [
  { code: "copyright", label: "Intellectual property infringement" },
  { code: "illegal", label: "Illegal or harmful content" },
  { code: "privacy", label: "Non-consensual depiction / privacy violation" },
  { code: "spam", label: "Spam or deceptive content" },
  { code: "other", label: "Other" },
];

export default function ReportAbuseForm() {
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "error"; message: string }
    | { kind: "success" }
  >({ kind: "idle" });

  // 幂等键：同一份报告的重复提交（含网络重试）命中后端唯一约束，返回首单。
  // 失败重试沿用同一键；成功后生成新键供下一份报告。
  const idemRef = useRef<string | null>(null);
  const nextIdem = () => idemRef.current ?? (idemRef.current = crypto.randomUUID());

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason || !details.trim()) {
      setStatus({
        kind: "error",
        message: "Please select a reason and describe the issue.",
      });
      return;
    }
    setBusy(true);
    setStatus({ kind: "idle" });
    try {
      // apiFetch throws ApiRequestError on non-2xx with the backend's
      // {error:{code,message}} surfaced; report-abuse returns 201 {id,status,created_at}.
      await apiFetch<{ id?: string }>("/api/report-abuse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason,
          details: details.trim(),
          contact: contact.trim() || null,
          idempotency_key: nextIdem(),
        }),
      });
      idemRef.current = null;
      setStatus({ kind: "success" });
      setReason("");
      setDetails("");
      setContact("");
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Submission failed. Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="field" style={{ marginBottom: 18 }}>
        <label htmlFor="reason">Reason</label>
        <select
          id="reason"
          className="select-line"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        >
          <option value="">Select a reason…</option>
          {REASONS.map((r) => (
            <option key={r.code} value={r.code}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field" style={{ marginBottom: 18 }}>
        <label htmlFor="details">Details</label>
        <textarea
          id="details"
          className="textarea-line"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="Link to the content (if public), what is wrong, and any context that helps us identify it. Please do not include passwords or API keys."
        />
      </div>

      <div className="field" style={{ marginBottom: 22 }}>
        <label htmlFor="contact">Your email (optional, for follow-up)</label>
        <input
          id="contact"
          className="input-line"
          type="email"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="you@example.com"
        />
      </div>

      {status.kind === "error" ? (
        <div className="form-err">{status.message}</div>
      ) : null}
      {status.kind === "success" ? (
        <div
          style={{
            marginTop: 14,
            fontSize: 13,
            color: "var(--ink)",
            border: "1px solid var(--line-dark)",
            borderRadius: 3,
            padding: "9px 12px",
            background: "var(--card)",
          }}
        >
          Thank you — your report has been submitted and is in our review queue.
        </div>
      ) : null}

      <div style={{ marginTop: 22 }}>
        <button className="btn-ink" type="submit" disabled={busy} style={{ padding: "10px 22px" }}>
          {busy ? "Submitting…" : "Submit report"}
        </button>
        <span className="note">› 提交 → POST /api/report-abuse</span>
      </div>
    </form>
  );
}
