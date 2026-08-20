import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'framer-motion'
import { TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const CONFIRM_EMAIL = 'ken@studio.com'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** 进行中订阅（mock Pro 态）→ 警告并禁用删除 */
  hasSubscription: boolean
  /** real 模式：确认邮箱 = 当前登录邮箱（GET /api/auth/me） */
  confirmEmail?: string | null
  /** real 模式：DELETE /api/account（body.confirm_email 必须匹配） */
  real?: boolean
  onDelete?: (email: string) => Promise<void>
}

/** 删除账号强确认 Dialog（settings.md §5，AC1）：邮箱匹配才可删除 */
export default function DeleteAccountDialog({
  open,
  onOpenChange,
  hasSubscription,
  confirmEmail,
  real,
  onDelete,
}: Props) {
  const [email, setEmail] = useState('')
  const [leaving, setLeaving] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (open) setEmail('')
  }, [open])

  const expected = real && confirmEmail ? confirmEmail : CONFIRM_EMAIL
  const matched = email.trim().toLowerCase() === expected.toLowerCase()
  const canDelete = matched && !hasSubscription

  const confirmDelete = async () => {
    if (!canDelete) return
    onOpenChange(false)
    setLeaving(true)
    if (real && onDelete) {
      try {
        await onDelete(email.trim())
        navigate('/login')
        toast.success('账号已删除 · 会话已注销')
      } catch (e) {
        setLeaving(false)
        toast.error(e instanceof Error ? e.message : '删除失败')
      }
      return
    }
    // 全屏过渡（fade 到黑 + Logo）→ 跳 /login
    window.setTimeout(() => {
      navigate('/login')
      toast.success('账号已删除（模拟）· 演示数据已重置')
      window.setTimeout(() => setLeaving(false), 400)
    }, 1100)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="border-line bg-surface sm:max-w-md">
          <motion.div initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', duration: 0.3 }}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-err">
                <TriangleAlert className="size-5" /> 确认删除账号？
              </DialogTitle>
              <DialogDescription className="text-ink3">此操作不可撤销</DialogDescription>
            </DialogHeader>

            <ul className="mt-3 flex flex-col gap-1.5 rounded-md border border-line bg-raised p-3 text-[13px] leading-5 text-ink2">
              <li>将删除：</li>
              <li>· 6 个任务</li>
              <li>· 2 个项目</li>
              <li>· 4 类通道配置与凭证</li>
              <li>· 积分账户与流水</li>
            </ul>

            {hasSubscription && (
              <p
                className="mt-3 rounded-md p-2.5 text-[13px] font-medium"
                style={{ color: 'var(--managed)', background: 'rgba(251,191,36,.08)', border: '1px solid rgba(251,191,36,.3)' }}
              >
                存在进行中订阅 · 请先取消订阅
              </p>
            )}

            <div className="mt-4">
              <p className="mb-1.5 text-[13px] text-ink2">
                输入你的邮箱 <code className="font-mono text-ink">{expected}</code> 以确认
              </p>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={expected}
                className="border-line bg-raised font-mono text-[13px] text-ink"
                autoComplete="off"
              />
            </div>

            <DialogFooter className="mt-5">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button
                type="button"
                disabled={!canDelete}
                onClick={confirmDelete}
                className={cn(
                  'transition-colors duration-200',
                  canDelete ? 'bg-destructive text-white hover:bg-destructive/90' : 'bg-press text-ink3',
                )}
              >
                永久删除
              </Button>
            </DialogFooter>
          </motion.div>
        </DialogContent>
      </Dialog>

      {/* 全屏过渡：fade 到黑 + Logo */}
      <AnimatePresence>
        {leaving && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45 }}
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-black"
          >
            <img src="/logo.svg" alt="" className="size-12" />
            <p className="font-mono text-xs text-ink3">deleting account…</p>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
