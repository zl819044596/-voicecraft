/**
 * /app/tasks/:id — 任务详情 · 六阶段向导（task-wizard.md 全页编排）。
 * 状态机：任务/单步状态、semi/auto、stale 出现与清除、单步重跑计次、复核门、导出 410。
 * - demo 模式：前端 mock runner（每逻辑步 1.2–2.4s 定时推进）。
 * - real 模式：GET /api/tasks/:id 加载 + running 轮询（useTaskWizardReal），
 *   节点编辑/重生成/候选选择/继续/取消/导出全部走真实端点。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { AnimatePresence, motion } from 'framer-motion'
import { Copy, Loader2, PauseCircle, Play } from 'lucide-react'
import { toast } from 'sonner'
import { useDemo } from '@/lib/demo'
import { API_BASE } from '@/lib/api'
import type { GenMode, StepStatus } from '@/components/badges'
import {
  COMPOSE_PHASES,
  INITIAL_SHOTS,
  INITIAL_STATUS,
  STAGES,
  STEP_DURATION,
  STEP_META,
  STEP_ORDER,
  TASK,
  TASK_CONFIG_JSON,
} from '@/lib/task-wizard-mock'
import type { RunMode, Shot, StepKey, TaskStatus } from '@/lib/task-wizard-mock'
import { rerunCost } from '@/lib/task-wizard-mock'
import { useTaskWizardReal } from '@/lib/task-wizard-real'
import HeaderBar from '@/components/task-wizard/HeaderBar'
import StepRail from '@/components/task-wizard/StepRail'
import NodeCopy from '@/components/task-wizard/NodeCopy'
import NodeStoryboard from '@/components/task-wizard/NodeStoryboard'
import NodeVisual from '@/components/task-wizard/NodeVisual'
import NodeAudio from '@/components/task-wizard/NodeAudio'
import NodeSubtitle from '@/components/task-wizard/NodeSubtitle'
import NodeCompose from '@/components/task-wizard/NodeCompose'
import NodeDeliver from '@/components/task-wizard/NodeDeliver'
import { AmberBar, Modal402 } from '@/components/task-wizard/shared'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

type ShotStep = 'L4' | 'L5' | 'L6'
const EMPTY_SHOT_SETS: Record<ShotStep, Set<number>> = { L4: new Set(), L5: new Set(), L6: new Set() }
/** 合法 UUID（后端 isUuid 校验同款）——非 UUID 的 demo 链接强制走 mock 状态机，避免 422 红字报错 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function addTo(set: Set<number>, v: number): Set<number> {
  const n = new Set(set)
  n.add(v)
  return n
}
function removeFrom(set: Set<number>, v: number): Set<number> {
  const n = new Set(set)
  n.delete(v)
  return n
}

/** semi 暂停条的产物摘要（task-wizard.md §3） */
const PAUSE_SUMMARY: Partial<Record<StepKey, string>> = {
  L1: '选题解析完成',
  'L1.5': '合规预审 passed',
  L2: '文案 v3 已生成',
  L3: '8 镜 · 总时长 30s',
  L4: '8/8 镜头已出图',
  L6: '8/8 配音已生成',
  L7: '字幕已生成',
  L9: '复检 passed',
  L10: '导出 zip 已就绪 · 保留 30 天',
}

