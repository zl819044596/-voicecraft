# AI Video Studio — api (Express + TypeScript) — built from repo root context.
# Multi-stage: deps (workspace-aware npm ci) → builder (compile @avs/shared + api)
# → runner (prod deps only + ffmpeg for L4 aspect crop + migrate entrypoint).

# syntax=docker/dockerfile:1

# ---------------------------------------------------------------- deps ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY api/package.json api/package.json
COPY render/worker/package.json render/worker/package.json
# 不能用 `npm ci --workspaces`（npm 10 不装根包自身依赖）；普通 npm ci 全量安装。
RUN npm ci --no-audit --no-fund

# ------------------------------------------------------------- builder ----
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
# 根 package.json 必须进 builder：npm run build:shared / build:api 解析 workspace。
COPY package.json package-lock.json ./
COPY packages/shared ./packages/shared
RUN npm run build:shared
COPY api ./api
RUN npm run build:api

# -------------------------------------------------------------- runner ----
FROM node:22-alpine AS runner
WORKDIR /srv/api
ENV NODE_ENV=production
ENV PORT=4000

# Production deps for api + shared only (workspace-aware install).
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY api/package.json api/package.json
COPY render/worker/package.json render/worker/package.json
# 国内网络下 dl-cdn.alpinelinux.org 吞吐被节流（apk 逐包下载极慢/卡死），
# 换阿里云镜像加速。仅构建期生效。注意：构建期 /etc/resolv.conf 只读，勿改。
RUN printf '%s\n' \
       'https://mirrors.aliyun.com/alpine/v3.24/main' \
       'https://mirrors.aliyun.com/alpine/v3.24/community' > /etc/apk/repositories \
  && npm ci --omit=dev --workspace=@avs/api --workspace=@avs/shared --no-audit --no-fund \
  && apk add --no-cache ffmpeg

# Compiled output + shared runtime + db migration assets.
COPY --from=builder /app/api/dist ./dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY api/db ./db
COPY api/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

EXPOSE 4000

# Non-root for container hardening (W6).
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs \
  && chown -R nodejs:nodejs /srv/api
USER nodejs

CMD ["sh", "entrypoint.sh"]
