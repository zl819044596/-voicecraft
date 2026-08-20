# PIPELINE_TASK_44 — 应用区加「回到首页」入口

## 背景

用户反馈：https://192.168.101.45/app 应用区内没有跳回 Landing 首页（/）的入口。
AppShell 侧栏 Logo 是普通 div（app/src/components/AppShell.tsx L196-199），点击无跳转。

## 任务

1. **AppShell.tsx**：
   - 侧栏顶部 Logo 区（L196-199）包成 `<Link to="/">`（react-router），点击回 Landing 首页
   - hover 效果（可选，与现有样式一致即可）
2. **可选**：侧栏导航加「首页/Home」项（放最顶上，icon=Home，to="/"）——如果用户更习惯导航项方式；
   但至少保证 Logo 可点
3. 验证：`cd app && npx tsc --noEmit` 绿 + `npx vite build` 绿
4. git add 仅限 app/src/components/AppShell.tsx（和相关文件），commit: feat(app): app shell logo links back to landing (PIPELINE_TASK_44)

## 坑
- 禁 git add -A；不碰 api/、PIPELINE_TASK_*.md
- 不部署（dist build 后 nginx 挂载自动生效）
- i18n：若加 Home 导航项，需要加 locales key（en: Home / zh: 首页）到 en.ts/zh.ts
