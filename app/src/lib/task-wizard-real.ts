/**
 * TaskWizard real 模式数据层（PIPELINE_TASK_15 阶段③）：
 * 加载 GET /api/tasks/:id + running 轮询，把后端任务详情派生成页面六阶段所需的
 * statuses/shots/pausedStep 等；节点编辑/重生成/候选选择/导出全部调真实端点。
 * demo 模式页面回落 task-wizard-mock.ts 的 mock 状态机。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDemo } from '@/lib/demo'
import type { Track } from '@/lib/demo'
import { API_BASE, get, post, put } from '@/lib/api'
import type { TaskAsset, TaskDetail } from '@/lib/types'
import type { GenMode, StepStatus } from '@/components/badges'
import type { MotionKind, Shot, StepKey, TaskStatus, RunMode } from '@/lib/task-wizard-mock'
import { STEP_ORDER } from '@/lib/task-wizard-mock'

/* ---------- 后端 step(1-10) ↔ 前端 L1-L10 ---------- */

export function stepToKey(n: number): StepKey {
  return (STEP_ORDER[n - 1] as StepKey) ?? ('L' + n)
}

// 前端 StepKey → 后端内部逻辑步号（1-10，无 5=i2v 已下线）。
// ⚠️ 不能用 STEP_ORDER.indexOf —— L1.5 占位会让 L7+ 全部错位 +1（如 L7→8 被后端
// "from_step 未产出" 422 拒绝）；必须用显式映射（与后端 INTERNAL_TO_KEY 对齐）。
const KEY_TO_INTERNAL: Record<StepKey, number> = {
  L1: 1, 'L1.5': 1, L2: 2, L3: 3, L4: 4, L5: 5, L6: 6, L7: 7, L8: 8, L9: 9, L10: 10,
}
export function keyToStep(k: StepKey): number {
  return KEY_TO_INTERNAL[k]
}

/* ---------- candidate_id：cand_sha1(minio_key)[0:8]（后端 candidateId() 同式） ---------- */

export async function candidateIdOf(key: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(key))
    const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
    return `cand_${hex.slice(0, 8)}`
  } catch {
    // crypto.subtle 不可用（非安全上下文）→ 用简单 hash 兜底，仅影响候选选中
    let h = 0
    for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) >>> 0
    return `cand_${h.toString(16).padStart(8, '0')}`
  }
}

