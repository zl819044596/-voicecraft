# AI Video Studio — Task 5: B 阶段增强（多模型切换 + Credit 预估 + 成本可视化 + 分镜可视化）

> 执行者：Claude Code。项目根目录：/Volumes/Data/GitHub/ai-video-studio
> 当前状态：Stage 0-5b + Task 3 假登录 + Task 4 i2v 完成（7 服务 healthy）。
> 本阶段只做：**development-spec-v1.md B 部分 4 项增强**（用户指示 2026-08-08：都要实现）。

## 前置事实（2026-08-08 实测）
- wingray 本项目可用模型：LLM=`DeepSeek-V4-Flash-0731`、生图=`Z-Image-Turbo`（Qwen-Image/Qwen-Image-Plus **未部署**）、TTS=`cosyvoice-v2`（预置音色）、i2v=`Kling-V1-6-I2V`（T2V 未部署）
- 定价参考（wingray 文档价格页，实现成本可视化用；不确定的价格标注 TODO 由调度方确认）：
  - DeepSeek-V4-Flash-0731：约 ¥0.6/M input + ¥2/M output（参考，标注为估算）
  - Z-Image-Turbo：按张计价（参考，估算）
  - cosyvoice TTS：按字符/音频时长计价（参考，估算）
  - Kling-V1-6-I2V：按条/时长计价（参考，估算）
  - **实现方式**：成本表放 `api/src/config/costs.js`（常量 JSON，按模型/单位定价），估算 = 用量×单价；标注 "estimated cost" 而非真实扣费

## 必须遵守（老规矩）
1. **不要 `docker compose down`**。完成后 `docker compose up -d --build` 重建相关服务，验证。
2. **不留孤儿容器**：`docker compose ps` 必须恰好 7 个服务，`ai-video-studio-` 前缀。
3. **R1 红线**：key 只在后端解密进程内；错误消息通用无 key。
4. 访问 https://localhost + `--noproxy '*'`。
5. 写前先读：`api/src/routes/tasks.js`（config 结构/校验）、`api/src/steps/s3.js`（分镜 JSON 结构）、`api/src/steps/s4.js`/`s7.js`（模型调用点）、`api/src/providers/wingray.js`（model 常量）、前端 `/app` 工作台页面（src/app/app/ 或对应目录）、`src/app/app/projects/[id]/`（详情页）。

## 任务清单

### 1. 多模型切换（task.config.model_override）
- task.config 加 `model_override: { llm?: string, image?: string, tts?: string, i2v?: string }`
- 各 step（S2/S3 LLM、S4 生图、S5 TTS、S7 i2v）读取对应 override，**空则用默认**（wingray 默认模型）
- 前端工作台创建任务处：每个生成类别下拉选模型（只列**本项目已部署可用**的：LLM=DeepSeek-V4-Flash-0731；生图=Z-Image-Turbo；TTS=cosyvoice-v2；i2v=Kling-V1-6-I2V；每类还可留 "Auto (default)"），存进 model_override
- **模型名白名单校验**（后端）：override 的模型名必须在白名单内，否则 400 或忽略回默认（防注入/无效名）
- 效果：S4 生图用 override.image 的模型（当前只有一个可用，但代码路径完整支持多模型）

### 2. Credit 预估（"Know Before You Generate"）
- 前端创建任务时（/app 工作台），根据已选模型 + 预估用量（分镜数估算：文案长度→分镜数→生图数/配音段/i2v 条数），**显示预计消耗**：预计生图 X 张、配音 Y 段、i2v Z 条、预估耗时
- 免费档（BYOK）显示 "Your keys — estimated ~$X.XX"；付费档（未接 Creem，预留）显示 "N credits"（credit 系统后置，字段预留）
- 后端：task.config 存 `cost_estimate`（JSON，预估明细）作为记录

### 3. BYOK 成本可视化
- 任务完成后（详情页），按实际用量显示各 API 调用成本明细：LLM tokens（input/output）、生图张数、TTS 字符数/时长、i2v 条数，各乘单价得估算成本，总计 "Estimated API cost: ~$X.XX"
- 数据来源：step_results payload（每步记录用量：LLM usage tokens、生图 count、TTS chars、i2v count）——**现有 step 需在 payload 里记 usage**（S2/S3 记 tokens、S4 记 count、S5 记 chars、S7 记 i2v count；mock 模式记 mock 用量或 0）
- 前端任务详情页渲染成本卡片（估算，标注 "estimates only, actual billing by your providers"）

### 4. 分镜可视化（时间线/卡片，V2 简版）
- /app/projects/[id] 任务详情页：9 步时间线卡片（现有）升级为**分镜卡片列表**：S3 完成后展示每镜卡片（镜号/画面描述/配音文本/时长/状态缩略图——S4 后显示生图、S7 后显示片段）
- 每张卡片可点开详情（prompt 全文/音频播放/图片大图）
- **拖拽调序（简版）**：S3 完成后（S4 未开始或失败前）允许拖拽调整分镜顺序 → 保存 task.config.storyboard_order（数组=新顺序）→ 提示"re-run from S4 to apply"；重跑时 S4-S9 按新顺序执行（S3 的 JSON 顺序重排）
- 拖拽用现有依赖（若项目已有 dnd 库用之，没有则用 HTML5 drag/drop 简版，不新装重型依赖）

## 验证（必须真实执行并贴证据）
1. `docker compose up -d --build` → 全 healthy
2. 创建任务带 model_override（image=Z-Image-Turbo）→ 任务 config 正确存储；非法模型名 → 忽略/400
3. 创建任务页显示 cost_estimate 预估（curl 或页面证据）
4. 跑一个 mock 任务 → 详情页成本卡片渲染（估算值合理）；step payload 含 usage
5. 分镜卡片 + 拖拽调序：S3 done 后调序 → storyboard_order 保存 → 重跑按新序（mock 验证产物顺序）
6. `docker compose ps` 恰 7 服务无孤儿
7. 无 key 泄露（grep 日志）

## 输出格式
- 改动/新增文件清单（绝对路径）
- 各增强实现说明（model_override 流程/cost 表/用量记录/分镜调序）
- 验证 1-7 证据
- 遗留事项
