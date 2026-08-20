# PIPELINE_TASK_43 — 清理 Models 页 i2v 分类入口

## 背景

阶段①已下线 i2v 流水线，但用户发现 Models（模型配置）页仍显示 i2v 分类
（Wan2.7-I2V / Kling 等条目 + "添加 i2v 配置"按钮）。本次彻底清理。

## 任务

### A. 前端移除 i2v 分类（app/src/components/models/）
1. `data.ts`：
   - `ProviderClass` 类型去掉 `'i2v'`（若 tsc 报错则同步调整引用）
   - `CLASS_META` 删除 i2v 条目
   - `CLASS_ORDER` 去掉 'i2v' → ['llm', 'image', 'tts']
   - `PRESETS` 删除 i2v 组
   - mock 数据（mc-i2v-kling 等 i2v 条目）删除
2. `ChannelCard.tsx`：删除 i2v 相关分支（139 行"添加 i2v 配置"等），泛化为 cls 通用
3. `Models.tsx`：删除 i2v 相关注释/场景注入（84 行 Kling 注入）
4. 其他文件若有 i2v UI 引用导致 tsc 错误，最小化处理（类型改为 string 或删除）

### B. 数据库清理（关键，需审批）
```sql
-- 禁用而非删除（历史任务可能引用 credential，删了会级联问题）
UPDATE model_configs SET enabled = false, updated_at = now() WHERE provider_class = 'i2v';
```
用 docker exec psql 执行（容器 ai-video-studio-postgres-1，用 $POSTGRES_USER/$POSTGRES_DB 环境变量）。

### C. 验证
1. `cd app && npx vite build` 绿（tsc 无错）
2. `cd app && npx tsc --noEmit` 绿
3. 数据库确认：`SELECT provider_class, count(*) FROM model_configs GROUP BY provider_class;` → 无 i2v enabled
4. git add 仅限 app/ 改动 + 提交（commit message: chore(app): remove i2v from Models page (PIPELINE_TASK_43)）
5. 不部署（构建产物 dist 由 nginx 挂载，build 后自动生效——但确认 dist 重新生成即可）

## 坑
- 禁 `git add -A`；不碰 api/、packages/、PIPELINE_TASK_*.md
- 不改 index.css 主题变量
- i2v 在非 Models 文件里的引用（badges/TaskTable/OverviewCards 等）是历史任务展示，**不要动**
- 若 ProviderClass 去掉 i2v 导致大量 tsc 错误，保留类型但 UI 隐藏（CLASS_ORDER 不含 i2v 即可）——优先保证构建绿