export default function TaskWizard() {
  const { id } = useParams()
  const { track, credits, setCredits, exportExpired, mode: demoMode } = useDemo()
  const real = demoMode === 'real' && !!id && UUID_RE.test(id)
  const realWizard = useTaskWizardReal(id, real)

  /* ---------- 核心状态机（demo mock runner） ---------- */
  // i2v(L5) 已下线（PIPELINE_TASK_42 阶段 C）→ 固定 static 模式，无模式切换 UI
  const [mode] = useState<GenMode>('static')
  const [runMode, setRunMode] = useState<RunMode>('semi')
  const [taskStatus, setTaskStatus] = useState<TaskStatus>('running')
  const [statuses, setStatuses] = useState<Record<StepKey, StepStatus>>(INITIAL_STATUS)
  const [staleSteps, setStaleSteps] = useState<Set<StepKey>>(new Set())
  const [staleShots, setStaleShots] = useState<Record<ShotStep, Set<number>>>(EMPTY_SHOT_SETS)
  const [shots, setShots] = useState<Shot[]>(INITIAL_SHOTS)
  const [shotBusy, setShotBusy] = useState<Set<number>>(new Set())
  const [flashIdx, setFlashIdx] = useState<number | null>(null)
  const [stage, setStage] = useState(3)
  const [freeReruns, setFreeReruns] = useState(TASK.freeRerunsInitial)
  const [plan, setPlan] = useState<StepKey[] | null>(['L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10'])
  const [pausedStep, setPausedStep] = useState<StepKey | null>(null)
  const [gateOpen, setGateOpen] = useState(true)
  const [composed, setComposed] = useState(false)
  const [composePhase, setComposePhase] = useState<number | null>(null)
  const [polling, setPolling] = useState(true)
  /* ---------- 弹层 / 演示开关 ---------- */
  const [rerunTarget, setRerunTarget] = useState<StepKey | null>(null)
  const [show402, setShow402] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [l15Violation, setL15Violation] = useState(false)
  const [l9State, setL9State] = useState<'passed' | 'feedback'>('passed')
  const [exportRegen, setExportRegen] = useState(false)
  const [exportRegenerated, setExportRegenerated] = useState(false)

  const editorRef = useRef<HTMLDivElement>(null)
  const busyRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())
  useEffect(() => {
    const timers = busyRef.current
    return () => timers.forEach(clearTimeout)
  }, [])

  /* ---------- 轨道/模式派生的有效单步状态：BYOK → L1.5 skipped；static → L5 skipped ---------- */
  const eff = useMemo(() => {
    if (real) return realWizard.statuses
    const s: Record<StepKey, StepStatus> = { ...statuses }
    if (track === 'byok') s['L1.5'] = 'skipped'
    if (mode === 'static') s.L5 = 'skipped'
    return s
  }, [real, realWizard.statuses, statuses, track, mode])

  const effMode = real ? realWizard.mode : mode
  const effRunMode = real ? realWizard.runMode : runMode
  const effTaskStatus = real ? realWizard.taskStatus : taskStatus
  const effShots = real ? realWizard.shots : shots
  const effFreeReruns = real ? realWizard.freeReruns : freeReruns
  const effTrack = real ? realWizard.track : track
  const effPausedStep = real ? realWizard.pausedStep : pausedStep
  const effGateOpen = real ? realWizard.gateOpen : gateOpen
  const effComposed = real ? realWizard.composed : composed
  const effComposePhase = real ? null : composePhase
  const effExportExpired = real ? realWizard.exportExpired : exportExpired && !exportRegenerated
  const effL15Violation = real ? realWizard.statuses['L1.5'] === 'failed' : l15Violation
  /* 失败步骤（failed 任务恢复入口）：statuses 中第一个 failed 的步骤。 */
  const effFailedStep = useMemo(() => {
    const f = STEP_ORDER.find((k) => eff[k] === 'failed')
    return f ?? null
  }, [eff])
  const effL9State = real ? (realWizard.l9Report.passed ? 'passed' : 'feedback') : l9State
  const effStaleSteps = real ? realWizard.staleSteps : staleSteps

  /* real 模式：单镜 stale → 由步级 stale 派生（L4/L5/L6 步 stale 则全镜 stale） */
  const realStaleShots = useMemo(() => {
    const n: Record<ShotStep, Set<number>> = { L4: new Set(), L5: new Set(), L6: new Set() }
    if (!real) return n
    const mark = (step: StepKey, key: ShotStep) => {
      if (realWizard.staleSteps.has(step)) effShots.forEach((x) => n[key].add(x.index))
    }
    mark('L4', 'L4')
    mark('L5', 'L5')
    mark('L6', 'L6')
    return n
  }, [real, realWizard.staleSteps, effShots])

  const effStaleShots = real ? realStaleShots : staleShots

  const skipRule = useCallback(
    (s: StepKey) => (s === 'L1.5' && effTrack === 'byok') || (s === 'L5' && effMode === 'static'),
    [effTrack, effMode],
  )

  /* ---------- mock runner：plan[0] 逐格推进（demo 模式） ----------
     所有状态迁移都在定时器回调内完成（react-hooks/set-state-in-effect） */
  useEffect(() => {
    if (real) return
    if (!plan || plan.length === 0 || pausedStep || taskStatus !== 'running' || !polling) return
    const step = plan[0]
    if (skipRule(step)) {
      // 轨道/模式切换后（BYOK / static），plan 中遗留的步直接跳过
      const t = setTimeout(() => setPlan((p) => (p ? p.slice(1) : p)), 0)
      return () => clearTimeout(t)
    }
    if (step === 'L8') {
      const t = setTimeout(() => {
        if (gateOpen && !composed) {
          setPausedStep('L8')
          return
        }
        // 复核门关闭（auto）：直接走合成模拟
        setStatuses((s) => ({ ...s, L8: 'running' }))
        setComposePhase(0)
      }, 0)
      return () => clearTimeout(t)
    }
    const t0 = setTimeout(() => {
      setStatuses((s) => (s[step] === 'running' ? s : { ...s, [step]: 'running' }))
    }, 0)
    const t = setTimeout(() => {
      setStatuses((s) => ({ ...s, [step]: 'done' }))
      setStaleSteps((prev) => {
        const n = new Set(prev)
        n.delete(step)
        return n
      })
      if (step === 'L4' || step === 'L5' || step === 'L6') {
        setStaleShots((prev) => ({ ...prev, [step]: new Set() }))
      }
      const rest = plan.slice(1)
      if (rest.length === 0) {
        setPlan(null)
        setTaskStatus('done')
        toast.success('任务完成 · L10 导出已就绪')
      } else {
        setPlan(rest)
        if (runMode === 'semi') setPausedStep(step)
      }
    }, STEP_DURATION[step])
    return () => {
      clearTimeout(t0)
      clearTimeout(t)
    }
  }, [real, plan, pausedStep, taskStatus, polling, gateOpen, composed, runMode, skipRule])

  /* ---------- real + paused initial（semi 等待开始）：默认停 L1 脚本页而非 stage 3 ---------- */
  useEffect(() => {
    if (real && realWizard.pausedInitial) setStage(1)
  }, [real, realWizard.pausedInitial])

  /* ---------- 合成阶段进度（demo 模式：混音 → 烧录字幕 → 拼接 → 导出 mp4） ---------- */
  useEffect(() => {
    if (real || composePhase === null) return
    const finishing = composePhase >= COMPOSE_PHASES.length
    const t = setTimeout(
      () => {
        if (finishing) {
          setStatuses((s) => ({ ...s, L8: 'done' }))
          setStaleSteps((prev) => {
            const n = new Set(prev)
            n.delete('L8')
            return n
          })
          setComposed(true)
          setComposePhase(null)
          setPausedStep(null)
          setPlan((p) => (p && p[0] === 'L8' ? p.slice(1) : p))
          toast.success('合成完成 · final.mp4 已生成')
        } else {
          setComposePhase((p) => (p === null ? null : p + 1))
        }
      },
      finishing ? 0 : 1000,
    )
    return () => clearTimeout(t)
  }, [real, composePhase])

  /* ---------- 重跑（计次 + 清洗下游，task-wizard.md §10） ---------- */
  const requestRerun = useCallback((from: StepKey) => setRerunTarget(from), [])

  const executeRerun = async (from: StepKey) => {
    setRerunTarget(null)
    if (real) {
      const ok = await realWizard.rerunFrom(from)
      if (ok !== null) toast.success(`已从 ${from} 开始重跑 · 下游产物已清洗`)
      else toast.error('重跑失败（任务运行中或积分不足）')
      return
    }
    if (track === 'managed') {
      if (freeReruns > 0) {
        setFreeReruns((n) => n - 1)
      } else {
        const cost = rerunCost(mode)
        if (credits < cost) {
          setShow402(true)
          return
        }
        setCredits(credits - cost)
        toast.warning(`rerun_${mode} −${cost} 💎`)
      }
    }
    const idx = STEP_ORDER.indexOf(from)
    const clean = STEP_ORDER.slice(idx)
    setStatuses((s) => {
      const n = { ...s }
      clean.forEach((k) => {
        if (n[k] !== 'cancelled') n[k] = 'queued'
      })
      return n
    })
    setStaleSteps((prev) => {
      const n = new Set(prev)
      clean.forEach((k) => n.delete(k))
      return n
    })
    setStaleShots((prev) => ({
      L4: idx <= STEP_ORDER.indexOf('L4') ? new Set() : prev.L4,
      L5: idx <= STEP_ORDER.indexOf('L5') ? new Set() : prev.L5,
      L6: idx <= STEP_ORDER.indexOf('L6') ? new Set() : prev.L6,
    }))
    if (idx <= STEP_ORDER.indexOf('L8')) {
      setComposed(false)
      setComposePhase(null)
    }
    setPausedStep(null)
    setTaskStatus('running')
    setPlan(clean.filter((s) => !skipRule(s)))
    const st = STAGES.find((g) => g.steps.includes(from))
    if (st) setStage(st.id)
    toast.success(`已从 ${from} 开始重跑 · ${clean.length} 步产物已清洗`)
  }

  /* ---------- 单镜重生成：该行 shimmer → stale 清除（demo）/ 真实端点（real） ---------- */
  const shotRerun = useCallback(
    async (index: number, step?: 'L4' | 'L5' | 'L6') => {
      if (real) {
        const st = step ?? (stage === 4 ? 'L6' : 'L4')
        setShotBusy((s) => addTo(s, index))
        const ok = await realWizard.shotRerun(index, st)
        setShotBusy((s) => removeFrom(s, index))
        if (ok !== null) toast.success(`镜头 ${index} 已重生成`)
        else toast.error('重生成失败（任务运行中或积分不足）')
        return
      }
      if (shotBusy.has(index)) return
      setShotBusy((s) => addTo(s, index))
      const t = setTimeout(() => {
        setShotBusy((s) => removeFrom(s, index))
        setStaleShots((prev) => ({
          L4: removeFrom(prev.L4, index),
          L5: removeFrom(prev.L5, index),
          L6: removeFrom(prev.L6, index),
        }))
        toast.success(`镜头 ${index} 已重生成 · stale 已清除`)
      }, 1400)
      busyRef.current.add(t)
    },
    [real, stage, realWizard, shotBusy],
  )

  /* ---------- stale 传播（demo 模式；real 由后端 computeStale 派生） ---------- */
  const onScriptSaved = () => {
    if (real) return
    setStaleSteps((prev) => new Set([...prev, 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9'] as StepKey[]))
  }
  const onShotEdited = async (index: number, patch: Partial<Shot>) => {
    if (real) {
      const ok = await realWizard.saveStoryboardShots([patch as Shot])
      const orig = effShots.find((s) => s.index === index)
      if (patch.prompt !== undefined && orig && patch.prompt !== orig.prompt) {
        setFlashIdx(index)
        setTimeout(() => setFlashIdx(null), 700)
      }
      if (ok !== null) toast.success(`镜头 ${index} 已保存`)
      else toast.error('保存失败（任务需处于暂停态）')
      return
    }
    const orig = shots.find((s) => s.index === index)
    setShots((ss) => ss.map((s) => (s.index === index ? { ...s, ...patch } : s)))
    if (orig && patch.prompt !== undefined && patch.prompt !== orig.prompt) {
      setStaleShots((prev) => ({
        L4: addTo(prev.L4, index),
        L5: addTo(prev.L5, index),
        L6: addTo(prev.L6, index),
      }))
      setFlashIdx(index)
      const t = setTimeout(() => setFlashIdx(null), 700)
      busyRef.current.add(t)
      toast.warning(`镜头 ${index} prompt 已修改 · 仅该镜 L4/L5/L6 标记 stale`)
    } else {
      toast.success(`镜头 ${index} 已保存`)
    }
  }
  const onCandidateSwitched = (index: number) => {
    if (real) return
    // 若该镜已有下游产物 → 下游挂 stale
    if (eff.L5 === 'done' || eff.L6 === 'done' || statuses.L8 === 'done') {
      setStaleShots((prev) => ({
        ...prev,
        L5: addTo(prev.L5, index),
        L6: addTo(prev.L6, index),
      }))
    }
  }
  const onCandidateSelect = async (index: number, candidateKey: string) => {
    if (!real) return
    const ok = await realWizard.selectCandidate(index, candidateKey)
    if (ok !== null) toast.success(`镜头 ${index} 候选图已选用`)
    else toast.error('候选选用失败（任务运行中或积分不足）')
  }
  const onVoiceoverSave = async (index: number, text: string) => {
    if (real) {
      const ok = await realWizard.saveVoiceover(index, text)
      if (ok !== null) toast.success(`镜头 ${index} 配音已保存`)
      else toast.error('保存失败（任务需处于暂停态）')
      return
    }
    const orig = shots.find((s) => s.index === index)
    if (!orig || orig.voiceover === text.trim()) return
    setShots((ss) => ss.map((s) => (s.index === index ? { ...s, voiceover: text } : s)))
    setStaleShots((prev) => ({ ...prev, L6: addTo(prev.L6, index) }))
    setStaleSteps((prev) => new Set([...prev, 'L7', 'L8'] as StepKey[]))
    toast.warning(`镜头 ${index} 配音已修改 · 该镜 L6 及 L7/L8 标记 stale`)
  }
  const onSubtitleSave = async (index: number, text: string) => {
    if (real) {
      const ok = await realWizard.saveSubtitle(index, text)
      if (ok !== null) toast.success('字幕已保存')
      else toast.error('保存失败（任务需处于暂停态）')
      return
    }
    const orig = shots.find((s) => s.index === index)
    if (!orig || orig.subtitle === text.trim()) return
    setShots((ss) => ss.map((s) => (s.index === index ? { ...s, subtitle: text } : s)))
    setStaleSteps((prev) => new Set([...prev, 'L7', 'L8'] as StepKey[]))
    toast.warning('字幕已修改 · 需重新合成')
  }
  const onSubtitleSettings = async (patch: { chars_per_line?: number; font_size?: number; position?: string }) => {
    if (!real) return
    const ok = await realWizard.updateSubtitleSettings(patch)
    if (ok !== null) toast.success('字幕设置已更新 · 字幕及下游已重新生成')
  }
  const onRegenerateStoryboard = async () => {
    if (real) {
      const ok = await realWizard.regenerateStoryboard()
      if (ok !== null) toast.success('分镜已全量重拆分 · 下游已清洗')
      else toast.error('重拆分失败（任务运行中或积分不足）')
      return
    }
    requestRerun('L3')
  }

  /* ---------- 头部操作 ---------- */
  const changeRunMode = async (m: RunMode) => {
    if (m === effRunMode) return
    if (real) {
      const ok = await realWizard.setRunMode(m)
      if (ok) toast.success(m === 'semi' ? '已切换 semi · 每步完成后暂停确认' : '已切换 auto · 自动跑完（复核门仍暂停）')
      else toast.error('切换失败（任务运行中或已结束）')
      return
    }
    setRunMode(m)
    toast.info(m === 'semi' ? '已切换 semi · 每步完成后暂停确认' : '已切换 auto · 自动跑完（复核门仍暂停）')
    if (m === 'auto' && pausedStep && pausedStep !== 'L8') setPausedStep(null)
  }
  const onContinue = async () => {
    if (real) {
      const ok = await realWizard.continueTask()
      if (ok) toast.success('已继续 · 流水线推进中')
      else toast.error('继续失败（任务可能已在运行）')
      return
    }
    setPausedStep(null)
  }
  const cancelTask = async () => {
    if (real) {
      setCancelOpen(false)
      const ok = await realWizard.cancelTask()
      if (ok) toast.success('任务已取消 · 冻结积分已解冻')
      else toast.error('取消失败（仅暂停态任务可取消）')
      return
    }
    setStatuses((s) => {
      const n = { ...s }
      STEP_ORDER.forEach((k) => {
        if (n[k] === 'queued' || n[k] === 'running') n[k] = 'cancelled'
      })
      return n
    })
    setPlan(null)
    setPausedStep(null)
    setComposePhase(null)
    setTaskStatus('cancelled')
    setCancelOpen(false)
    if (track === 'managed') toast.info('已解冻 300 积分')
    else toast.info('任务已取消')
  }
  const onConfirmCompose = async () => {
    if (real) {
      const ok = await realWizard.continueTask()
      if (ok) toast.success('复核门已放行 · 合成推进中')
      else toast.error('放行失败（任务可能已在运行）')
      return
    }
    setStatuses((s) => ({ ...s, L8: 'running' }))
    setComposePhase(0)
  }
  const onGateChange = (open: boolean) => {
    if (real) {
      toast.info(open ? '复核门已开启（展示）' : '复核门由任务创建时配置决定 · 不可中途修改')
      return
    }
    setGateOpen(open)
  }
  const onRerunL9 = async () => {
    if (real) {
      const ok = await realWizard.rerunFrom('L9')
      if (ok !== null) toast.success('复检已重新运行')
      else toast.error('复检重跑失败（任务运行中）')
    }
  }
  const regenExport = async () => {
    setExportRegen(true)
    if (real) {
      const ok = await realWizard.rerunFrom('L10')
      if (ok !== null) toast.success('已重新生成导出 · 保留 30 天')
      else toast.error('重新生成失败（任务运行中）')
      setExportRegen(false)
      return
    }
    const t = setTimeout(() => {
      setExportRegen(false)
      setExportRegenerated(true)
      toast.success('新导出已生成 · 重新保留 30 天')
    }, 2000)
    busyRef.current.add(t)
  }

  const pausedSummary = effPausedStep ? (PAUSE_SUMMARY[effPausedStep] ?? '产物已就绪') : ''
  const rerunCleanList = rerunTarget ? STEP_ORDER.slice(STEP_ORDER.indexOf(rerunTarget)) : []

  /* ---------- real 模式加载 / 错误态 ---------- */
  if (real && realWizard.loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
        <Loader2 className="size-8 animate-spin text-brand-strong" />
        <p className="text-sm text-ink2">正在加载任务详情…</p>
      </div>
    )
  }
  if (real && realWizard.error) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
        <p className="text-sm text-err">{realWizard.error}</p>
        <Button type="button" variant="outline" className="border-line bg-raised text-ink2 hover:text-ink" onClick={realWizard.reload}>
          重试
        </Button>
      </div>
    )
  }

  const realConfig = (realWizard.detail?.config ?? TASK_CONFIG_JSON) as Record<string, unknown>
  const realExpiryLabel = (() => {
    if (!real || !realWizard.exportExpiresAt) return ''
    const days = Math.max(0, Math.ceil((new Date(realWizard.exportExpiresAt).getTime() - Date.now()) / 86_400_000))
    return `剩余 ${days} 天`
  })()
  /* real 模式：L8 成片元数据（时长/大小）来自 step 8 payload（L8 done 后才显示） */
  const l8Payload = realWizard?.detail?.steps?.find((s) => Number(s.step) === 8)?.payload as
    | { duration?: number; size?: number }
    | undefined
  const l8Meta =
    real && effComposed && l8Payload?.duration != null
      ? { duration: Number(l8Payload.duration), size: Number(l8Payload.size ?? 0) }
      : undefined

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.22 }}>
      <HeaderBar
        real={real}
        taskTitle={real ? (realConfig.title as string) || '任务详情' : undefined}
        taskCode={real ? `#${(realWizard.detail?.id ?? '').slice(0, 8)}` : undefined}
        shotsCount={real ? effShots.length : undefined}
        aspect={real ? (realConfig.aspect as string) : undefined}
        lang={real ? (realConfig.content_lang as string) : undefined}
        freezeCredits={real ? realWizard.detail?.credits?.frozen : undefined}
        taskStatus={effTaskStatus}
        runMode={effRunMode}
        mode={effMode}
        freeReruns={effFreeReruns}
        polling={real ? realWizard.polling : polling}
        onRunModeChange={changeRunMode}
        onTogglePoll={() => {
          if (real) {
            realWizard.setPolling(!realWizard.polling)
            toast.info(realWizard.polling ? '自动刷新已暂停' : '自动刷新已恢复')
          } else {
            setPolling((v) => !v)
            toast.info(polling ? '自动刷新已暂停' : '自动刷新已恢复')
          }
        }}
        onCancelTask={() => setCancelOpen(true)}
        onDuplicate={() => {
          if (real) toast.info('复制任务暂未接入')
          else toast.success('已复制任务（模拟）· 新任务 #T-1043')
        }}
        onShowConfig={() => setConfigOpen(true)}
        onToggleL15Violation={() => {
          setL15Violation((v) => !v)
          toast.warning(l15Violation ? 'L1.5 违规演示已关闭' : 'L1.5 违规终止（演示）· 任务终止不消耗成片积分')
        }}
        onToggleL9Feedback={() => {
          setL9State((v) => (v === 'passed' ? 'feedback' : 'passed'))
          toast.info(l9State === 'passed' ? 'L9 报告已切换 feedback（演示）' : 'L9 报告已恢复 passed')
        }}
      />

      {/* 后端降级提示（payload.degraded=true，如 L3 超时降级为残次品） */}
      {real && realWizard.degradedSteps.length > 0 && (
        <div className="mb-3">
          <AmberBar tone="amber">
            ⚠ 步骤 L{realWizard.degradedSteps.join(' / L')} 生成超时已降级，结果可能不完整 —— 建议在该步骤重新生成
          </AmberBar>
        </div>
      )}

      {/* 顶部横向 6 节点 StepRail（①文案 ②分镜 ③生图 ④配音 ⑤字幕 ⑥合成导出） */}
      <StepRail
        statuses={eff}
        staleSteps={effStaleSteps}
        activeStage={stage}
        taskStatus={effTaskStatus}
        onSelectStage={setStage}
      />

      {/* 节点编辑器 */}
      <div className="min-w-0 flex-1" ref={editorRef}>
          {/* real 初始暂停条（semi 任务等待开始） */}
          <AnimatePresence>
            {real && realWizard.pausedInitial && effTaskStatus === 'queued' && (
              <motion.div
                key="initial-pause"
                initial={{ y: '-100%', opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: '-100%', opacity: 0 }}
                transition={{ type: 'spring', damping: 28 }}
                className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[10px] border border-brand/40 bg-brand-soft px-4 py-2.5"
              >
                <Play className="size-4 shrink-0 text-brand-strong" />
                <span className="text-sm font-medium text-ink">任务已就绪 · semi 模式等待开始</span>
                <span className="ml-auto flex items-center gap-2">
                  <Button type="button" size="sm" className="bg-brand text-white hover:bg-brand-strong" onClick={onContinue}>
                    开始运行 →
                  </Button>
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* semi 暂停条（全节点共享，task-wizard.md §3）；failed 任务也显示以提供恢复入口 */}
          <AnimatePresence>
            {(effPausedStep || effFailedStep) && (effTaskStatus === 'running' || effTaskStatus === 'failed') && (
              <motion.div
                key={effFailedStep ?? effPausedStep}
                initial={{ y: '-100%', opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: '-100%', opacity: 0 }}
                transition={{ type: 'spring', damping: 28 }}
                className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[10px] border border-brand/40 bg-brand-soft px-4 py-2.5"
              >
                <PauseCircle className="size-4 shrink-0 text-brand-strong" />
                <span className="text-sm font-medium text-ink">
                  {effTaskStatus === 'failed' ? (
                    <>✕ 已失败 · {STEP_META[(effFailedStep ?? effPausedStep) as StepKey].code} {STEP_META[(effFailedStep ?? effPausedStep) as StepKey].name} 出错</>
                  ) : effPausedStep === 'L8' ? (
                    '复核门：合成前请人工确认'
                  ) : (
                    `⏸ 已暂停 · ${STEP_META[effPausedStep as StepKey].code} ${STEP_META[effPausedStep as StepKey].name} 完成`
                  )}
                </span>
                <span className="text-[13px] text-ink2">{effTaskStatus === 'failed' ? '可从失败步骤重跑恢复' : pausedSummary}</span>
                <span className="ml-auto flex items-center gap-2">
                  {effTaskStatus !== 'failed' && (effPausedStep === 'L8' ? (
                    <Button type="button" size="sm" className="bg-brand text-white hover:bg-brand-strong" onClick={onContinue}>
                      去确认 →
                    </Button>
                  ) : (
                    <Button type="button" size="sm" className="bg-brand text-white hover:bg-brand-strong" onClick={onContinue}>
                      继续 →
                    </Button>
                  ))}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-line bg-surface text-ink2 hover:text-ink"
                    onClick={() => editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  >
                    查看产物
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-line bg-surface text-ink2 hover:text-ink"
                    onClick={() => requestRerun((effFailedStep ?? effPausedStep) as StepKey)}
                  >
                    {effTaskStatus === 'failed' ? '从失败步骤重跑' : '从本步重跑'}
                  </Button>
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            <motion.div
              key={stage}
              initial={{ x: 24, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -12, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              {stage === 1 && (
                <NodeCopy
                  statuses={eff}
                  staleSteps={effStaleSteps}
                  l15Violation={effL15Violation}
                  freeReruns={effFreeReruns}
                  mode={effMode}
                  realVersions={real ? realWizard.scriptVersions : undefined}
                  realScript={real ? realWizard.currentScript : undefined}
                  onSaveVersion={real ? realWizard.saveScriptVersion : undefined}
                  onSelectVersion={real ? realWizard.selectScriptVersion : undefined}
                  onScriptSaved={onScriptSaved}
                  onRequestRerun={requestRerun}
                />
              )}
              {stage === 2 && (
                <NodeStoryboard
                  statuses={eff}
                  shots={effShots}
                  staleShotIdx={effStaleShots.L4}
                  shotBusy={shotBusy}
                  flashIdx={flashIdx}
                  freeReruns={effFreeReruns}
                  mode={effMode}
                  onRegenerateStoryboard={real ? onRegenerateStoryboard : undefined}
                  onShotEdited={onShotEdited}
                  onShotRerun={shotRerun}
                  onRequestRerun={requestRerun}
                />
              )}
              {stage === 3 && (
                <NodeVisual
                  statuses={eff}
                  shots={effShots}
                  staleShots={effStaleShots}
                  shotBusy={shotBusy}
                  freeReruns={effFreeReruns}
                  mode={effMode}
                  getRealCandidates={real ? realWizard.candidateList : undefined}
                  onCandidateSelect={real ? onCandidateSelect : undefined}
                  onShotRerun={shotRerun}
                  onRequestRerun={requestRerun}
                  onCandidateSwitched={onCandidateSwitched}
                  imageRefreshToken={real ? realWizard.imageRefreshToken : 0}
                />
              )}
              {stage === 4 && (
                <NodeAudio
                  statuses={eff}
                  shots={effShots}
                  staleShots={effStaleShots.L6}
                  shotBusy={shotBusy}
                  onVoiceoverSave={onVoiceoverSave}
                  onShotRerun={shotRerun}
                  voice={real ? String((realConfig as { tts?: { voice?: unknown } }).tts?.voice ?? '') : undefined}
                />
              )}
              {stage === 5 && (
                <NodeSubtitle
                  statuses={eff}
                  shots={effShots}
                  staleSteps={effStaleSteps}
                  onSubtitleSettings={real ? onSubtitleSettings : undefined}
                  onSubtitleSave={onSubtitleSave}
                />
              )}
              {stage === 6 && (
                <div className="flex flex-col gap-4">
                  <NodeCompose
                    statusL8={eff.L8}
                    staleL8={effStaleSteps.has('L8')}
                    gateOpen={effGateOpen}
                    composed={effComposed}
                    composePhase={effComposePhase}
                    runMode={effRunMode}
                    freeReruns={effFreeReruns}
                    mode={effMode}
                    videoSrc={real ? `${API_BASE}/tasks/${id}/assets/mp4/final.mp4` : undefined}
                    meta={l8Meta}
                    onGateChange={onGateChange}
                    onConfirmCompose={onConfirmCompose}
                    onRequestRerun={requestRerun}
                  />
                  <NodeDeliver
                    statusL9={eff.L9}
                    statusL10={eff.L10}
                    l9State={effL9State}
                    realReport={real ? realWizard.l9Report : undefined}
                    videoSrc={real ? `${API_BASE}/tasks/${id}/assets/mp4/final.mp4` : undefined}
                    exportExpired={effExportExpired}
                    exportRegen={exportRegen}
                    exportHref={real ? (realWizard.exportUrl ?? undefined) : undefined}
                    exportExpiryLabel={real ? realExpiryLabel : undefined}
                    onRerunL9={onRerunL9}
                    onGotoStage={setStage}
                    onRegenerateExport={regenExport}
                  />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
      </div>

      {/* ---------- 重跑 ConfirmDialog（计次 + 清洗清单 + 402 入口） ---------- */}
      <AlertDialog open={rerunTarget !== null} onOpenChange={(v) => !v && setRerunTarget(null)}>
        <AlertDialogContent className="border-line bg-raised">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-ink">
              从 {rerunTarget} 重跑 · {rerunTarget ? STEP_META[rerunTarget].name : ''}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-ink2">
              将清洗 {rerunTarget} 及以下产物，以上产物原样保留：
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-44 overflow-y-auto rounded-md border border-line bg-surface p-2.5">
            {rerunCleanList.map((s) => (
              <p key={s} className="py-0.5 font-mono text-xs text-ink2">
                {STEP_META[s].code} · {STEP_META[s].name}
                {skipRule(s) && <span className="text-ink3">（skipped 不执行）</span>}
              </p>
            ))}
          </div>
          {real ? (
            <p className="font-mono text-xs text-ink2">真实模式 · 由后端执行清洗与重跑计费</p>
          ) : effTrack === 'byok' ? (
            <p className="font-mono text-xs text-byok">BYOK · 重跑不计次</p>
          ) : effFreeReruns > 0 ? (
            <p className="font-mono text-xs text-ink2">本次使用免费重跑 · 确认后剩 {effFreeReruns - 1} 次</p>
          ) : (
            <p className="rounded-md border border-managed/40 bg-managed/10 px-3 py-2 font-mono text-xs text-managed">
              免费次数已用完 · 本次将扣除 {rerunCost(effMode)} 积分（{effMode}）
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel className="border-line bg-surface text-ink2 hover:text-ink">取消</AlertDialogCancel>
            <AlertDialogAction className="bg-brand text-white hover:bg-brand-strong" onClick={() => rerunTarget && executeRerun(rerunTarget)}>
              确认重跑
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ---------- 取消任务 ConfirmDialog ---------- */}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent className="border-line bg-raised">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-ink">取消任务？</AlertDialogTitle>
            <AlertDialogDescription className="text-ink2">
              {real
                ? '仅暂停态任务可取消 · 取消后全部 queued/running 步骤转 cancelled，冻结积分立即解冻。'
                : `全部 queued/running 步骤将转为 cancelled，已完成产物保留。${track === 'managed' ? ' 托管档冻结的 300 积分将立即解冻。' : ''}`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-line bg-surface text-ink2 hover:text-ink">继续运行</AlertDialogCancel>
            <AlertDialogAction className="bg-err/90 text-white hover:bg-err" onClick={cancelTask}>
              确认取消任务
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ---------- 配置 JSON Drawer ---------- */}
      <Sheet open={configOpen} onOpenChange={setConfigOpen}>
        <SheetContent className="w-[480px] border-line bg-raised sm:max-w-[480px]">
          <SheetHeader>
            <SheetTitle className="text-ink">任务配置 JSON（只读）</SheetTitle>
          </SheetHeader>
          <pre className="mt-4 max-h-[70vh] overflow-auto rounded-md border border-line bg-canvas p-4 font-mono text-xs leading-5 text-ink2">
            {JSON.stringify(realConfig, null, 2)}
          </pre>
          <Button
            type="button"
            variant="outline"
            className="mt-3 border-line bg-surface text-ink2 hover:text-ink"
            onClick={() => toast.success('配置 JSON 已复制')}
          >
            <Copy className="size-3.5" />
            复制 JSON
          </Button>
        </SheetContent>
      </Sheet>

      {/* ---------- 402 积分不足弹窗（demo 模式重跑） ---------- */}
      <Modal402 open={show402} onOpenChange={setShow402} />
    </motion.div>
  )
}
