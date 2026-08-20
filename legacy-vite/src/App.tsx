import { Navigate, Route, Routes } from 'react-router'
import Layout from '@/components/Layout'
import AppShell from '@/components/AppShell'
import Login from '@/pages/Login'
import Landing from '@/pages/Landing'
import Dashboard from '@/pages/Dashboard'
import QuickGenerate from '@/pages/QuickGenerate'
import TaskWizard from '@/pages/TaskWizard'
import Models from '@/pages/Models'
import Projects from '@/pages/Projects'
import Templates from '@/pages/Templates'
import Products from '@/pages/Products'
import Benchmarks from '@/pages/Benchmarks'
import Assets from '@/pages/Assets'
import Pricing from '@/pages/Pricing'
import Settings from '@/pages/Settings'

export default function App() {
  return (
    <Routes>
      {/* 门面页（Landing）— 营销落地页，自带 Navbar + Footer */}
      <Route path="/" element={<Landing />} />
      {/* 通用骨架（Navbar + Footer）— 登录页 */}
      <Route element={<Layout />}>
        <Route path="/login" element={<Login />} />
      </Route>
      {/* 工作台骨架（SidebarNav + Topbar + DemoConsole） */}
      <Route path="/app" element={<AppShell />}>
        <Route index element={<Dashboard />} />
        <Route path="quick" element={<QuickGenerate />} />
        <Route path="projects" element={<Projects />} />
        <Route path="tasks/:id" element={<TaskWizard />} />
        <Route path="models" element={<Models />} />
        <Route path="templates" element={<Templates />} />
        <Route path="products" element={<Products />} />
        <Route path="benchmarks" element={<Benchmarks />} />
        <Route path="assets" element={<Assets />} />
        <Route path="pricing" element={<Pricing />} />
        <Route path="settings" element={<Settings />} />
        {/* 旧路径重定向（阶段 E 页面改名：prompts → templates · billing → pricing） */}
        <Route path="prompts" element={<Navigate to="/app/templates" replace />} />
        <Route path="billing" element={<Navigate to="/app/pricing" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  )
}