/** 外部 http(s) key 直接用；minio key → 后端资产流式 URL（含 /api 前缀）。 */
function assetUrl(taskId: string, type: string, key: string): string {
  if (/^https?:\/\//i.test(key)) return key
  const basename = String(key).split('/').pop() || key
  return `${API_BASE}/tasks/${taskId}/assets/${type}/${basename}`
}

/* ---------- storyboard（后端 NormalizedShot）→ 页面 Shot ---------- */

export interface RealCandidate {
  id: string
  src: string
  label: string
  selected: boolean
  /** 展示滤镜（后端候选无此概念；留空兼容 mock Candidate 渲染）。 */
  filter?: string
}

interface SbShot {
  index: number
  duration: number
  scene: string
  script: string
  voiceover: string
  subtitle: string
  prompt: string
  title: string
  aspect: string
  motion: string
  ref_key: string | null
  candidates: { key: string; is_default?: boolean }[]
  clip_candidates: { key: string; is_default?: boolean }[]
}

const MOTION_KINDS: MotionKind[] = ['push-in', 'pan', 'orbit', 'static']

export function storyboardToShots(taskId: string, sb: unknown, assets: TaskAsset[]): Shot[] {
  const storyboard = (sb ?? null) as { shots?: SbShot[] } | null
  if (!storyboard || !Array.isArray(storyboard.shots)) return []
  const assetByTypeIndex = new Map<string, TaskAsset>()
  for (const a of assets) assetByTypeIndex.set(`${a.type}:${a.index}`, a)

  return storyboard.shots.map((s) => {
    const idx = Number(s.index)
    const dur = Math.max(1, Number(s.duration) || 5)
    const def = s.candidates?.find((c) => c.is_default)?.key
    const shotAsset = assetByTypeIndex.get(`shot:${idx}`)
    const imageKey = def ?? shotAsset?.url ?? `shots/shot-${String(idx).padStart(2, '0')}.png`
    const altKey = s.candidates?.find((c) => !c.is_default)?.key
    const audioAsset = assetByTypeIndex.get(`audio:${idx}`)
    const motion = MOTION_KINDS.includes(s.motion as MotionKind) ? (s.motion as MotionKind) : 'static'
    // L5 clip 视频：assets type=clip（key clip-NN）→ 映射到对应镜头
    const clips = assets
      .filter((a) => a.type === 'clip')
      .map((a) => ({ m: /clip-(\d+)/.exec(a.url || ''), url: a.url }))
      .filter((x): x is { m: RegExpExecArray; url: string } => x.m !== null)
      .filter((x) => Number(x.m[1]) === idx)
      .map((x, i) => ({
        id: `c${i + 1}`,
        label: `clip ${String.fromCharCode(65 + i)}`,
        videoUrl: assetUrl(taskId, 'clip', x.url),
      }))
    return {
      index: idx,
      title: String(s.title || `镜头 ${idx}`),
      duration: `${dur}s`,
      scene: String(s.scene || ''),
      script: String(s.script || ''),
      voiceover: String(s.voiceover || s.script || ''),
      subtitle: String(s.subtitle || s.script || ''),
      prompt: String(s.prompt || ''),
      aspect: String(s.aspect || '9:16'),
      motion,
      image: assetUrl(taskId, 'shot', imageKey),
      alt: altKey ? assetUrl(taskId, 'shot', altKey) : undefined,
      voDuration: `0:0${Math.min(9, Math.max(2, Math.round(dur) - 1))}`,
      voUrl: audioAsset ? assetUrl(taskId, 'audio', audioAsset.url) : undefined,
      clips,
    }
  })
}

/** 每镜候选（L4 候选图）：后端 candidates + 当前 canonical 图合成展示列表。 */
export function realShotCandidates(taskId: string, shot: Shot): RealCandidate[] {
  void taskId
  const out: RealCandidate[] = [{ id: 'base', src: shot.image, label: '原图', selected: true }]
  if (shot.alt) out.push({ id: 'alt', src: shot.alt, label: 'alt 角度', selected: false })
  return out
}

/** 由 shots 组装 SRT 文本（PUT /node subtitle 用；后端按时间轴切分）。 */
export function buildSrtFromShots(shots: Shot[]): string {
  let t = 0
  const lines: string[] = []
  shots.forEach((s, i) => {
    const dur = Number.parseFloat(s.duration) || 5
    const from = t
    t += dur
    const fmt = (sec: number) => {
      const h = Math.floor(sec / 3600)
      const m = Math.floor((sec % 3600) / 60)
      const s0 = Math.floor(sec % 60)
      const ms = Math.floor((sec % 1) * 1000)
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s0).padStart(2, '0')},${String(ms).padStart(3, '0')}`
    }
    lines.push(
      `${i + 1}`,
      `${fmt(from)} --> ${fmt(t)}`,
      String(s.subtitle || s.script || ''),
      '',
    )
  })
  return lines.join('\n')
}

/* ---------- 详情派生成页面状态 ---------- */

/**
 * 后端 6 展示节点 → 前端逻辑步（PIPELINE_TASK_41 收敛）。
 * 与 api/src/routes/tasks.ts DISPLAY_NODES 对齐；node.steps 为内部逻辑步号。
 * ⚠️ 不能再用 STEP_ORDER[n-1] 索引映射——后端 steps[].step 是节点号 1-6，
 * 旧映射会把合成导出(6)错标成 L5(图生视频)，导致 L8/L9/L10 永远 queued。
 */
const NODE_TO_KEYS: Record<number, StepKey[]> = {
  1: ['L1', 'L1.5', 'L2'], // 文案
  2: ['L3'], // 分镜拆解
  3: ['L4'], // 逐镜生图
  4: ['L6'], // 配音
  5: ['L7'], // 字幕
  6: ['L8', 'L9', 'L10'], // 合成导出
}

export function deriveStatuses(detail: TaskDetail): Record<StepKey, StepStatus> {
  const s = {} as Record<StepKey, StepStatus>
  STEP_ORDER.forEach((k) => {
    s[k] = 'queued'
  })
  for (const st of detail.steps) {
    const node = Number(st.step)
    const keys = NODE_TO_KEYS[node]
    if (!keys) continue
    for (const k of keys) {
      // 合规预审（L1.5）仅托管档有 kind 标记；BYOK 档直接跳过。
      if (k === 'L1.5') {
        s[k] = detail.track === 'byok' ? 'skipped' : st.kind === 'compliance_precheck' ? (st.status as StepStatus) : 'queued'
        continue
      }
      s[k] = st.status as StepStatus
    }
  }
  if (detail.mode === 'static') s.L5 = 'skipped'
  return s
}

export function deriveStaleSteps(detail: TaskDetail): Set<StepKey> {
  const n = new Set<StepKey>()
  for (const st of detail.steps) {
    if (!st.stale) continue
    const keys = NODE_TO_KEYS[Number(st.step)]
    if (keys) keys.forEach((k) => n.add(k))
  }
  return n
}

/** 内部逻辑步号 → StepKey（与 DISPLAY_NODES node.steps 对齐；无 5=i2v 已下线）。 */
const INTERNAL_TO_KEY: Record<number, StepKey> = {
  1: 'L1', 2: 'L2', 3: 'L3', 4: 'L4', 6: 'L6', 7: 'L7', 8: 'L8', 9: 'L9', 10: 'L10',
}

export function derivePaused(detail: TaskDetail): { step: StepKey | null; kind: string | null; initial: boolean } {
  const config = (detail.config ?? {}) as Record<string, unknown>
  if (config.paused !== true) return { step: null, kind: null, initial: false }
  const kind = String(config.pause_kind ?? 'semi')
  const resumeStep = Number(config.pause_resume_step ?? 0)
  if (kind === 'initial') return { step: null, kind, initial: true }
  if (kind === 'review_gate') return { step: 'L8', kind, initial: false }
  if (kind === 'compliance_review') return { step: 'L1.5', kind, initial: false }
  if (resumeStep > 1) return { step: INTERNAL_TO_KEY[resumeStep - 1] ?? 'L1', kind, initial: false }
  return { step: INTERNAL_TO_KEY[resumeStep] ?? 'L1', kind, initial: false }
}

/** L2 文案版本（config.script_versions → 页面 ScriptVersion 形态）。 */
export interface RealScriptVersion {
  id: string
  name: string
  current?: boolean
  body: string
}

export function scriptVersionsOf(detail: TaskDetail): RealScriptVersion[] {
  const config = (detail.config ?? {}) as Record<string, unknown>
  const versions = config.script_versions as
    | Array<{ version_id: string; note?: string | null; selected?: boolean; text: string; created_at?: string }>
    | undefined
  if (!Array.isArray(versions)) return []
  return versions.map((v) => ({
    id: v.version_id,
    name: v.note || v.version_id,
    current: v.selected === true,
    body: v.text,
  }))
}

/** 当前文案正文：选中的 script_version → L2 payload script_paragraphs → config.prompts.script。 */
export function currentScriptOf(detail: TaskDetail): string {
  const config = (detail.config ?? {}) as Record<string, unknown>
  const versions = scriptVersionsOf(detail)
  const sel = versions.find((v) => v.current)
  if (sel) return sel.body
  const l2 = detail.steps.find((s) => Number(s.step) === 2)
  if (l2?.payload) {
    const payload = l2.payload as { kind?: string; script_paragraphs?: string[]; hook?: string; cta?: string }
    if (Array.isArray(payload.script_paragraphs) && payload.script_paragraphs.length > 0) {
      return [`# ${payload.hook || '视频文案'}`, '', ...payload.script_paragraphs.map((p, i) => `### 段落 ${i + 1}\n\n${p}`)].join('\n')
    }
  }
  const prompts = (config.prompts ?? {}) as Record<string, unknown>
  return String(prompts.script ?? config.custom_prompt ?? '')
}

