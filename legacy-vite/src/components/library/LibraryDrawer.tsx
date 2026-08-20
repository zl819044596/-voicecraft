import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'

/** 资料库统一的右侧 480px 新建/编辑 Drawer 外壳 */
export default function LibraryDrawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  onSave,
  saveLabel = '保存',
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  description?: string
  children: ReactNode
  onSave: () => void
  saveLabel?: string
}) {
  return (
    <Drawer direction="right" open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="w-full border-line bg-raised sm:max-w-[480px]">
        <DrawerHeader className="border-b border-line">
          <DrawerTitle className="font-display text-[17px] text-ink">{title}</DrawerTitle>
          {description && <DrawerDescription className="text-[13px] text-ink3">{description}</DrawerDescription>}
        </DrawerHeader>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">{children}</div>
        <DrawerFooter className="flex-row justify-end gap-2 border-t border-line">
          <Button
            variant="outline"
            className="border-line bg-transparent text-ink2 hover:bg-press hover:text-ink"
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button className="bg-brand text-white hover:bg-brand-strong" onClick={onSave}>
            {saveLabel}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

/** 表单字段包装：Label + 控件 + 可选提示 */
export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string
  hint?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block text-[13px] font-medium text-ink2">{label}</Label>
      {children}
      {hint && <p className="mt-1 text-xs text-ink3">{hint}</p>}
    </div>
  )
}
