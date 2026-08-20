import { toast } from 'sonner'
import PageHeader from '@/components/PageHeader'
import EmptyState from '@/components/EmptyState'
import { ModeChip, StatusBadge, TrackChip } from '@/components/badges'

function makeStub(title: string, description: string, designDoc: string) {
  return function StubPage() {
    return (
      <div>
        <PageHeader title={title} description={description} />
        <EmptyState
          title="页面建设中"
          description={`本页面为路由占位（stub），完整实现见设计文档 design/${designDoc}，由对应页面代理构建。`}
          actionLabel="查看演示反馈"
          onAction={() => toast.info(`${title}：页面 stub 已就位，等待页面代理实现`)}
        />
        <div className="mt-6 flex flex-wrap items-center gap-2 text-xs text-ink3">
          <span>共享组件预览：</span>
          <StatusBadge status="running" />
          <StatusBadge status="done" />
          <StatusBadge status="failed" />
          <TrackChip track="byok" />
          <TrackChip track="managed" />
          <ModeChip mode="static" />
          <ModeChip mode="i2v" />
        </div>
      </div>
    )
  }
}

export const DashboardPage = makeStub('总览', '积分/通道概览卡 + 任务表 + 项目列表 + 资料库计数', 'dashboard.md')
export const QuickPage = makeStub('快速生成', '文案来源 3 tab + 画面/配音/视频/成片设置 + sticky 操作条', 'quick.md')
// 已实现的独立页面在此转发导出，保持 App.tsx 路由契约稳定
export { default as TaskWizardPage } from '@/pages/TaskWizard'
export { default as ModelsPage } from '@/pages/Models'
export { default as TemplatesPage } from '@/pages/Templates'
export const ProductsPage = makeStub('商品库', '卡片网格 + CRUD + gen_count', 'products.md')
export const BenchmarksPage = makeStub('对标库', '手工录入表格 + R3 无抓取声明', 'benchmarks.md')
export const AssetsPage = makeStub('素材库', '三类筛选 + 上传 + 网格预览', 'assets.md')
export { default as PricingPage } from '@/pages/Pricing'
export { default as SettingsPage } from '@/pages/Settings'
