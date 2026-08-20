import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, ArrowRight, Check, ChevronDown, Layers, Loader2, Sparkles, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useDemo } from '@/lib/demo'
import { ApiError, post } from '@/lib/api'
import { useApiList } from '@/lib/use-api-data'
import { voicesForConfig } from '@/lib/voices'
import type { ModelConfig as ApiModelConfig, Product as ApiProduct } from '@/lib/types'
import { useT } from '@/lib/i18n'
import PageHeader from '@/components/PageHeader'
import SectionCard from '@/components/quick/SectionCard'
import WaveformPlayer from '@/components/quick/WaveformPlayer'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'

/* ---------- mock 文案（demo 模式） ---------- */

const SAMPLE_COPY = `Meet Aurora Brew — cold brew, bottled at dawn.
Slow-steeped for 18 hours, then sealed in glass to keep every note: dark chocolate, toasted hazelnut, a clean citrus finish.
No sugar. No shortcuts. Just cold brew that tastes like the first quiet minute of your day.
Grab a bottle. Own your morning.`

const REWRITE_RESULT = `Your morning doesn't start until Aurora Brew does.
18 hours of slow steeping. Zero sugar. One bottle of pure cold brew focus — dark chocolate depth, hazelnut warmth, a bright citrus snap at the end.
Stop settling for bitter. Tap below and taste the upgrade.`

const CREATE_RESULT = `The 3pm slump is real — and your coffee shouldn't make it worse.
Aurora Brew cold brew: slow-steeped 18 hours for smooth, low-acid energy that doesn't crash.
Watch what happens when we pour it over ice — that's 18 hours of patience in 4 seconds.
Upgrade your afternoon. Link below.`

const PRODUCTS = [
  { id: 'aurora', name: 'Aurora Brew 冷萃瓶', price: '$29.9', img: '/product-aurora.png' },
  { id: 'lumen', name: 'Lumen 桌面氛围灯', price: '$49.0', img: '/product-lumen.png' },
]

const ANGLES = ['痛点切入', '场景演示', '对比测评']

const ASPECTS = [
  { id: '9:16', label: '9:16', note: 'TikTok/Reels', w: 22, h: 38 },
  { id: '16:9', label: '16:9', note: 'YouTube', w: 42, h: 24 },
  { id: '1:1', label: '1:1', note: 'Feed', w: 30, h: 30 },
] as const

const MODELS = {
  managed: {
    llm: ['平台默认 · GPT-4o mini', '平台默认 · GPT-4o'],
    image: ['平台默认 · FLUX.1 schnell', '平台默认 · SDXL'],
  },
  byok: {
    llm: ['OpenAI 主 Key · GPT-4o', 'Claude 备用 · Sonnet 4'],
    image: ['自建 FLUX · 高配', 'SDXL 本地节点'],
  },
} as const

const REWRITE_STYLES = ['更口语', '更促销', '更高级']
const REWRITE_LENS = [15, 30, 60]

/** 分镜模板 → L3 的 synthesis.storyboard_preset（api/pipeline/steps/l3.ts：general/ecommerce/story） */
const SB_PRESETS = [
  { id: 'general', label: '通用', note: '信息流口播' },
  { id: 'ecommerce', label: '电商', note: '商品特写' },
  { id: 'story', label: '故事', note: '叙事连贯' },
] as const
type SbPreset = (typeof SB_PRESETS)[number]['id']

/** 目标时长 → 分镜镜头数（L3 读 synthesis.shot_count，min 3 / max 12） */
const DURATION_SHOTS: Record<number, number> = { 15: 4, 30: 8, 60: 12 }

const SHOT_IMAGES = [
  '/shot-01.png',
  '/shot-02.png',
  '/shot-03.png',
  '/shot-04.png',
  '/shot-05.png',
  '/shot-06.png',
  '/shot-07.png',
  '/shot-08.png',
]

