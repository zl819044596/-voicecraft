import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { KeyRound, Loader2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { CLASS_META, PRESETS, maskKey } from './data'
import type { Mechanism, ModelConfig, ProviderClass } from './data'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  cls: ProviderClass
  editing?: ModelConfig | null
  existing: ModelConfig[]
  onSave: (cfg: ModelConfig) => void
}

/** 新增/编辑配置 Drawer（models.md §4）：右滑 520px，双接入机制 + Key 安全提示条 */
export default function ConfigDrawer({ open, onOpenChange, cls, editing, existing, onSave }: Props) {
  const [mechanism, setMechanism] = useState<Mechanism>('openai-compat')
  const [name, setName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [provider, setProvider] = useState('')
  const [voice, setVoice] = useState('')
  const [keyInput, setKeyInput] = useState('')
  const [changeKey, setChangeKey] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [testing, setTesting] = useState(false)

  // 打开时初始化表单
  useEffect(() => {
    if (!open) return
    setMechanism(editing?.mechanism ?? 'openai-compat')
    setName(editing?.name ?? '')
    setBaseUrl(editing?.endpoint ?? '')
    setModel(editing?.model ?? '')
    setProvider(editing?.provider ?? '')
    setVoice(editing?.voice ?? '')
    setKeyInput('')
    setChangeKey(false)
    setConflict(false)
    setTesting(false)
  }, [open, editing])

  const buildConfig = (): ModelConfig | null => {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error('请填写配置名称')
      return null
    }
    // 同 provider+label 重复 → 冲突（models.md §5）
    const dup = existing.some(
      (c) =>
        c.id !== editing?.id &&
        c.name === trimmed &&
        (mechanism === 'openai-compat' ? c.endpoint === baseUrl.trim() : c.provider === provider),
    )
    if (dup) {
      setConflict(true)
      return null
    }
    setConflict(false)

    // 机制 B 未选预设 → 拦截并提示（provider 为空串，若放行会被后端 422 拒绝）
    if (mechanism === 'preset' && !provider.trim()) {
      toast.error('请选择平台预设')
      return null
    }

    const isEditKeepKey = editing && !changeKey
    if (!isEditKeepKey && !keyInput.trim()) {
      toast.error('请填写 API Key')
      return null
    }
    // 明文只用于生成掩码，随后立即丢弃（R1：不写存储/URL/状态）
    const masked = isEditKeepKey ? editing!.maskedKey : maskKey(keyInput)
    setKeyInput('')

    // 机制 B 用预设目录回填模型（真实平台预设带真实 model），避免「X 默认模型」这类后端不认识的模型名
    const preset = mechanism === 'preset' ? PRESETS[cls].find((p) => p.label === provider) : undefined

    return {
      id: editing?.id ?? `mc-${cls}-${Date.now()}`,
      cls,
      name: trimmed,
      mechanism,
      endpoint: mechanism === 'openai-compat' ? baseUrl.trim() : undefined,
      provider: mechanism === 'preset' ? provider : undefined,
      model: model.trim() || preset?.model || (mechanism === 'preset' ? provider : '未指定模型'),
      maskedKey: masked,
      voice: cls === 'tts' ? voice.trim() || undefined : undefined,
      isDefault: editing?.isDefault ?? false,
      enabled: editing?.enabled ?? true,
      refs: editing?.refs,
      // real 模式回填既有凭据引用；新建/换 Key 时透传明文（页面 save 建 credential 后即弃）
      credentialId: editing?.credentialId,
      plainKey: isEditKeepKey ? undefined : keyInput.trim() || undefined,
    }
  }

  const handleSave = (withTest: boolean) => {
    const cfg = buildConfig()
    if (!cfg) return
    if (withTest) {
      setTesting(true)
      // 模拟测试连接：成功后才保存
      window.setTimeout(() => {
        setTesting(false)
        onSave(cfg)
        onOpenChange(false)
        toast.success(`连接成功 · 延迟 320ms · 已保存「${cfg.name}」`)
      }, 900)
    } else {
      onSave(cfg)
      onOpenChange(false)
      toast.success(`已保存配置「${cfg.name}」`)
    }
  }

  const presets = PRESETS[cls]

  /** 选预设自动填充 model / voice / baseUrl（wingray 等真实平台预设带真实 model，避免「X 默认模型」） */
  const pickPreset = (label: string) => {
    const p = presets.find((x) => x.label === label)
    setProvider(label)
    if (p?.model) setModel(p.model)
    if (p?.voice) setVoice(p.voice)
    if (p?.baseUrl) setBaseUrl(p.baseUrl)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto border-line bg-surface sm:max-w-[520px]">
        <SheetHeader>
          <SheetTitle className="text-ink">
            {editing ? '编辑配置' : '新增配置'} · {CLASS_META[cls].title}
          </SheetTitle>
          <SheetDescription className="text-ink3">
            选择接入机制并填写凭证 · Key 只回显掩码
          </SheetDescription>
        </SheetHeader>

        {/* 机制选择（双 radio 卡） */}
        <div className="mt-5 grid grid-cols-2 gap-2">
          {(
            [
              { id: 'openai-compat', title: '机制 A · OpenAI 兼容端点', desc: '任意兼容协议的模型服务' },
              { id: 'preset', title: '机制 B · 平台预设适配器', desc: '非兼容协议主流 provider · 选预设 + 填 Key 即可' },
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMechanism(m.id)}
              className={cn(
                'rounded-md border p-3 text-left transition-all',
                mechanism === m.id
                  ? 'border-brand bg-brand-soft'
                  : 'border-line bg-raised hover:border-linestrong',
              )}
            >
              <p className={cn('text-[13px] font-semibold', mechanism === m.id ? 'text-brand-strong' : 'text-ink')}>
                {m.title}
              </p>
              <p className="mt-1 text-xs leading-4 text-ink3">{m.desc}</p>
            </button>
          ))}
        </div>

        {/* 表单（机制切换交叉淡入） */}
        <AnimatePresence mode="wait">
          <motion.div
            key={mechanism}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="mt-5 flex flex-col gap-4"
          >
            <div>
              <Label htmlFor="cfg-name" className="text-ink2">名称</Label>
              <Input
                id="cfg-name"
                value={name}
                onChange={(e) => { setName(e.target.value); setConflict(false) }}
                placeholder="例如：DeepSeek 主用"
                className="mt-1.5 border-line bg-raised text-ink"
              />
              {conflict && (
                <p className="mt-1.5 text-xs font-medium text-err">已存在同名凭证（冲突）</p>
              )}
            </div>

            {mechanism === 'openai-compat' ? (
              <>
                <div>
                  <Label htmlFor="cfg-url" className="text-ink2">base_url</Label>
                  <Input
                    id="cfg-url"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://api.example.com/v1"
                    className="mt-1.5 border-line bg-raised font-mono text-[13px] text-ink"
                  />
                </div>
                <div>
                  <Label htmlFor="cfg-model" className="text-ink2">model</Label>
                  <Input
                    id="cfg-model"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="deepseek-chat"
                    className="mt-1.5 border-line bg-raised font-mono text-[13px] text-ink"
                  />
                </div>
              </>
            ) : (
              <div>
                <Label className="text-ink2">provider 预设</Label>
                <Select value={provider} onValueChange={pickPreset}>
                  <SelectTrigger className="mt-1.5 border-line bg-raised text-ink">
                    <SelectValue placeholder="选择平台预设适配器" />
                  </SelectTrigger>
                  <SelectContent className="border-line bg-raised">
                    {presets.map((p) => (
                      <SelectItem
                        key={p.id}
                        value={p.label}
                        disabled={!!p.unsupported}
                        className="text-ink2 focus:bg-press focus:text-ink"
                      >
                        <span className="flex items-center gap-2">
                          {p.label}
                          {p.unsupported && (
                            <span className="text-[11px] font-medium text-err">{p.unsupported}</span>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {cls === 'tts' && (
              <div>
                <Label htmlFor="cfg-voice" className="text-ink2">默认音色 voice</Label>
                <Input
                  id="cfg-voice"
                  value={voice}
                  onChange={(e) => setVoice(e.target.value)}
                  placeholder="Aria"
                  className="mt-1.5 border-line bg-raised text-ink"
                />
              </div>
            )}

            {/* 凭证：编辑态显示 masked 占位 + 更换 Key */}
            <div>
              <Label className="text-ink2">API Key</Label>
              {editing && !changeKey ? (
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="flex h-9 flex-1 items-center gap-2 rounded-md border border-line bg-raised px-3">
                    <KeyRound className="size-3.5 text-ink3" />
                    <code className="font-mono text-[13px] text-ink2">{editing.maskedKey}</code>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => setChangeKey(true)}>
                    更换 Key
                  </Button>
                </div>
              ) : (
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="输入后仅保存掩码，明文立即丢弃"
                  className="mt-1.5 border-line bg-raised font-mono text-[13px] text-ink"
                />
              )}
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Key 安全提示条（固定表单底部，teal 左条） */}
        <div
          className="mt-6 rounded-md bg-raised p-3 text-xs leading-5 text-ink2"
          style={{ borderLeft: '3px solid var(--byok)' }}
        >
          <p className="flex items-center gap-1.5 font-medium text-byok">
            <ShieldCheck className="size-3.5" /> Key 安全
          </p>
          Key 仅服务端 AES-GCM 加密保存 · 保存后只显示掩码 · 不会写入浏览器存储或 URL
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <Button
            type="button"
            disabled={testing}
            onClick={() => handleSave(true)}
            className="bg-brand text-white hover:bg-brand-strong"
          >
            {testing && <Loader2 className="size-4 animate-spin" />}
            测试连接并保存
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" disabled={testing} onClick={() => handleSave(false)}>
              直接保存
            </Button>
            <Button type="button" variant="ghost" className="flex-1" onClick={() => onOpenChange(false)}>
              取消
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
