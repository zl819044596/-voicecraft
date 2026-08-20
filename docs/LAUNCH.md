# AI Video Studio — 上线指南（最小可上线）

混合部署：**Vercel（Next.js + 硅基 API）** + **Docker（FFmpeg 合成）**。

## 架构

```
用户 → Vercel (Next.js)
         ├─ /app/tools/*     工具页（需 Google 登录）
         ├─ /api/ai/*        硅基流动代理 + 免费额度
         ├─ /api/auth/*      Google OAuth 会话
         └─ /api/compose  ──→  VPS Docker :4002 (FFmpeg)
```

## 登录（当前）

默认 **`AUTH_MODE=fake`**：`/login` 点「演示登录」即可进工作台，不需 Google。

上线接真登录时：

1. 配好 `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
2. 设 `AUTH_MODE=google`
3. 登录页改回 Google 按钮（代码已在 `/api/auth/google*`）

## 1. 本地跑通

```bash
# 环境变量
cp .env.example .env
# 填入 SILICONFLOW_API_KEY / PEXELS_API_KEY / SESSION_SECRET
# 填入 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
# NEXT_PUBLIC_SITE_URL=http://localhost:3000

# FFmpeg 合成
docker compose -f docker-compose.dev.yml up -d compose

# 前端
npm install
npm run dev
```

打开 http://localhost:3000 → Login（Google）→ `/app`。

### Google Cloud 配置

1. 创建 OAuth 客户端（Web）
2. 授权重定向 URI：`http://localhost:3000/login` 与生产 `https://你的域名/login`
3. 把 Client ID / Secret 写入 `.env` / Vercel 环境变量

## 2. 部署 Vercel

1. 导入本仓库到 Vercel
2. Root Directory：仓库根目录
3. 环境变量（Production）：

| 变量 | 说明 |
|------|------|
| `SILICONFLOW_API_KEY` | 必填 |
| `LLM_MODEL` / `IMAGE_MODEL` / `TTS_MODEL` | 硅基实际模型名 |
| `PEXELS_API_KEY` | 推荐 |
| `SESSION_SECRET` | 随机长串 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | 必填 |
| `FREE_DAILY_QUOTA` | 默认 30 |
| `COMPOSE_SERVICE_URL` | 公网可达的合成服务，如 `https://compose.example.com` |
| `COMPOSE_SERVICE_SECRET` | 与 compose 容器相同的 Bearer 密钥（推荐） |
| `NEXT_PUBLIC_SITE_URL` | 正式域名，如 `https://aivideostudio.app` |

4. Deploy

## 3. 部署 FFmpeg 合成（任意 VPS）

```bash
# 建议设置共享密钥（与 Vercel 环境变量一致）
export COMPOSE_SERVICE_SECRET=请换成长随机串

docker compose -f docker-compose.dev.yml up -d compose
# 建议前面加 nginx/Caddy，HTTPS 反代到 127.0.0.1:4002
```

把公网 URL 填到 Vercel 的 `COMPOSE_SERVICE_URL`，并把同一密钥填到 `COMPOSE_SERVICE_SECRET`。

成片接口返回 **MP4 二进制**（浏览器 blob 下载），不再塞巨大 base64 JSON。

## 4. 免费额度（上线后接支付）

| 操作 | 消耗 |
|------|------|
| 脚本 | 1 |
| 分镜 | 2 |
| 生图 | 3 |
| TTS | 2 |
| 合成 | 5 |
| 字幕 / Pexels | 0 |

每日 `FREE_DAILY_QUOTA`（默认 30）用尽返回 402。支付（Creem/Stripe）后续再接。

## 5. 验收清单

- [ ] Google 登录成功，cookie `avs_session` 存在
- [ ] `/app` 未登录会跳 `/login`
- [ ] 脚本 / 分镜 / 生图 / TTS 可用
- [ ] 分镜可编辑、重试、上传、Pexels 兜底
- [ ] `docker compose … compose` 健康检查 OK，一键出片出 MP4
- [ ] 额度用尽提示清晰
- [ ] `npm run build` 通过

## 6. 刻意未做（后续）

- 邮箱魔法链接
- 付费 / Stripe / Creem 计量
- 音色试听、转场与字幕样式增强
- 营销 SEO 工具页深度改写
