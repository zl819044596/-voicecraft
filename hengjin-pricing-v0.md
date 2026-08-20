# 衡金定价校准 v0 — AI 视频工作台（分镜优先 / BYOK 双算力）

- 项目：storyboard-first AI video workbench（ai-video-studio 板）
- 阶段：03-pricing（T3 · 衡金）
- 日期：2026-08-08
- 角色：衡金（商业化 / 定价 / 支付转化 / 滥用风险）
- 状态：v0_calibrated_pending_review
- 上游：T2 PRD（t_e2e475dd，已 GC）+ 寻源事实核查（xunyuan-fact-check-v0.md）+ 本任务 body 竞品锚点

---

## 0. 一句话结论

本项目**不是纯 TTS/字符站**，而是「分镜优先的多步视频工作台」——成本大头是 **i2v 运镜 + 生图**（单条视频平台算力 $0.10~8，中值 ~$1.5），不是 TTS。核心差异化的 **BYOK 双算力免费档**（自带 Key 免费无限）让平台边际成本从「API 成本」降到「仅基础设施」——这是免费档能大方给、甚至能打「无限」而不破功的关键。**付费档不靠卖算力量，靠「托管算力便捷 + 商用授权 + 无水印 + 团队/API」收钱**，主攻服务客户、付费意愿更强的 freelancer。定价对标 Pictory/Descript/OpusClip，但凭 BYOK 无限 + 开放导出做出价格护城河。

---

## 1. 上游输入

- 输入文件/链接：
  - T2 PRD 元数据（positioning / 9-step pipeline / 开放导出 zip(MP4+JSON+素材包+SRT) / BYOK 双算力 / 4 项出海化）
  - 事实核查 xunyuan-fact-check-v0.md（竞品定价实采 + 破局对标拆解 + 单条视频成本待实测）
- 关键假设：
  - 单条 30-60s 视频平台算力成本：低 $0.10 / 中 $1.5 / 高 $8.0（i2v 是大头）— **待实测**
  - 托管 credit 成本 ≈ **$0.10 / credit**（含 i2v 加权）
  - 基础设施存储成本 ≈ R2 $0.02/GB·月；FFmpeg 合成为低耗
- 缺失信息（待确认）：
  - i2v / 生图 / TTS 上游 API 实际报价（fal.ai、Kling、Flux、ElevenLabs/OpenAI TTS）
  - 托管 compute 是否进入 MVP，还是首版只做 BYOK
  - 免费档是否强制登录（建议强制）

---

## 2. 成本模型

### 2.1 单条视频成本结构（平台托管 compute 口径）

| 环节 | 单条量级 | 成本 |
|---|---|---|
| LLM 脚本/分镜（DeepSeek/GPT） | ~$0.01-0.05 | 低 |
| 分镜生图（Flux/fal） | ~$0.03-0.10 × 5-10 张 = $0.15-1.0 | 中 |
| **i2v 运镜（Kling/fal）** | **$0.5-2 × 3-5 条 = $1.5-10** | **大头** |
| TTS（ElevenLabs/OpenAI） | ~$0.10-0.50 | 低 |
| FFmpeg 合成 | ~$0 | — |

> 事实核查 #2 估「单条 $0.1-1」偏乐观；加入 i2v 后中值上移到 ~$1.5。**这是本项目相对纯 TTS 站的最大成本差异，定价前必须实测上游报价**（否则 credit 定价会亏穿）。

### 2.2 双算力成本真相（核心洞察）

- **BYOK 算力**：用户自带 Key → 平台只做编排（排程 / FFmpeg / 存储）。平台边际成本 = **基础设施**，不是 API 成本。**API 超支由用户自己的 Key 兜底，平台 0 兜底。**
- **托管算力（credits）**：平台付 API 成本，用户按 credit 付费 → 这才是需要算毛利、防滥用、卡上限的口径。

→ 免费档「BYOK 无限」**可捍卫**：只要基础设施反滥用四条到位，无限不破功。

---

## 3. 竞品锚点（事实核查已实采，2026-08-08）

| 竞品 | 价格锚点 | 形态 |
|---|---|---|
| Creatify Pro | $99/月 · 300 credits · 带 API | ≈$0.33/credit，偏企业 |
| OpusClip | Free / $15 / $29 | 订阅 |
| Vizard | 7200-55200 credits/年 | 积分年包 |
| Descript | Free / $16 / $24 / $50 | 订阅 + 媒体小时 |
| Pictory | $25 / $35 / $119 | Script-to-Video，三档 |
| InVideo | 200+ 模板 · 积分制 | 订阅 |

