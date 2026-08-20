你正在 /Volumes/Data/GitHub/ai-video-studio 初始化一个完整的 AI 视频创作工作台项目骨架（全 Docker 自托管，不用 Cloudflare）。这是第一阶段：搭建能 `docker compose up` 跑起来的全栈骨架。

请执行：
1. 用 `npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm` 初始化 Next.js 项目（当前目录已空，含 3 个参考 md 文件）。
2. 安装核心依赖：next, react, react-dom；后端 API 相关用 Node 原生/轻量库，不在前端引。
3. 编写 `docker-compose.yml`，编排以下服务（全部用当前目录代码构建或官方镜像）：
   - `web`：Next.js 前端容器（Dockerfile，node:22-alpine，dev 或 build+start）
   - `api`：后端 API 容器（独立 Node 服务，源码放 `src/api/` 或 `api/`，Dockerfile）
   - `postgres`：postgres:16-alpine（BYOK Key 加密列 + 业务数据）
   - `redis`：redis:7-alpine（队列/任务编排）
   - `minio`：minio/minio（对象存储，素材/产物/导出 zip）
   - `render`：ffmpeg 渲染容器（Dockerfile 基于 linuxserver/ffmpeg 或 jrottenberg/ffmpeg，S7 静态合成）
   - `nginx`：nginx:alpine 反代（web + api，HTTPS 配置预留）
4. 每个服务配健康检查；postgres/redis/minio 用 volume 持久化；服务间同网络；环境变量集中在 `.env.example`。
5. 后端 API 用 Express（轻量），提供 `/health` 探活端点。前端 Next.js 首页先渲染一个能证明"前端↔后端↔postgres↔redis↔minio 连通"的状态页（调 /health，读 DB 连接状态）。
6. 所有 Dockerfile、entrypoint、配置放好，确保 `docker compose up --build` 能全部拉起来、健康检查通过。

注意：
- 这是阶段 0，先搭骨架和连通性，不实现业务功能（BYOK/合规/SEO 后续阶段）。
- 用 npm，不要用 pnpm/yarn/bun。
- 完成后用 `docker compose build` 验证镜像可构建，输出 docker-compose.yml 的 service 清单。
- 不要动目录里的 3 个 .md 参考文件。