/** /app/quick 快速生成（PIPELINE_TASK_42 阶段 B）：左输入 + 右分镜预览 + 折叠设置面板 */
export default function QuickGenerate() {
  const navigate = useNavigate()
  const { t } = useT()
  const { track, credits, setCredits, mode: demoMode } = useDemo()
  const isByok = track === 'byok'
  const real = demoMode === 'real'

  /* real 模式数据源：模型配置下拉 + 商品库 */
  const mcList = useApiList<ApiModelConfig>('/model-configs', { size: 100 })
  const prodList = useApiList<ApiProduct>('/products', { size: 100 })

  /* ① 文案来源 */
  const [tab, setTab] = useState('paste')
  const [pasteText, setPasteText] = useState('')
  const [rewriteSrc, setRewriteSrc] = useState('')
  const [rewriteStyle, setRewriteStyle] = useState(REWRITE_STYLES[1])
  const [rewriteLenIdx, setRewriteLenIdx] = useState(1)
  const [rewriteResult, setRewriteResult] = useState('')
  const [rewriting, setRewriting] = useState(false)
  const [topic, setTopic] = useState('')
  const [product, setProduct] = useState(PRODUCTS[0].id)
  const [angles, setAngles] = useState<string[]>(['场景演示'])
  const [createResult, setCreateResult] = useState('')
  const [creating, setCreating] = useState(false)
  const [contentLang, setContentLang] = useState<'en' | 'zh'>('en')

  /* ② 画面设置 */
  const [aspect, setAspect] = useState<(typeof ASPECTS)[number]['id']>('9:16')
  const [llm, setLlm] = useState<string>(MODELS.managed.llm[0])
  const [imageModel, setImageModel] = useState<string>(MODELS.managed.image[0])
  const [lastTrack, setLastTrack] = useState(track)
  const [sbPreset, setSbPreset] = useState<SbPreset>('general')

  /* ③ 配音 */
  const [voice, setVoice] = useState('longjiqi')
  const [previewVoice, setPreviewVoice] = useState<string | null>(null)
  const [previewSrc, setPreviewSrc] = useState<{ id: string; url: string } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [speed, setSpeed] = useState(1)

  /* ④ 成片设置 */
  const [subtitles, setSubtitles] = useState(true)
  const [subPos, setSubPos] = useState<'底部' | '居中'>('底部')
  const [subSize, setSubSize] = useState(14)
  const [runMode, setRunMode] = useState<'semi' | 'auto'>('semi')

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const topRef = useRef<HTMLDivElement>(null)

  /* 轨道切换时模型选项联动（demo 模式） */
  if (!real && track !== lastTrack) {
    setLastTrack(track)
    setLlm(MODELS[track].llm[0])
    setImageModel(MODELS[track].image[0])
  }

  /* real 模式：从 model-configs 派生通道 + 商品库 */
  const llmConfigs = (mcList.items ?? []).filter((c) => c.provider_class === 'llm' && c.enabled)
  const imageConfigs = (mcList.items ?? []).filter((c) => c.provider_class === 'image' && c.enabled)
  const ttsConfigs = (mcList.items ?? []).filter((c) => c.provider_class === 'tts' && c.enabled)
  const ttsConfig = ttsConfigs.find((c) => c.is_default) ?? ttsConfigs[0]
  const realProducts = prodList.items ?? []

  /* real 数据到达后默认选中 */
  useEffect(() => {
    if (!real) {
      if (!PRODUCTS.some((p) => p.id === product)) setProduct(PRODUCTS[0].id)
      if (!(MODELS[track].llm as readonly string[]).includes(llm)) setLlm(MODELS[track].llm[0])
      if (!(MODELS[track].image as readonly string[]).includes(imageModel)) setImageModel(MODELS[track].image[0])
      return
    }
    if (llmConfigs.length > 0 && !llmConfigs.some((c) => c.id === llm)) {
      const def = llmConfigs.find((c) => c.is_default) ?? llmConfigs[0]
      setLlm(def.id)
    }
    if (imageConfigs.length > 0 && !imageConfigs.some((c) => c.id === imageModel)) {
      const def = imageConfigs.find((c) => c.is_default) ?? imageConfigs[0]
      setImageModel(def.id)
    }
    if (realProducts.length > 0 && !realProducts.some((p) => p.id === product)) {
      setProduct(realProducts[0].id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [real, mcList.items, prodList.items])

  const voices = voicesForConfig(ttsConfig)
  const activeVoice = voices.find((v) => v.id === voice) ?? voices[0]

  /* 默认 TTS 配置变化时，音色跟随 */
  useEffect(() => {
    if (!real || !ttsConfig) return
    const list = voicesForConfig(ttsConfig)
    if (!list.some((v) => v.id === voice)) {
      setVoice(ttsConfig.voice || list[0]?.id || '')
    }
  }, [real, ttsConfig])

  /* 真实试听：调 /api/model-configs/preview 合成音频后播放 */
  const playPreview = async (vid: string, vname: string) => {
    if (previewLoading) return
    setPreviewVoice(vid)
    setPreviewLoading(true)
    try {
      const res = await fetch('/api/model-configs/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({
          id: ttsConfig?.id,
          text:
            contentLang === 'en'
              ? `Hi, I'm ${vname}. Welcome to our voice preview.`
              : `你好，我是${vname}，欢迎使用语音合成服务。`,
          voice: vid,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      setPreviewSrc({ id: vid, url: URL.createObjectURL(blob) })
    } catch (err) {
      toast.error(`试听失败：${(err as Error).message}`)
      setPreviewVoice(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  /* 静态合成固定 60 积分（i2v 已下线） */
  const cost = 60
  const insufficient = !isByok && credits < cost
  const canSubmit = !insufficient && !submitting

  const estimate = isByok ? t('create.costFree') : `${t('create.costEstimate')} ${cost} ${t('create.credits')} ≈ $${(cost / 100).toFixed(2)}`

  /* 右栏预览：把当前就绪文案按自然段拆成「未来分镜」 */
  const previewParagraphs = useMemo(() => {
    const text = tab === 'paste' ? pasteText : tab === 'rewrite' ? rewriteResult : createResult
    return text
      .trim()
      .split(/\n{1,}/)
      .map((s) => s.trim())
      .filter(Boolean)
  }, [tab, pasteText, rewriteResult, createResult])

  /* ---------- 交互 ---------- */

  const runRewrite = async () => {
    if (!rewriteSrc.trim()) {
      toast.error('请先粘贴需要改写的原文')
      return
    }
    if (!real) {
      setRewriting(true)
      setTimeout(() => {
        setRewriting(false)
        setRewriteResult(REWRITE_RESULT)
        toast.success(`改写完成（${rewriteStyle} · ${REWRITE_LENS[rewriteLenIdx]}s）· 已填入文案`)
      }, 1500)
      return
    }
    setRewriting(true)
    try {
      const res = await post<{ script_paragraphs: string[]; hook: string; cta: string }>('/quick/rewrite', {
        text: rewriteSrc,
        content_language: contentLang,
      })
      setRewriteResult(res.script_paragraphs.join('\n\n'))
      toast.success('改写完成 · 已填入文案')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '改写失败，请稍后重试')
    } finally {
      setRewriting(false)
    }
  }

  const runCreate = async () => {
    if (!real && !topic.trim()) {
      toast.error('请输入创作主题')
      return
    }
    if (!real) {
      setCreating(true)
      setTimeout(() => {
        setCreating(false)
        setCreateResult(CREATE_RESULT)
        const p = (real ? realProducts : PRODUCTS).find((x) => x.id === product)
        toast.success(`已基于「${p?.name}」创作文案（mock）· 任务完成后该商品 gen_count +1`)
      }, 1500)
      return
    }
    setCreating(true)
    try {
      const res = await post<{ script_paragraphs: string[]; hook: string; cta: string }>('/quick/create', {
        product_id: product,
        content_language: contentLang,
      })
      setCreateResult(res.script_paragraphs.join('\n\n'))
      const p = realProducts.find((x) => x.id === product)
      toast.success(`已基于「${p?.name}」创作文案 · 任务完成后该商品 gen_count +1`)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '创作失败，请稍后重试')
    } finally {
      setCreating(false)
    }
  }

  const submit = async () => {
    if (!canSubmit) return
    setSubmitting(true)

    /* real 模式：POST /api/projects（auto_run=true）真实创建，成功后跳任务详情 */
    if (real) {
      try {
        const copy = tab === 'paste' ? pasteText : tab === 'rewrite' ? rewriteResult : createResult
        if (!copy.trim()) {
          toast.error(tab === 'paste' ? '请先粘贴文案' : tab === 'rewrite' ? '请先生成改写文案' : '请先生成创作文案')
          setSubmitting(false)
          return
        }
        const sourceType = tab === 'create' ? 'topic' : 'text'
        const title = (tab === 'create' ? topic : copy).trim().slice(0, 40) || 'AI 视频任务'
        const res = await post<{ task: { id: string; status: string } }>('/projects', {
          title,
          source_type: sourceType,
          prompt: copy.slice(0, 2000),
          auto_run: true,
          task: {
            mode: 'static',
            track,
            run_mode: runMode,
            config: {
              content_language: contentLang,
              synthesis: {
                aspect,
                subtitle_burn: subtitles,
                storyboard_preset: sbPreset,
                shot_count: DURATION_SHOTS[REWRITE_LENS[rewriteLenIdx]] ?? 8,
              },
              subtitle: { position: subPos, font_size: subSize },
              tts: { voice, speed },
              review_gate: true,
              prompts: { script: copy },
              script_mode: tab,
              ...(real && ttsConfig && llmConfigs.some((c) => c.id === llm) && imageConfigs.some((c) => c.id === imageModel)
                ? { models: { llm, image: imageModel, tts: ttsConfig.id } }
                : {}),
              ...(tab === 'create' && product ? { product_id: product } : {}),
            },
          },
        })
        toast.success('任务已创建 · 正在进入流水线')
        navigate(`/app/tasks/${res.task.id}`)
      } catch (e) {
        if (e instanceof ApiError) {
          if (e.code === 'INSUFFICIENT_CREDITS') toast.error('积分不足（402）· 请先充值')
          else toast.error(e.message)
        } else {
          toast.error(e instanceof Error ? e.message : '任务创建失败')
        }
        setSubmitting(false)
      }
      return
    }

    /* demo 模式：冻结积分后跳演示任务 */
    if (isByok) {
      toast.info('BYOK 自备 Key · 本次消耗 $0')
    } else {
      toast.info(`已冻结 ${cost} 积分 · done 实结 / failed 解冻`)
      setCredits(credits - cost)
    }
    setTimeout(() => navigate('/app/tasks/aurora-brew-30s'), 900)
  }

  const toggleAngle = (a: string) =>
    setAngles((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]))

  const sbPresetLabel = SB_PRESETS.find((p) => p.id === sbPreset)?.label ?? sbPreset
  const settingsSummary = `${contentLang} · ${aspect} · ${activeVoice.name} · ${t('create.subtitleToggle')} ${subtitles ? 'ON' : 'OFF'} · ${sbPresetLabel}`

  /* ---------- 渲染 ---------- */

  return (
    <div ref={topRef} className="mx-auto max-w-[1180px] pb-28">
      <PageHeader title={t('create.title')} description={t('create.subtitle')} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        {/* ================= 左列：输入 + 设置 ================= */}
        <div className="flex min-w-0 flex-col gap-6">
          {/* 文案来源 */}
          <SectionCard no="①" title={t('create.scriptCard')} description={t('create.scriptDesc')}>
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="w-full justify-start gap-4 rounded-none border-b border-line bg-transparent p-0">
                {[
                  { id: 'paste', label: t('create.paste') },
                  { id: 'rewrite', label: t('create.rewrite') },
                  { id: 'create', label: t('create.create') },
                ].map((tabItem) => (
                  <TabsTrigger
                    key={tabItem.id}
                    value={tabItem.id}
                    className="rounded-none border-b-2 border-transparent px-1 pb-2 text-sm text-ink3 data-[state=active]:border-brand data-[state=active]:bg-transparent data-[state=active]:text-brand-strong data-[state=active]:shadow-none"
                  >
                    {tabItem.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              {/* Tab 1 直接粘贴 */}
              <TabsContent value="paste" className="mt-4">
                <motion.div initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.22 }}>
                  <div className="relative">
                    <textarea
                      value={pasteText}
                      onChange={(e) => setPasteText(e.target.value.slice(0, 5000))}
                      placeholder={t('create.pastePlaceholder')}
                      className="min-h-[180px] w-full resize-y rounded-md border border-line bg-raised p-3 font-mono text-[13px] leading-5 text-ink placeholder:text-ink3 focus:border-linestrong focus:outline-none"
                    />
                    <span className="absolute right-3 bottom-3 font-mono text-xs text-ink3">
                      {pasteText.length} / 5000
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        setPasteText(SAMPLE_COPY)
                        toast.success('已填入 Aurora Brew 示例文案（英文）')
                      }}
                      className="text-[13px] text-brand-strong hover:underline"
                    >
                      {t('create.sample')}
                    </button>
                    {pasteText.trim() && <CopyReadyChip label={t('create.ready')} />}
                  </div>
                </motion.div>
              </TabsContent>

              {/* Tab 2 AI 改写 */}
              <TabsContent value="rewrite" className="mt-4">
                <motion.div initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.22 }}>
                  <textarea
                    value={rewriteSrc}
                    onChange={(e) => setRewriteSrc(e.target.value)}
                    placeholder={t('create.rewritePlaceholder')}
                    className="min-h-[110px] w-full resize-y rounded-md border border-line bg-raised p-3 font-mono text-[13px] leading-5 text-ink placeholder:text-ink3 focus:border-linestrong focus:outline-none"
                  />
                  <div className="mt-3 flex flex-wrap items-center gap-4">
                    <div className="flex rounded-md border border-line bg-surface p-0.5">
                      {REWRITE_STYLES.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setRewriteStyle(s)}
                          className={cn(
                            'rounded px-2.5 py-1 text-xs transition-colors',
                            rewriteStyle === s ? 'bg-press text-ink' : 'text-ink3 hover:text-ink',
                          )}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={runRewrite}
                      disabled={rewriting}
                      className="flex items-center gap-1.5 rounded-md bg-brand px-3.5 py-2 text-[13px] font-medium text-white transition-all hover:bg-brand-strong active:scale-[0.97] disabled:opacity-50"
                    >
                      {rewriting ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                      {t('create.rewriteBtn')}
                    </button>
                  </div>
                  {rewriting && <ShimmerLines />}
                  {rewriteResult && !rewriting && (
                    <div className="mt-3">
                      <div className="rounded-md border border-line bg-raised p-3 font-mono text-[13px] leading-5 whitespace-pre-wrap text-ink2">
                        {rewriteResult}
                      </div>
                      <div className="mt-2 flex justify-end"><CopyReadyChip label={t('create.ready')} /></div>
                    </div>
                  )}
                </motion.div>
              </TabsContent>

              {/* Tab 3 AI 创作 */}
              <TabsContent value="create" className="mt-4">
                <motion.div initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.22 }}>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <input
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      placeholder={t('create.createPlaceholder')}
                      className="h-10 rounded-md border border-line bg-raised px-3 text-sm text-ink placeholder:text-ink3 focus:border-linestrong focus:outline-none"
                    />
                    <Select value={product} onValueChange={setProduct}>
                      <SelectTrigger className="h-10 border-line bg-raised text-sm text-ink">
                        <SelectValue placeholder={t('create.pickProduct')} />
                      </SelectTrigger>
                      <SelectContent className="border-line bg-raised">
                        {real
                          ? realProducts.map((p) => (
                              <SelectItem key={p.id} value={p.id} className="text-ink2 focus:bg-press focus:text-ink">
                                <span className="flex items-center gap-2">
                                  <span className="flex size-8 shrink-0 items-center justify-center rounded border border-line bg-press font-mono text-xs text-ink2">
                                    {p.name.slice(0, 1)}
                                  </span>
                                  {p.name} · <span className="font-mono">{p.price ?? '—'}</span>
                                </span>
                              </SelectItem>
                            ))
                          : PRODUCTS.map((p) => (
                              <SelectItem key={p.id} value={p.id} className="text-ink2 focus:bg-press focus:text-ink">
                                <span className="flex items-center gap-2">
                                  <img src={p.img} alt="" className="size-8 rounded border border-line object-cover" />
                                  {p.name} · <span className="font-mono">{p.price}</span>
                                </span>
                              </SelectItem>
                            ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-ink3">{t('create.angle')}</span>
                    {ANGLES.map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => toggleAngle(a)}
                        className={cn(
                          'rounded-full border px-3 py-1 text-xs transition-colors',
                          angles.includes(a)
                            ? 'border-brand bg-brand-soft text-brand-strong'
                            : 'border-line text-ink3 hover:border-linestrong hover:text-ink',
                        )}
                      >
                        {a}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={runCreate}
                      disabled={creating}
                      className="ml-auto flex items-center gap-1.5 rounded-md bg-brand px-3.5 py-2 text-[13px] font-medium text-white transition-all hover:bg-brand-strong active:scale-[0.97] disabled:opacity-50"
                    >
                      {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                      {t('create.createBtn')}
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-ink3">inactive 商品不出现在此列表 · 任务完成后该商品 gen_count +1</p>
                  {creating && <ShimmerLines />}
                  {createResult && !creating && (
                    <div className="mt-3">
                      <div className="rounded-md border border-line bg-raised p-3 font-mono text-[13px] leading-5 whitespace-pre-wrap text-ink2">
                        {createResult}
                      </div>
                      <div className="mt-2 flex justify-end"><CopyReadyChip label={t('create.ready')} /></div>
                    </div>
                  )}
                </motion.div>
              </TabsContent>
            </Tabs>
          </SectionCard>

          {/* 生成设置（折叠面板） */}
          <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen} className="overflow-hidden rounded-lg border border-line bg-surface">
            <CollapsibleTrigger className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left">
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-ink">{t('create.settings')}</p>
                <p className="mt-0.5 truncate text-xs text-ink3">{settingsSummary}</p>
              </div>
              <ChevronDown className={cn('size-4 shrink-0 text-ink3 transition-transform', settingsOpen && 'rotate-180')} />
            </CollapsibleTrigger>
            <CollapsibleContent className="border-t border-line px-5 pb-5">
              {/* 语言 + 时长 */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-1.5 text-xs font-medium text-ink3">{t('create.contentLang')}</p>
                  <Select
                    value={contentLang}
                    onValueChange={(v) => {
                      const lang = v as 'en' | 'zh'
                      setContentLang(lang)
                      setVoice('longjiqi')
                      setPreviewVoice(null)
                    }}
                  >
                    <SelectTrigger className="h-9 border-line bg-raised text-sm text-ink">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-line bg-raised">
                      <SelectItem value="en" className="text-ink2 focus:bg-press focus:text-ink">English (en)</SelectItem>
                      <SelectItem value="zh" className="text-ink2 focus:bg-press focus:text-ink">中文 (zh)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium text-ink3">{t('create.duration')}</p>
                  <div className="flex h-9 items-center gap-3">
                    <Slider
                      value={[rewriteLenIdx]}
                      onValueChange={([v]) => setRewriteLenIdx(v)}
                      min={0}
                      max={2}
                      step={1}
                      className="flex-1"
                    />
                    <span className="w-10 font-mono text-[13px] text-ink">{REWRITE_LENS[rewriteLenIdx]}s</span>
                  </div>
                </div>
              </div>

              {/* 画面风格 */}
              <div className="mt-5">
                <p className="mb-2 text-xs font-medium text-ink3">{t('create.visual')}</p>
                <div className="grid grid-cols-3 gap-3">
                  {ASPECTS.map((a) => {
                    const active = aspect === a.id
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setAspect(a.id)}
                        className={cn(
                          'flex h-[76px] flex-col items-center justify-center gap-1.5 rounded-md border bg-raised transition-all',
                          active ? 'border-brand' : 'border-line hover:border-linestrong',
                        )}
                      >
                        <motion.span
                          animate={{ scale: active ? 1 : 0.9 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                          className="block rounded-[2px] border"
                          style={{
                            width: a.w,
                            height: a.h,
                            borderColor: active ? 'var(--brand-strong)' : 'var(--text-3)',
                            background: active ? 'var(--brand-soft)' : 'transparent',
                          }}
                        />
                        <span className={cn('font-mono text-xs', active ? 'text-ink' : 'text-ink3')}>
                          {a.label} <span className="font-sans text-[10px]">{a.note}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-ink3">LLM</p>
                    <Select value={llm} onValueChange={setLlm}>
                      <SelectTrigger className="h-9 border-line bg-raised text-sm text-ink"><SelectValue /></SelectTrigger>
                      <SelectContent className="border-line bg-raised">
                        {real
                          ? llmConfigs.map((c) => (
                              <SelectItem key={c.id} value={c.id} className="text-ink2 focus:bg-press focus:text-ink">
                                {c.name}
                                <span className="ml-1 font-mono text-xs text-ink3">{c.model}</span>
                              </SelectItem>
                            ))
                          : MODELS[track].llm.map((m) => (
                              <SelectItem key={m} value={m} className="text-ink2 focus:bg-press focus:text-ink">{m}</SelectItem>
                            ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-ink3">Image</p>
                    <Select value={imageModel} onValueChange={setImageModel}>
                      <SelectTrigger className="h-9 border-line bg-raised text-sm text-ink"><SelectValue /></SelectTrigger>
                      <SelectContent className="border-line bg-raised">
                        {real
                          ? imageConfigs.map((c) => (
                              <SelectItem key={c.id} value={c.id} className="text-ink2 focus:bg-press focus:text-ink">
                                {c.name}
                                <span className="ml-1 font-mono text-xs text-ink3">{c.model}</span>
                              </SelectItem>
                            ))
                          : MODELS[track].image.map((m) => (
                              <SelectItem key={m} value={m} className="text-ink2 focus:bg-press focus:text-ink">{m}</SelectItem>
                            ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="mt-2 text-right">
                  <Link to="/app/models" className="inline-flex items-center gap-1 text-xs text-brand-strong hover:underline">
                    管理通道 <ArrowRight className="size-3" />
                  </Link>
                </div>
              </div>

              {/* 分镜模板 */}
              <div className="mt-5">
                <p className="mb-2 text-xs font-medium text-ink3">{t('create.storyboardTemplate')}</p>
                <div className="grid grid-cols-3 gap-3">
                  {SB_PRESETS.map((p) => {
                    const active = sbPreset === p.id
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSbPreset(p.id)}
                        className={cn(
                          'rounded-md border bg-raised px-3 py-2.5 text-left transition-all',
                          active ? 'border-brand' : 'border-line hover:border-linestrong',
                        )}
                      >
                        <p className={cn('text-[13px] font-medium', active ? 'text-ink' : 'text-ink2')}>{p.label}</p>
                        <p className="mt-0.5 text-[11px] text-ink3">{p.note}</p>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 音色 */}
              <div className="mt-5">
                <p className="mb-2 text-xs font-medium text-ink3">{t('create.voice')}</p>
                <div className="flex flex-col gap-2">
                  {voices.map((v) => {
                    const active = voice === v.id
                    return (
                      <div
                        key={v.id}
                        onClick={() => setVoice(v.id)}
                        className={cn(
                          'flex cursor-pointer items-center gap-3 rounded-md border bg-raised px-3 py-2 transition-all',
                          active ? 'border-brand' : 'border-line hover:border-linestrong',
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <p className={cn('truncate text-sm font-medium', active ? 'text-ink' : 'text-ink2')}>{v.name}</p>
                          <p className="truncate text-xs text-ink3">{v.desc}</p>
                        </span>
                        <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                          <AnimatePresence initial={false} mode="wait">
                            {previewLoading && previewVoice === v.id ? (
                              <motion.p key="loading" className="text-xs text-ink3">{t('create.listening')}</motion.p>
                            ) : previewVoice === v.id && previewSrc?.id === v.id ? (
                              <motion.div
                                key="player"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="overflow-hidden"
                              >
                                <WaveformPlayer
                                  src={previewSrc.url}
                                  autoPlay
                                  durationLabel={t('create.listen')}
                                  onEnded={() => {
                                    setPreviewVoice(null)
                                    setPreviewSrc(null)
                                  }}
                                />
                              </motion.div>
                            ) : (
                              <motion.button
                                key="btn"
                                type="button"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => playPreview(v.id, v.name)}
                                className="text-xs text-brand-strong hover:underline"
                              >
                                ▶ {t('create.listen')}
                              </motion.button>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="mt-3 flex items-center gap-4">
                  <p className="text-xs font-medium text-ink3">语速</p>
                  <Slider
                    value={[speed]}
                    onValueChange={([v]) => setSpeed(Math.round(v * 100) / 100)}
                    min={0.75}
                    max={1.5}
                    step={0.05}
                    className="flex-1"
                  />
                  <span className="w-12 text-right font-mono text-[13px] text-ink">{speed.toFixed(2)}×</span>
                </div>
              </div>

              {/* 字幕 */}
              <div className="mt-5 border-t border-line pt-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-ink">{t('create.subtitleToggle')}</p>
                    <p className="mt-0.5 text-xs text-ink3">关闭后导出仍为可选：成片无字幕 + 独立 subtitles.srt</p>
                  </div>
                  <Switch checked={subtitles} onCheckedChange={setSubtitles} />
                </div>
                <AnimatePresence initial={false}>
                  {subtitles && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-3 flex flex-wrap items-center gap-4 rounded-md border border-line bg-raised p-3">
                        <div className="flex rounded-md border border-line bg-surface p-0.5">
                          {(['底部', '居中'] as const).map((p) => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => setSubPos(p)}
                              className={cn(
                                'rounded px-2.5 py-1 text-xs transition-colors',
                                subPos === p ? 'bg-press text-ink' : 'text-ink3 hover:text-ink',
                              )}
                            >
                              {p}
                            </button>
                          ))}
                        </div>
                        <div className="flex min-w-32 flex-1 items-center gap-3">
                          <span className="text-xs text-ink3">字号</span>
                          <Slider value={[subSize]} onValueChange={([v]) => setSubSize(v)} min={10} max={24} step={1} className="flex-1" />
                          <span className="w-6 font-mono text-xs text-ink">{subSize}</span>
                        </div>
                        <div className="relative h-[88px] w-[50px] shrink-0 overflow-hidden rounded-md border border-line">
                          <img src="/shot-03.png" alt="" className="absolute inset-0 size-full object-cover" />
                          <span
                            className={cn(
                              'absolute right-0.5 left-0.5 rounded-[2px] bg-black/55 px-0.5 py-0.5 text-center text-white',
                              subPos === '底部' ? 'bottom-1' : 'top-1/2 -translate-y-1/2',
                            )}
                            style={{ fontSize: 7 }}
                          >
                            Cold brew, bottled at dawn.
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* 运行模式 */}
              <div className="mt-5 border-t border-line pt-4">
                <p className="mb-2 text-xs font-medium text-ink3">{t('create.runMode')}</p>
                <div className="flex w-full max-w-sm rounded-md border border-line bg-surface p-0.5">
                  {(
                    [
                      { id: 'semi', label: t('create.semi') },
                      { id: 'auto', label: t('create.auto') },
                    ] as const
                  ).map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setRunMode(r.id)}
                      className={cn(
                        'flex-1 rounded px-3 py-1.5 text-[13px] transition-colors',
                        runMode === r.id ? 'bg-press text-ink' : 'text-ink3 hover:text-ink',
                      )}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-ink3">semi 每步暂停等确认；auto 不暂停，但 L8 合成前复核门默认仍开启</p>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* ================= 右列：分镜预览 ================= */}
        <div className="min-w-0 lg:sticky lg:top-6">
          <StoryboardPreview
            aspect={aspect}
            paragraphs={previewParagraphs}
            durationSec={REWRITE_LENS[rewriteLenIdx]}
          />
        </div>
      </div>

      {/* ================= sticky 操作条 ================= */}
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        transition={{ delay: 0.4, type: 'spring', stiffness: 260, damping: 30 }}
        className="fixed right-0 bottom-0 left-0 z-40 border-t border-line bg-surface/85 shadow-[0_-8px_32px_rgba(0,0,0,.45)] backdrop-blur"
      >
        <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between gap-3 px-4 lg:px-8">
          {/* 校验态 + 汇总 chips */}
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
            {insufficient && !isByok && (
              <span
                className="flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 font-mono text-xs font-medium text-err"
                style={{ background: 'rgba(248,113,113,.12)', border: '1px solid rgba(248,113,113,.4)' }}
              >
                <AlertTriangle className="size-3" />
                积分不足
              </span>
            )}
            {[isByok ? 'BYOK' : '托管', aspect, activeVoice.name, contentLang, runMode].map((chip) => (
              <span
                key={chip}
                className="shrink-0 rounded-full border border-line bg-raised px-2.5 py-1 font-mono text-xs text-ink2"
              >
                {chip}
              </span>
            ))}
          </div>

          {/* 预估 + 主按钮 */}
          <div className="flex shrink-0 items-center gap-3">
            <p className={cn('hidden text-xs sm:block', isByok ? 'text-byok' : 'text-ink3')}>{estimate}</p>
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="flex h-11 items-center gap-2 rounded-md bg-brand px-6 text-sm font-medium text-white shadow-glow transition-all hover:bg-brand-strong hover:shadow-[0_0_32px_rgba(124,92,255,.5)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> {t('create.generating')}
                </>
              ) : (
                <>
                  <Wand2 className="size-4" /> {t('create.generate')}
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

/* ---------- 页内小组件 ---------- */

function CopyReadyChip({ label }: { label: string }) {
  return (
    <motion.span
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-ok"
      style={{ background: 'rgba(52,211,153,.1)', border: '1px solid rgba(52,211,153,.3)' }}
    >
      <Check className="size-3" strokeWidth={3} /> {label}
    </motion.span>
  )
}

function ShimmerLines() {
  return (
    <div className="mt-3 flex flex-col gap-2" aria-label="AI 生成中">
      {[92, 78, 60].map((w) => (
        <div
          key={w}
          className="shimmer-sweep h-3.5 animate-shimmer rounded bg-press"
          style={{ width: `${w}%` }}
        />
      ))}
    </div>
  )
}

/** 右栏分镜预览：把当前文案的每个自然段渲染成一个镜头卡（mock 缩略图）。 */
function StoryboardPreview({
  aspect,
  paragraphs,
  durationSec,
}: {
  aspect: string
  paragraphs: string[]
  durationSec: number
}) {
  const { t } = useT()
  const shots = paragraphs.slice(0, SHOT_IMAGES.length)
  const frame = aspect === '9:16' ? 'aspect-[9/16]' : aspect === '16:9' ? 'aspect-video' : 'aspect-square'

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <Layers className="size-4 text-brand-strong" />
          <p className="text-sm font-semibold text-ink">{t('create.preview')}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="rounded-full border border-line bg-raised px-2 py-0.5 font-mono text-xs text-ink2">{aspect}</span>
          {shots.length > 0 && (
            <span className="rounded-full bg-brand-soft px-2 py-0.5 font-mono text-xs text-brand-strong">
              {shots.length} · {durationSec}s
            </span>
          )}
        </div>
      </div>

      {shots.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <span className="flex size-11 items-center justify-center rounded-md border border-dashed border-line">
            <Layers className="size-5 text-ink3" />
          </span>
          <p className="max-w-[220px] text-[13px] leading-5 text-ink3">{t('create.previewEmpty')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 p-4">
          {shots.map((s, i) => (
            <div key={i} className="overflow-hidden rounded-md border border-line bg-raised">
              <div className={cn('relative w-full overflow-hidden', frame)}>
                <img src={SHOT_IMAGES[i]} alt="" className="absolute inset-0 size-full object-cover" />
                <span className="absolute top-1 left-1 rounded bg-black/60 px-1 font-mono text-[9px] text-white">
                  {i + 1}
                </span>
              </div>
              <p className="line-clamp-2 px-2 py-1.5 text-[11px] leading-4 text-ink2">{s}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
