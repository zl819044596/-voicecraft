"use client";

// ShotGrid — Batch B4 ③ 画面 Visuals 的 4 列 shot-grid（原型 task-detail.html
// 217-284：16:9 缩略框 + tag + cap + Regen/Candidates(N) + stale 提示）。
// 候选图横条（原型 287-334）：选中某镜的 Candidates 后展开，可 Select 选用。
// 样式走 app-studio.css `.shot-grid` / `.shot` / `.frame` / `.tag` / `.cap` / `.ops`。

import { useState } from "react";
import type { TFunc } from "@/i18n";

export type ShotGridShot = {
  index: number;
  title: string;
  duration: number;
  candidates?: Array<{ key: string; is_default: boolean }>;
  ref_key?: string | null;
};

export function ShotGrid({
  shots,
  curImgFor,
  candidateImg,
  isStale,
  t,
  onRegen,
  onSelectCandidate,
  onUploadRef,
  onEnlarge,
}: {
  shots: ShotGridShot[];
  curImgFor: (index: number) => string | null;
  candidateImg: (key: string) => string | null;
  isStale: (index: number) => boolean;
  t: TFunc;
  onRegen: (index: number) => void;
  onSelectCandidate: (index: number, key: string) => void;
  onUploadRef: (index: number, file: File) => void;
  onEnlarge: (index: number) => void;
}) {
  const [openCands, setOpenCands] = useState<number | null>(null);
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div>
      <div className="shot-grid">
        {shots.map((shot) => {
          const img = curImgFor(shot.index);
          const cands = shot.candidates ?? [];
          const stale = isStale(shot.index);
          return (
            <div key={shot.index} className={`shot ${img ? "selected" : ""} ${stale ? "stale" : ""}`}>
              <span className="frame" onClick={() => img && onEnlarge(shot.index)} style={img ? { cursor: "pointer" } : undefined}>
                {img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={img}
                    alt={`shot ${shot.index}`}
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <svg viewBox="0 0 160 90" fill="none" stroke="#98938a" strokeWidth="1" style={{ opacity: stale ? 0.4 : 1 }}>
                    <rect x="40" y="22" width="80" height="46" />
                    <path d="M52 58l14-12 10 8 12-11 16 15" />
                  </svg>
                )}
                <span className="tag">{pad(shot.index)}</span>
              </span>
              <div className="cap">
                {shot.title || t("taskDetail.shotFallback", { n: shot.index })} · {t("taskDetail.shotPng", { n: pad(shot.index) })}
                {img ? <span> · {t("taskDetail.capSelected")}</span> : null}
                {stale ? (
                  <span style={{ color: "var(--run)" }}> · {t("rail.stale")} — {t("taskDetail.cellSub")}</span>
                ) : null}
              </div>
              <div className="ops">
                {stale ? (
                  <button type="button" className="btn-text accent" onClick={() => onRegen(shot.index)}>
                    {t("taskDetail.btnRerunShot")}
                  </button>
                ) : (
                  <>
                    <button type="button" className="btn-text" onClick={() => onRegen(shot.index)}>
                      {t("taskDetail.btnRegen")}
                    </button>
                    <button type="button" className="btn-text" onClick={() => setOpenCands(openCands === shot.index ? null : shot.index)}>
                      {t("taskDetail.btnCandidates")}
                      {cands.length > 0 ? ` (${cands.length})` : ""}
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 候选图（某镜 Candidates 展开） */}
      {openCands !== null && shots.some((s) => s.index === openCands) ? (
        <div style={{ border: "1px solid var(--line)", borderRadius: "var(--radius)", marginTop: 14 }}>
          <div className="row" style={{ padding: "9px 12px", borderBottom: "1px solid var(--line)", fontSize: 12, fontWeight: 600 }}>
            {t("taskDetail.candidatesTitle", { n: pad(openCands) })}
            <span className="small faint" style={{ fontWeight: 400 }}>{t("taskDetail.candidatesHint")}</span>
          </div>
          <div className="row" style={{ padding: 12, alignItems: "flex-start", gap: 12 }}>
            {(() => {
              const shot = shots.find((s) => s.index === openCands);
              if (!shot) return null;
              const cands = shot.candidates ?? [];
              return cands.length > 0 ? (
                <>
                  {cands.map((c) => (
                    <div key={c.key} className={`shot ${c.is_default ? "selected" : ""}`} style={{ width: 180, flex: "none" }}>
                      <span className="frame">
                        {candidateImg(c.key) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={candidateImg(c.key) ?? ""}
                            alt={`candidate ${openCands}`}
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                        <span className="tag">{c.is_default ? "✓" : c.key.slice(-4)}</span>
                      </span>
                      <div className="cap">{c.is_default ? t("taskDetail.candidateSelected") : ""}</div>
                      {!c.is_default ? (
                        <div className="ops">
                          <button type="button" className="btn-text" onClick={() => void onSelectCandidate(shot.index, c.key)}>
                            {t("taskDetail.btnSelect")}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </>
              ) : (
                <span className="small faint">{t("taskDetail.candidatesTitle", { n: pad(openCands) })} — 暂无候选</span>
              );
            })()}
            <div style={{ alignSelf: "center" }}>
              <label className="btn-text" style={{ cursor: "pointer" }}>
                + Reference image 参考图
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onUploadRef(openCands, f);
                    e.target.value = "";
                  }}
                />
              </label>
              <div className="small faint" style={{ marginTop: 4 }}>
                {t("taskDetail.uploadRefGuide")}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
