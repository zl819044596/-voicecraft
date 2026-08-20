# AI Video Studio — web (Next.js) Dockerfile. Multi-stage:
#   deps    — workspace-aware npm ci (includes @avs/shared)
#   builder — compile @avs/shared, then `next build` output:standalone
#   runner  — slim runtime, standalone server only

# syntax=docker/dockerfile:1

# ---------------------------------------------------------------- deps ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY api/package.json api/package.json
COPY render/worker/package.json render/worker/package.json
# 注意：不能用 `npm ci --workspaces` —— 该模式在 npm 10 下不装根包自身依赖
#（next/react 等），web 构建会 `next: not found`。普通 npm ci 全量安装根+workspaces。
RUN npm ci --no-audit --no-fund

# ------------------------------------------------------------- builder ----
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
# 根 package.json 必须进 builder：npm run build:shared 需解析 workspace 脚本。
COPY package.json package-lock.json ./
COPY packages/shared ./packages/shared
RUN npm run build:shared
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Public site URL — NEXT_PUBLIC_* is inlined at build time; used for canonical
# URLs, sitemap, robots and JSON-LD. Override via compose build arg / .env.
ARG NEXT_PUBLIC_SITE_URL=https://aivideostudio.app
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
RUN npm run build

# -------------------------------------------------------------- runner ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000
CMD ["node", "server.js"]