/** L9 复检报告（step 9 payload）。 */
export function l9ReportOf(detail: TaskDetail): { passed: boolean; issues: string[]; summary: string } {
  const l9 = detail.steps.find((s) => Number(s.step) === 9)
  const payload = (l9?.payload ?? {}) as Record<string, unknown>
  const passed = payload.passed === true
  const issues = Array.isArray(payload.issues)
    ? payload.issues.map((x) => {
        const o = (typeof x === 'object' && x !== null ? x : {}) as Record<string, unknown>
        const ref = o.step_ref ? `[${String(o.step_ref)}] ` : ''
        const detail = String(o.detail || '')
        const suggestion = o.suggestion ? ` · 建议：${String(o.suggestion)}` : ''
        return `${ref}${detail}${suggestion}`
      })
    : []
  return { passed, issues, summary: String(payload.summary ?? '') }
}

/* ---------- useTaskWizardReal：加载 + 轮询 + 动作 ---------- */

export interface TaskWizardReal {
  detail: TaskDetail | null
  loading: boolean
  error: string | null
  reload: () => void
  polling: boolean
  setPolling: (v: boolean) => void
  /** 每次成功详情轮询递增；用于让已失败的同 URL 缩略图重新请求。 */
  imageRefreshToken: number
  taskStatus: TaskStatus
  mode: GenMode
  runMode: RunMode
  track: Track
  statuses: Record<StepKey, StepStatus>
  staleSteps: Set<StepKey>
  shots: Shot[]
  /** L4 候选图（id=minio_key，可直接用于 op=select）。 */
  candidateList: (shotIndex: number) => RealCandidate[]
  /** S1 文案版本列表（config.script_versions 归一化）。 */
  scriptVersions: RealScriptVersion[]
  /** 当前选中版本的文案正文（无版本时回退 L2 payload / config.prompts.script）。 */
  currentScript: string
  /** L9 复检报告（step 9 payload）。 */
  l9Report: { passed: boolean; issues: string[]; summary: string }
  /** 已降级步骤号（payload.degraded === true），升序，如 [3]。 */
  degradedSteps: number[]
  /** L8 合成完成（成片已出）态。 */
  composed: boolean
  pausedStep: StepKey | null
  pausedInitial: boolean
  gateOpen: boolean
  freeReruns: number
  exportExpired: boolean
  /** L10 zip 下载地址（原生 <a download>，勿 fetch blob）。 */
  exportUrl: string | null
  exportExpiresAt: string | null
  // 动作（返回 null 表示失败；页面据此 toast）
  runApi: <T = unknown>(fn: () => Promise<T>) => Promise<T | null>
  continueTask: () => Promise<boolean>
  cancelTask: () => Promise<boolean>
  setRunMode: (m: RunMode) => Promise<boolean>
  saveScriptVersion: (text: string, note?: string) => Promise<unknown>
  selectScriptVersion: (versionId: string) => Promise<unknown>
  regenerateScript: (instruction?: string) => Promise<unknown>
  rerunFrom: (from: StepKey) => Promise<unknown>
  regenerateStoryboard: () => Promise<unknown>
  shotRerun: (index: number, step: 'L4' | 'L5' | 'L6') => Promise<unknown>
  selectCandidate: (shotIndex: number, candidateKey: string) => Promise<unknown>
  saveStoryboardShots: (patch: Partial<Shot>[], shotIndex?: number) => Promise<unknown>
  saveVoiceover: (index: number, text: string) => Promise<unknown>
  saveSubtitle: (index: number, text: string) => Promise<unknown>
  updateSubtitleSettings: (patch: { chars_per_line?: number; font_size?: number; position?: string }) => Promise<unknown>
}