**对照结论**：海外竞品（Creatify/OpusClip/Vizard）**均不做 BYOK 免费档、不做对标复刻**（事实核查 #15）。本项目用「BYOK 无限免费 + 开放导出」在免费档即打出结构性差异，付费档无需与 Creatify $99 拼算力单价——主攻 **$19/$49 订阅 + 团队/API**。

---

## 4. 套餐矩阵（v0）

单位：1 credit ≈ $0.10 平台托管算力成本。典型 storyboard 视频 ≈ 12-15 cr；含 i2v ≈ 25 cr。

| 档位 | 价格 | BYOK | 托管 credits | 并发 | 导出 | 商用/水印 | 模板 | 其他 |
|---|---|---|---|---|---|---|---|---|
| **Free** | $0 | 无限 | 0 | 1 | 开放·**带水印** | 非商用 | 5 | 3 项目上限 |
| **Pro Monthly** | $19/月 | 无限 | 25/月 | 3 | 开放·无水印 | **商用授权** | 全部 | 优先级队列 |
| **Pro Yearly** | $15/月($180/年) | 无限 | 25/月 | 3 | 开放·无水印 | 商用 | 全部 | 送 1 个月 |
| **Studio** | $49/月 | 无限 | 100/月 | 10 | 开放·无水印 | 商用 | 全部 | 3 席位·共享池·API·品牌套件·A/B 变体 |
| **Lifetime** | $199 一次性 | 无限 | 100/月 | 10 | 开放·无水印 | 商用 | 全部 | **限量前 500** |
| **Business/API** | Contact / Waitlist | — | — | — | — | — | — | 未实现不伪装可购买 |

### 成本验算（用满额度最坏情况）

| 档位 | 平台成本/月 | 毛利 |
|---|---|---|
| Free | ~$0.03（3 项目×0.5GB×$0.02） | 体验成本，1 万用户 ≈ $300/月，可控 |
| Pro M | 25cr×$0.10 = $2.50 | **86.8%** |
| Pro Y | 25cr×$0.10 = $2.50（收 $15/月） | 83.3% |
| Studio | 100cr×$0.10 = $10.00 | **79.6%** |
| Lifetime | 100cr×$0.10 = $10/月，5 年 $600 vs 收 $199 | 需限量 + 留存假设，风险中等 |

---

## 5. 设计理由（为什么这么定）

1. **Free = BYOK 无限 + 开放导出（带水印）**：这是本项目的获客钩子与差异化。BYOK 让平台边际成本趋零，所以免费档可以「无限」——但必须：
   - **必须登录**（否则无法做 entitlement 记账，无法限并发）
   - 项目数上限 3（卡存储）
   - 并发上限 1（卡 FFmpeg/队列资源）
   - 导出 MP4 带水印 → **商用授权是无水印 Pro 的第一升级钩子**
2. **付费不卖算力量，卖「托管便捷 + 商用授权」**：服务客户的 freelancer 交付物必须无水印 + 可商用，这是刚需；不想自管 Key 的用户买托管 credits 省事。所以 Pro $19 无需与 Creatify $99 拼 credits 单价。
3. **Pro $19 给 25 托管 credits 够用**：典型 freelancer 主力走 BYOK 无限，托管 credits 只是便捷批次（≈1-2 条 i2v 视频），成本 $2.50 毛利 87%。升级钩子不在 credits 量，在商用授权。
4. **Studio $49 = 团队形态**：服务客户的 freelancer 常 2-5 人小团队，3 席位 + 共享 credit 池 + API 是真实付费场景，毛利 80%。
5. **Lifetime $199 限量 500**：沿用 voiceover/video-to-blog 裁决口径——「月额度终身」非无限，限量控 MRR 稀释。因托管成本高（$10/月）与纯 TTS 站不同，**风险中等，必须限量 + 明确 100cr/月不是无限**。
6. **Business/API 只放 Contact/Waitlist**：本阶段未实现就不伪装可购买（铁律）。

---

## 6. 支付与转化路径

- **支付商**：Creem（3.9% + $0.40/笔，MoR 含全球税务合规）——用户 voiceover-ai 已在用，账号可复用。备选 Lemon Squeezy（5%+$0.50）。
- **checkout 形态**：
  - Free → 登录即用（BYOK 填 Key），0 元 checkout
  - Pro/Studio/Lifetime → 标准 SaaS 在线 checkout（Creem Product）
  - Business/API → **Contact / Waitlist**，走人工开通，不伪装可购买
