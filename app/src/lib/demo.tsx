import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'

export type Track = 'byok' | 'managed'
/** 数据来源模式：demo 走 mock / real 走真实 API（PIPELINE_TASK_15 阶段①）。 */
export type Mode = 'demo' | 'real'

export type ScenarioId =
  | 'new-user'
  | 'insufficient-402'
  | 'export-expired-410'
  | 'byok-full'
  | 'managed-no-i2v'

export const SCENARIOS: { id: ScenarioId; label: string }[] = [
  { id: 'new-user', label: '新用户（120 体验积分）' },
  { id: 'insufficient-402', label: '积分余额不足（402）' },
  { id: 'export-expired-410', label: '导出已过期（410）' },
  { id: 'byok-full', label: 'BYOK 四通道全配' },
  { id: 'managed-no-i2v', label: '托管档缺 i2v 通道' },
]

const DEFAULTS = {
  track: 'managed' as Track,
  credits: 1620,
  /** 默认 real：走真实后端 API；demo 模式仅供原型/离线演示。 */
  mode: 'real' as Mode,
  authed: false,
  ageConfirmed: false,
  exportExpired: false,
  missingI2vChannel: false,
  byokFullConfig: false,
}

/** 真实会话用户（real 模式，GET /api/auth/me）。 */
export interface DemoUser {
  email: string | null
  nickname: string | null
  tier: string
}

interface DemoContextValue {
  track: Track
  setTrack: (t: Track) => void
  credits: number
  setCredits: (n: number) => void
  mode: Mode
  setMode: (m: Mode) => void
  authed: boolean
  setAuthed: (v: boolean) => void
  ageConfirmed: boolean
  setAgeConfirmed: (v: boolean) => void
  /** 真实会话用户信息（real 模式登录后填充，顶栏展示用）。 */
  user: DemoUser | null
  setUser: (u: DemoUser | null) => void
  /** L1.5 合规预审步显隐：托管档显示，BYOK 档 skipped */
  exportExpired: boolean
  missingI2vChannel: boolean
  byokFullConfig: boolean
  consoleOpen: boolean
  setConsoleOpen: (v: boolean) => void
  applyScenario: (id: ScenarioId) => void
  resetDemo: () => void
}

const DemoContext = createContext<DemoContextValue | null>(null)

export function DemoProvider({ children }: { children: ReactNode }) {
  const [track, setTrack] = useState<Track>(DEFAULTS.track)
  const [credits, setCredits] = useState(DEFAULTS.credits)
  const [mode, setMode] = useState<Mode>(DEFAULTS.mode)
  const [authed, setAuthed] = useState(DEFAULTS.authed)
  const [ageConfirmed, setAgeConfirmed] = useState(DEFAULTS.ageConfirmed)
  const [user, setUser] = useState<DemoUser | null>(null)
  const [exportExpired, setExportExpired] = useState(DEFAULTS.exportExpired)
  const [missingI2vChannel, setMissingI2vChannel] = useState(DEFAULTS.missingI2vChannel)
  const [byokFullConfig, setByokFullConfig] = useState(DEFAULTS.byokFullConfig)
  const [consoleOpen, setConsoleOpen] = useState(false)

  const applyScenario = useCallback((id: ScenarioId) => {
    const s = SCENARIOS.find((x) => x.id === id)
    switch (id) {
      case 'new-user':
        setTrack('managed'); setCredits(120); setExportExpired(false); setMissingI2vChannel(false); setByokFullConfig(false)
        break
      case 'insufficient-402':
        setTrack('managed'); setCredits(25)
        break
      case 'export-expired-410':
        setExportExpired(true)
        break
      case 'byok-full':
        setTrack('byok'); setByokFullConfig(true)
        break
      case 'managed-no-i2v':
        setTrack('managed'); setMissingI2vChannel(true)
        break
    }
    toast.info(`已切换到场景：${s?.label ?? id}`)
  }, [])

  const resetDemo = useCallback(() => {
    setTrack(DEFAULTS.track); setCredits(DEFAULTS.credits)
    setExportExpired(DEFAULTS.exportExpired); setMissingI2vChannel(DEFAULTS.missingI2vChannel)
    setByokFullConfig(DEFAULTS.byokFullConfig)
    toast.success('演示数据已重置为默认 mock')
  }, [])

  const value = useMemo<DemoContextValue>(
    () => ({
      track, setTrack, credits, setCredits,
      mode, setMode,
      authed, setAuthed, ageConfirmed, setAgeConfirmed,
      user, setUser,
      exportExpired, missingI2vChannel, byokFullConfig,
      consoleOpen, setConsoleOpen, applyScenario, resetDemo,
    }),
    [track, credits, mode, authed, ageConfirmed, user, exportExpired, missingI2vChannel, byokFullConfig, consoleOpen, applyScenario, resetDemo],
  )

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>
}

export function useDemo(): DemoContextValue {
  const ctx = useContext(DemoContext)
  if (!ctx) throw new Error('useDemo must be used inside <DemoProvider>')
  return ctx
}
