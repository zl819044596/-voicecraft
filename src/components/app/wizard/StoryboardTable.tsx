"use client";

// StoryboardTable — Batch B4 ② 分镜的 7 列表格（原型 task-detail.html
// 153-203：# / Shot 镜头 / 时长 / Scene·image prompt / Voiceover / Status /
// 操作）。含 inline 编辑（title / duration / scene / voiceover）、Regen shot、
// stale+重跑提示；点行首「编辑」展开完整编辑（prompt / aspect / motion /
// subtitle / script / 删镜），保留现有分镜编辑能力。
// 样式走 app-studio.css `.tbl`（36px 行高、1px 分隔）。

import { useState } from "react";
import type { TFunc } from "@/i18n";

export type StoryboardRowShot = {
  index: number;
  duration: number;
  scene: string;
  script: string;
  voiceover: string;
  subtitle: string;
  prompt: string;
  title: string;
  aspect: string;
  motion: string;
};

export const SHOT_ASPECTS = ["1:1", "16:9", "9:16", "4:3", "3:4"];

export function StoryboardTable({
  shots,
  onPatchShot,
  onAddShot,
  onDeleteShot,
  onRegenShot,
  onRerunShot,
  shotStatus,
  hasAsset,
  canDelete,
  t,
}: {
  shots: StoryboardRowShot[];
  onPatchShot: (index: number, patch: Partial<StoryboardRowShot>) => void;
  onAddShot: () => void;
  onDeleteShot: (index: number) => void;
  onRegenShot: (index: number) => void;
  onRerunShot: (index: number) => void;
  /** 返回该镜状态：'done' | 'stale' */
  shotStatus: (index: number) => "done" | "stale" | "pending";
  hasAsset: (index: number) => boolean;
  canDelete: boolean;
  t: TFunc;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const pad = (n: number) => String(n).padStart(2, "0");

  const inputCell =
    "w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-[11.5px] text-text-secondary outline-none transition focus:border-border focus:bg-bg";

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="tbl" style={{ minWidth: 860 }}>
          <thead>
            <tr>
              <th style={{ width: 34 }}>{t("taskDetail.colNum")}</th>
              <th style={{ width: "18%" }}>{t("taskDetail.colShot")}</th>
              <th style={{ width: 52 }}>{t("taskDetail.colDuration")}</th>
              <th>{t("taskDetail.colScene")}</th>
              <th style={{ width: "20%" }}>{t("taskDetail.colVoiceover")}</th>
              <th style={{ width: 100 }}>{t("taskDetail.colStatus")}</th>
              <th style={{ width: 150 }}>{t("taskDetail.colOps")}</th>
            </tr>
          </thead>
          <tbody>
            {shots.map((shot) => {
              const st = shotStatus(shot.index);
              const isExpanded = expanded === shot.index;
              return [
                <tr key={`r${shot.index}`}>
                  <td className="muted">{pad(shot.index)}</td>
                  <td>
                    <input
                      value={shot.title}
                      onChange={(e) => onPatchShot(shot.index, { title: e.target.value })}
                      className={inputCell}
                      placeholder={t("pipeline.shotTitlePlaceholder")}
                    />
                    {hasAsset(shot.index) ? <span className="text-success" title="image ready"> ●</span> : null}
                  </td>
                  <td className="muted">
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={shot.duration}
                      onChange={(e) => onPatchShot(shot.index, { duration: Number(e.target.value) || 5 })}
                      className={`${inputCell} w-12`}
                      title={t("pipeline.shotDuration")}
                    />
                    s
                  </td>
                  <td>
                    <input
                      value={shot.scene}
                      onChange={(e) => onPatchShot(shot.index, { scene: e.target.value })}
                      className={inputCell}
                      placeholder={t("pipeline.sceneDescription")}
                    />
                  </td>
                  <td>
                    <input
                      value={shot.voiceover}
                      onChange={(e) => onPatchShot(shot.index, { voiceover: e.target.value })}
                      className={inputCell}
                      placeholder={t("pipeline.shotVoiceover")}
                    />
                  </td>
                  <td>
                    {st === "stale" ? (
                      <>
                        <span className="st st-stale">{t("pipelineStatus.stale")}</span>
                        <span className="cell-sub">{t("taskDetail.cellSub")}</span>
                      </>
                    ) : st === "done" ? (
                      <span className="st st-done">{t("pipelineStatus.done")}</span>
                    ) : (
                      <span className="st st-queued">{t("pipelineStatus.pending")}</span>
                    )}
                  </td>
                  <td>
                    <div className="flex items-center gap-3">
                      {st === "stale" ? (
                        <button type="button" className="btn-text accent" onClick={() => onRerunShot(shot.index)}>
                          {t("taskDetail.btnRerunFromL4")}
                        </button>
                      ) : (
                        <button type="button" className="btn-text" onClick={() => onRegenShot(shot.index)}>
                          {t("taskDetail.btnRegen")}
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-text"
                        onClick={() => setExpanded(isExpanded ? null : shot.index)}
                      >
                        {isExpanded ? t("taskDetail.btnCollapse") : t("taskDetail.btnEdit")}
                      </button>
                    </div>
                  </td>
                </tr>,
                isExpanded ? (
                  <tr key={`d${shot.index}`}>
                    <td colSpan={7} style={{ background: "var(--bg)" }}>
                      <div className="g3" style={{ padding: "10px 4px" }}>
                        <label className="field">
                          <span style={{ fontSize: 10, color: "var(--faint)" }}>{t("pipeline.shotPrompt")}</span>
                          <textarea
                            rows={3}
                            value={shot.prompt}
                            onChange={(e) => onPatchShot(shot.index, { prompt: e.target.value })}
                            className="input"
                            style={{ minHeight: 72 }}
                          />
                        </label>
                        <div>
                          <label className="field">
                            <span style={{ fontSize: 10, color: "var(--faint)" }}>{t("pipeline.shotScript")}</span>
                            <textarea
                              rows={3}
                              value={shot.script}
                              onChange={(e) => onPatchShot(shot.index, { script: e.target.value })}
                              className="input"
                              style={{ minHeight: 72 }}
                            />
                          </label>
                          <div className="row" style={{ marginTop: 8 }}>
                            <span className="small faint">{t("pipeline.shotAspect")}</span>
                            <select
                              value={shot.aspect}
                              onChange={(e) => onPatchShot(shot.index, { aspect: e.target.value })}
                              className="input"
                              style={{ height: 28, width: 110 }}
                            >
                              {SHOT_ASPECTS.map((a) => (
                                <option key={a} value={a}>{a}</option>
                              ))}
                            </select>
                            <span className="small faint">{t("pipeline.shotDuration")}</span>
                            <input
                              type="number"
                              min={1}
                              max={60}
                              value={shot.duration}
                              onChange={(e) => onPatchShot(shot.index, { duration: Number(e.target.value) || 5 })}
                              className="input"
                              style={{ height: 28, width: 70 }}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="field">
                            <span style={{ fontSize: 10, color: "var(--faint)" }}>{t("pipeline.shotMotion")}</span>
                            <textarea
                              rows={3}
                              value={shot.motion}
                              onChange={(e) => onPatchShot(shot.index, { motion: e.target.value })}
                              className="input"
                              style={{ minHeight: 72 }}
                            />
                          </label>
                          <label className="field">
                            <span style={{ fontSize: 10, color: "var(--faint)" }}>{t("pipeline.shotSubtitle")}</span>
                            <textarea
                              rows={2}
                              value={shot.subtitle}
                              onChange={(e) => onPatchShot(shot.index, { subtitle: e.target.value })}
                              className="input"
                              style={{ minHeight: 40 }}
                            />
                          </label>
                        </div>
                      </div>
                      <div className="row" style={{ paddingBottom: 8 }}>
                        <button
                          type="button"
                          className="btn-text danger"
                          disabled={!canDelete}
                          onClick={() => onDeleteShot(shot.index)}
                        >
                          {t("pipeline.deleteShot")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : null,
              ];
            })}
          </tbody>
        </table>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button type="button" className="btn-text" onClick={onAddShot}>
          {t("pipeline.addShot")}
        </button>
        <span className="spacer" />
        <span className="note">{t("taskDetail.noteStoryboard")}</span>
      </div>
    </div>
  );
}