- **转化口径**：定价页先讲「BYOK 免费无限 + 开放导出」的价值与适用人群（服务客户的 freelancer），再讲价格；CTA 与真实路径一致。
- **升级触发场景**：交付客户要无水印商用 → Pro；2-5 人小团队共享 → Studio；重度但不想管 Key → 托管 credits。

---

## 7. 额度与限制（后端 entitlement 建议）

```ts
export const plans = {
  free:     { price:0,  byok:true, managedCredits:0,   maxConcurrent:1,  projects:3,  watermark:true,  commercial:false, templates:5,     seats:1 },
  pro_m:    { price:19, byok:true, managedCredits:25,  maxConcurrent:3,  projects:Infinity, watermark:false, commercial:true,  templates:"all", seats:1 },
  pro_y:    { price:15, byok:true, managedCredits:25,  maxConcurrent:3,  projects:Infinity, watermark:false, commercial:true,  templates:"all", seats:1 },
  studio:   { price:49, byok:true, managedCredits:100, maxConcurrent:10, projects:Infinity, watermark:false, commercial:true,  templates:"all", seats:3, api:true },
  lifetime: { price:199,byok:true, managedCredits:100, maxConcurrent:10, projects:Infinity, watermark:false, commercial:true,  templates:"all", seats:1, limit:500 },
  business: { price:0,  contact:true }, // Waitlist, 未实现
}
```

**后端必须执行（P0，防滥用 + 防亏穿）**：
1. 统一计费单位 = **托管 credits**（BYOK 不计入，只限并发/项目/水印）
2. 服务端记账：KV/DB 记 `usage:{user_id}:{yyyy-mm}` 的托管 credit 消耗，**不是前端 localStorage**
3. BYOK：校验 Key 有效 + 限并发（KV 原子计数），API 超支用户自担
4. 托管：JWT 鉴权 → 单次 credit 上限（卡 i2v 打满）→ 月度累计额度（卡总成本）→ 水印/商用 flag
5. 免费档强制登录（否则限并发无解）

---

## 8. 待确认项（不能编造）

1. **[待实测·BLOCKED级]** i2v(Kling/fal)/生图(Flux)/TTS(ElevenLabs/OpenAI) 上游实际报价——决定 credit=$0.10 假设是否成立，**不实测不能冻结 credit 定价**
2. [待确认] 托管 compute 是否进入 MVP，还是首版只做 BYOK（若只做 BYOK，Pro 无托管 credits，定价结构要改）
3. [待确认] 免费档是否强制登录（强烈建议强制）
4. [待确认] 目标市场确认英文美元定价（freelancer 主战场 US）
5. [待确认] 支付商最终选 Creem（复用 voiceover 账号）还是另开

---

## 9. 验收清单自检

- [x] 价格有竞品锚点（Creatify/OpusClip/Vizard/Descript/Pictory 实采）
- [x] 成本模型：Free 可控，Pro/Studio 毛利 79-87%
- [x] 免费额度能体验价值（BYOK 无限）且不亏穿（只承担基础设施）
- [x] 无 "unlimited" 误导：BYOK 无限是用户自付 Key 可捍卫；托管 credits 全部有上限
- [x] Lifetime 有边界（100cr/月，非无限）+ 限量
- [x] CTA 与真实开通路径一致（Business 走 Contact/Waitlist）
- [ ] 上游 i2v/生图/TTS 成本未实测（P0 阻塞冻结 credit 定价）
- [ ] 后端记账/并发/水印未落地（P0，交开发）

---

## 10. 下游交接

- **给文案**：定价页按第 4 节矩阵；主文案「BYOK：自带 Key 免费无限 · 开放导出 MP4+JSON+素材包+SRT」；对标话术「vs Creatify $99/300cr、Pictory $35」。
- **给后端**：第 7 节 entitlement 字段 + 防滥用 P0（服务端记账 / 并发原子计数 / 单次 credit 上限 / 免费档强制登录）。
- **给 QA**：验证 BYOK 用户 Key 超支不影响平台；免费用户 3 项目/1 并发边界；托管 credit 月度用尽拒绝；水印按档位。
- **给守衡**：审 8 项待确认，尤其上游成本实测 + 托管 compute 是否进 MVP。