export function useTaskWizardReal(taskId: string | undefined, enabled: boolean): TaskWizardReal {
  const { mode } = useDemo()
  const real = enabled && mode === 'real' && !!taskId
  const [detail, setDetail] = useState<TaskDetail | null>(null)
  const [loading, setLoading] = useState(real)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const [detailRefreshToken, setDetailRefreshToken] = useState(0)
  const idRef = useRef(taskId)
  idRef.current = taskId

  // 任务 done 后轮询停止（running=false）→ 最后补一次详情刷新：bump 一次
  // imageRefreshToken，让 ShotThumb 带新时间戳强制重载（done 前图可能已生成
  // 但缩略图停留在 404 占位态）。幂等：done 不会变回 running。
  const doneRef = useRef(false)
  useEffect(() => {
    if (detail?.status === 'done' && !doneRef.current) {
      doneRef.current = true
      setTick((t) => t + 1)
    }
  }, [detail?.status])

  const reload = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    if (!real) {
      setDetail(null)
      setError(null)
      setLoading(false)
      return
    }
    let cancelled = false
    // 轮询期间已有详情则不闪 loading：每次 fetch 都 setLoading(true) 会让页面
    // 每 2.5s 整体切换成「正在加载任务详情…」造成闪烁。仅首次加载/详情丢失
    // （detail 为 null）时才显示加载态；状态无变化时 L317 的引用比较保持页面稳定。
    if (detail === null) setLoading(true)
    setError(null)
    get<TaskDetail>(`/tasks/${idRef.current}`)
      .then((d) => {
        if (cancelled) return
        // 内容未变（如 paused 期间偶发刷新）→ 保持旧引用，避免整树重渲染闪烁。
        setDetail((prev) => (prev && JSON.stringify(prev) === JSON.stringify(d) ? prev : d))
        setDetailRefreshToken((token) => token + 1)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        // 非 UUID / 不存在 → 友好提示（mock 任务 id 或误删任务）
        const err = e as { status?: number; message?: string }
        const friendly =
          err?.status === 404 || err?.status === 422
            ? '任务不存在或已删除'
            : err instanceof Error
              ? err.message
              : String(e)
        setError(friendly)
        setDetail(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [real, tick])

  // paused 任务（等待开始/暂停确认）内容不会自己变，不轮询；运行中才轮询。
  const cfg = (detail?.config ?? {}) as Record<string, unknown>
  const paused = cfg.paused === true
  const running = detail && !paused && (detail.status === 'running' || detail.status === 'queued')
  const [polling, setPolling] = useState(true)
  useEffect(() => {
    if (!real || !running || !polling) return
    const t = setTimeout(() => setTick((x) => x + 1), 2500)
    return () => clearTimeout(t)
  }, [real, running, polling, tick])

  /** 统一跑 API 动作：成功后 reload；失败返回 null（页面 toast）。 */
  const runApi = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | null> => {
      if (!real || !taskId) return null
      try {
        const res = await fn()
        setTick((x) => x + 1)
        return res
      } catch (e) {
        return null
      }
    },
    [real, taskId],
  )

  /* ---------- 派生成页面状态 ---------- */
  const derived = detail
    ? {
        taskStatus: detail.status as TaskStatus,
        mode: detail.mode as GenMode,
        runMode: detail.run_mode as RunMode,
        track: detail.track as Track,
        statuses: deriveStatuses(detail),
        staleSteps: deriveStaleSteps(detail),
        shots: storyboardToShots(detail.id, detail.storyboard, detail.assets),
        paused: derivePaused(detail),
        gateOpen: ((detail.config ?? {}) as Record<string, unknown>).review_gate !== false,
        freeReruns: detail.credits?.reruns_free ?? 2,
        exportExpired: detail.export === null && (detail.status === 'done' || detail.status === 'cancelled'),
      }
    : null

  /** 每镜候选列表（L4，id=minio_key，选中走 op=select 需回传 key）。 */
  const candidatesByShot = useMemo(() => {
    const map = new Map<number, RealCandidate[]>()
    const sb = (detail?.storyboard ?? null) as { shots?: SbShot[] } | null
    if (detail && sb && Array.isArray(sb.shots)) {
      for (const s of sb.shots) {
        const idx = Number(s.index)
        const list = (s.candidates ?? []).map((c, i) => ({
          id: c.key,
          src: assetUrl(detail.id, 'shot', c.key),
          label: c.is_default ? '当前图' : `候选 ${i + 1}`,
          selected: c.is_default === true,
        }))
        if (list.length > 0) map.set(idx, list)
      }
    }
    return map
  }, [detail])

  const candidateList = useCallback(
    (shotIndex: number): RealCandidate[] => candidatesByShot.get(shotIndex) ?? [],
    [candidatesByShot],
  )

  /* ---------- 动作封装 ---------- */
  const continueTask = useCallback(async () => {
    const res = await runApi(() => post(`/tasks/${taskId}/continue`, { action: 'continue' }))
    return res !== null
  }, [runApi, taskId])

  const setRunMode = useCallback(
    async (m: RunMode) => {
      const res = await runApi(() => post(`/tasks/${taskId}/run-mode`, { run_mode: m }))
      if (res !== null) {
        // semi→auto 自动放行 → 恢复轮询并立即刷新详情
        setPolling(true)
        reload()
        return true
      }
      return false
    },
    [runApi, taskId, reload],
  )

  const cancelTask = useCallback(async () => {
    const res = await runApi(() => post(`/tasks/${taskId}/continue`, { action: 'cancel' }))
    return res !== null
  }, [runApi, taskId])

  const saveScriptVersion = useCallback(
    (text: string, note?: string) => {
      return runApi(() => post(`/tasks/${taskId}/script/versions`, { op: 'save', text, note: note ?? null }))
    },
    [runApi, taskId],
  )

  const selectScriptVersion = useCallback(
    (versionId: string) => {
      return runApi(() => post(`/tasks/${taskId}/script/versions`, { op: 'select', version_id: versionId }))
    },
    [runApi, taskId],
  )

  const regenerateScript = useCallback(
    (instruction?: string) => {
      return runApi(() => post(`/tasks/${taskId}/script/regenerate`, { instruction: instruction ?? null }))
    },
    [runApi, taskId],
  )

  const rerunFrom = useCallback(
    (from: StepKey) => {
      return runApi(() => post(`/tasks/${taskId}/rerun`, { from_step: keyToStep(from) }))
    },
    [runApi, taskId],
  )

  const regenerateStoryboard = useCallback(() => {
    return runApi(() => post(`/tasks/${taskId}/storyboard/regenerate`, {}))
  }, [runApi, taskId])

  const shotRerun = useCallback(
    (index: number, step: 'L4' | 'L5' | 'L6') => {
      if (step === 'L4') {
        return runApi(() => post(`/tasks/${taskId}/shots/${index}/regenerate`, {}))
      }
      if (step === 'L5') {
        return runApi(() => post(`/tasks/${taskId}/clips/${index}/regenerate`, {}))
      }
      return runApi(() => post(`/tasks/${taskId}/voice/regenerate`, { index }))
    },
    [runApi, taskId],
  )

  const selectCandidate = useCallback(
    async (shotIndex: number, candidateKey: string) => {
      const candidateId = await candidateIdOf(candidateKey)
      return runApi(() =>
        post(`/tasks/${taskId}/shots/${shotIndex}/candidates`, { op: 'select', candidate_id: candidateId }),
      )
    },
    [runApi, taskId],
  )

  const saveStoryboardShots = useCallback(
    (patch: Partial<Shot>[], _shotIndex?: number) => {
      const shotsPayload = patch.map((p) => ({
        index: p.index,
        title: p.title,
        duration: p.duration,
        scene: p.scene,
        script: p.script,
        voiceover: p.voiceover,
        subtitle: p.subtitle,
        prompt: p.prompt,
        motion: p.motion,
        aspect: p.aspect,
      }))
      return runApi(() => put(`/tasks/${taskId}/node`, { node: 'storyboard', payload: { shots: shotsPayload } }))
    },
    [runApi, taskId],
  )

  const saveVoiceover = useCallback(
    (index: number, text: string) => {
      return runApi(() => put(`/tasks/${taskId}/node`, { node: 'voice', payload: { index, voiceover: text } }))
    },
    [runApi, taskId],
  )

  const saveSubtitle = useCallback(
    (index: number, text: string) => {
      const shots = (derived?.shots ?? []).map((s) => (s.index === index ? { ...s, subtitle: text } : s))
      const srt = buildSrtFromShots(shots)
      return runApi(() => put(`/tasks/${taskId}/node`, { node: 'subtitle', payload: { srt_text: srt } }))
    },
    [runApi, taskId, derived?.shots],
  )

  const updateSubtitleSettings = useCallback(
    (patch: { chars_per_line?: number; font_size?: number; position?: string }) => {
      return runApi(() => post(`/tasks/${taskId}/subtitle-settings`, patch))
    },
    [runApi, taskId],
  )

  return {
    detail,
    loading,
    error,
    reload,
    polling,
    setPolling,
    imageRefreshToken: detailRefreshToken,
    taskStatus: derived?.taskStatus ?? 'queued',
    mode: derived?.mode ?? 'i2v',
    runMode: derived?.runMode ?? 'semi',
    track: derived?.track ?? 'managed',
    statuses: derived?.statuses ?? ({} as Record<StepKey, StepStatus>),
    staleSteps: derived?.staleSteps ?? new Set<StepKey>(),
    shots: derived?.shots ?? [],
    candidateList,
    scriptVersions: detail ? scriptVersionsOf(detail) : [],
    currentScript: detail ? currentScriptOf(detail) : '',
    l9Report: detail ? l9ReportOf(detail) : { passed: false, issues: [], summary: '' },
    degradedSteps: detail
      ? detail.steps
          .filter((s) => s.payload?.degraded === true)
          .map((s) => Number(s.step))
          .sort((a, b) => a - b)
      : [],
    composed: (derived?.statuses.L8 ?? 'queued') === 'done',
    pausedStep: derived?.paused.step ?? null,
    pausedInitial: derived?.paused.initial ?? false,
    gateOpen: derived?.gateOpen ?? true,
    freeReruns: derived?.freeReruns ?? 2,
    exportExpired: derived?.exportExpired ?? false,
    exportUrl: detail?.export?.export_id ? `${API_BASE}/export/${detail.export.export_id}` : null,
    exportExpiresAt: detail?.export?.expires_at ?? null,
    runApi,
    continueTask,
    cancelTask,
    setRunMode,
    saveScriptVersion,
    selectScriptVersion,
    regenerateScript,
    rerunFrom,
    regenerateStoryboard,
    shotRerun,
    selectCandidate,
    saveStoryboardShots,
    saveVoiceover,
    saveSubtitle,
    updateSubtitleSettings,
  }
}
