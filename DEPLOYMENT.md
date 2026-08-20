# AI Video Studio — 部署上线手册（D6 / W6 / T11 · R6）

本手册覆盖：nginx HTTPS 收尾之后从「本地可跑」到「公网可访问」的全部步骤。
对应 PRD v3 §14 R6（部署安全红线）与 U10 验收。

---

## 0. 现状（D6 完成时）

- nginx 已支持 HTTPS：443 TLS 终结 + 80→443 强制跳转 + ACME webroot + HSTS/CSP 等安全头
- compose 已发布 80/443，其余 6 个容器不出公网（R6）
- certbot 一次性服务（profile: certbot）+ 签发/续期/备份/部署脚本齐备
- 本地验证：自签证书下 HTTPS 200、HTTP→301、/api/health 200 全通过

## 1. 前置决策（需阁主拍板，PRD §1 域名待定）

| 项 | 状态 | 说明 |
|---|---|---|
| 域名 | ❌ 待定 | ⚠️ 代码占位 aivideostudio.app **非本站所有**（2026-08-08 实测：他人注册，指向 Cloudflare 默认停放页，不在本站 CF 账号）。PRD 候选：storyboardvideo.ai **未注册（可买）**；framecraft.ai 已停放（Afternic，不可用）。本站已有域名：chinaiapi.com / getfitai.io（CF 账号内，可开子域如 avs.getfitai.io，voiceover 即此模式） |
| 服务器 | ❌ 无 | 推荐海外 VPS（产品面向海外用户）。2026-08-08 实测家中 Mac 公网 80/443 外部不可达（check-host.net 6 节点 refused/timeout，CGNAT 或 ISP 封端口）→ 直接 A 记录指家里不可行，必须 VPS 或隧道 |
| DNS | 待定 | 域名 A 记录 → VPS 公网 IP（TTL 300 起）；若用隧道则 CNAME 到隧道端点 |

> 域名定下后：D6 收尾即「改 .env 三处 + 跑两个脚本」即可上线（见 §4）。⚠️ `.env` 的 `NEXT_PUBLIC_SITE_URL` 目前默认 `https://aivideostudio.app`（他人域名），上线前必须改为真实域名并重建 web 镜像（canonical/sitemap/robots 引用它）。

## 2. 服务器准备（R6 安全加固清单）

```bash
# 1) SSH 加固：仅密钥登录、禁 root 密码
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
sudo systemctl restart sshd

# 2) 防火墙：只开 22/80/443
sudo ufw default deny incoming && sudo ufw default allow outgoing
sudo ufw allow 22/tcp && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
sudo ufw enable

# 3) 自动安全更新
sudo apt update && sudo apt install -y unattended-upgrades

# 4) Docker + Compose 插件
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"
```

## 3. 首次部署（域名 + 服务器就绪后）

```bash
# 1) 取代码
git clone <repo> ai-video-studio && cd ai-video-studio

# 2) 环境变量（必改）
cp .env.example .env
#    POSTGRES_PASSWORD / REDIS_PASSWORD / MINIO_ROOT_PASSWORD：openssl rand -hex 32
#    ENC_KEY：openssl rand -hex 32（BYOK 主密钥，R1；务必单独备份！）
#    DOMAIN=你的域名
#    ACME_EMAIL=你的邮箱
#    NEXT_PUBLIC_SITE_URL=https://你的域名

# 3) 启动 + 自签证书兜底
./scripts/deploy.sh

# 4) 签发真证书（Let's Encrypt；需 80 公网可达）
./scripts/issue-cert.sh      # 读 .env 的 DOMAIN/ACME_EMAIL

# 5) 重建 web 镜像使 NEXT_PUBLIC_SITE_URL 生效（canonical/sitemap 用真域名）
docker compose build web && docker compose up -d web
./scripts/deploy.sh          # 再跑一遍全套验证
```

## 4. 域名变更只需改三处

1. `.env`：`DOMAIN=` / `ACME_EMAIL=` / `NEXT_PUBLIC_SITE_URL=`
2. 重新签发：`./scripts/issue-cert.sh`（自动覆盖 ./certs/fullchain.pem）
3. 重建 web：`docker compose build web && docker compose up -d web`
（nginx 配置本身域名无关：`server_name _` + `$host` 跳转，无需改配置）

## 5. 续期（Let's Encrypt 90 天）

```bash
./scripts/renew-cert.sh    # 手动
# 或 cron：30 3 * * 1  cd /path/ai-video-studio && ./scripts/renew-cert.sh >> backups/renew.log 2>&1
```

## 6. 备份与恢复（R6）

```bash
./scripts/backup.sh        # pg_dump + MinIO mirror + Redis rdb，保留 14 份
# cron：0 3 * * *  cd /path/ai-video-studio && ./scripts/backup.sh >> backups/backup.log 2>&1
```

恢复演练（上线前必须过一次）：
- PostgreSQL：`gunzip -c backups/pg/<ts>.sql.gz | docker compose exec -T postgres psql -U avs ai_video_studio`
- MinIO：`docker compose run --rm -v $PWD/backups/minio:/backup minio/mc ... mirror /backup/<ts>/ local`
- ⚠️ `ENC_KEY` 不在备份里 —— 丢失则 BYOK 密文不可解，须与备份分开存放（密码管理器）

## 7. U10 / R6 验收清单（上线 Gate）

```bash
# 公网 HTTPS（域名解析后）
curl -sI https://<域名>/ | head -5                 # 200 + HSTS
curl -sI http://<域名>/  | head -3                  # 301 → https
curl -s  https://<域名>/api/health                  # {"ok":true} 类
# 证书有效
echo | openssl s_client -servername <域名> -connect <域名>:443 2>/dev/null | grep -E "Verify return code"
# 端口隔离：仅 80/443 公网暴露
sudo ss -tlnp | grep -E ':(80|443)'                # 其余服务无公网监听
docker compose ps                                   # 7 服务 healthy
```

- [ ] TLS 证书有效（非自签），HTTP→HTTPS 强制跳转
- [ ] HSTS / X-Content-Type-Options / X-Frame-Options / CSP 头存在
- [ ] 公网仅暴露 80/443；PostgreSQL/Redis/MinIO/render 不出公网
- [ ] 密钥仅 .env / 环境变量，未入代码/镜像/日志（R1 已验，部署后复验一次）
- [ ] 备份 cron 已挂 + 恢复演练通过（含 ENC_KEY 单独备份）
- [ ] 服务器 SSH 密钥登录、防火墙 22/80/443、自动更新
- [ ] NEXT_PUBLIC_SITE_URL 为真域名（sitemap/robots/canonical 检查）

## 8. 本地开发模式（无域名/无公网）

```bash
./scripts/ensure-certs.sh    # 自签证书（10 年，仅本地）
docker compose up -d --build
# https://localhost/  （浏览器提示证书不受信任属预期，curl 加 -k）
```

## 9. 常见问题

- **nginx 起不来（cannot load certificate）**：先跑 `./scripts/ensure-certs.sh`；./certs 必须含 fullchain.pem + privkey.pem
- **改了代码但行为没变**：必须 `docker compose up -d --build`（旧镜像不重建会静默跑老代码）
- **证书签不下来（Timeout/Invalid response）**：确认域名 A 记录已指向本机公网 IP、80 端口公网可达（ufw/云安全组）、DNS TTL 已生效
- **换域名后 canonical 仍是旧域名**：web 镜像需带新 NEXT_PUBLIC_SITE_URL 重建（§4）
