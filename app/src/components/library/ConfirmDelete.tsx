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

/** 受控删除确认弹窗（design.md §5.4 ConfirmDialog：危险操作 --err 强调） */
export default function ConfirmDelete({
  open,
  onOpenChange,
  name,
  description,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  name: string
  description?: string
  onConfirm: () => void
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="border-line bg-raised">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-ink">删除确认</AlertDialogTitle>
          <AlertDialogDescription className="text-ink2">
            确定要删除「{name}」吗？
            {description ?? '此操作不可撤销（演示环境仅移除内存数据）。'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="border-line bg-transparent text-ink2 hover:bg-press hover:text-ink">
            取消
          </AlertDialogCancel>
          <AlertDialogAction className="bg-err text-white hover:bg-err/90" onClick={onConfirm}>
            删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
