import { Outlet } from 'react-router'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'

/**
 * 通用页面骨架（Outlet 嵌套路由模式 — App.tsx 必须使用嵌套 <Route> 提供子页面）。
 * Navbar sticky top-0 处于正常文档流，内容槽无需补偿导航高度。
 */
export default function Layout() {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-canvas">
      <Navbar />
      <main className="flex flex-1 flex-col">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
