# PIPELINE_TASK_36: 配音两个问题修复 —— ①TTS长文本被静默截断 ②拆镜切分点不连贯

## 背景（2026-08-14 用户反馈 + 实测定位）

用户反馈：1) 每个镜头间的配音词连贯性不强；2) 合成的语音没有全部播完。

### 问题①：bytedanceTTS 长文本被提前截断（实测实锤）

- 位置：`api/src/providers/runtime.ts` bytedanceTTS（约 :546-554）：
  ```
  // 音频静默超过 4s → 发 finish_session，1.5s 后强制收尾（不等服务器确认）
  const idleTimer = setInterval(() => {
    if (settled) return;
    if (audioBytes > 0 && Date.now() - lastAudioAt > 4000) {
      try { ws.send(frame(102, sid, {})); } catch { /* noop */ }
      clearInterval(idleTimer);
      setTimeout(() => finish(null, Buffer.concat(chunks)), 1500);
    }
  }, 1000);
  ```
- **bug**：火山 seed-tts 长文本（如 165 字）流式合成时，服务端句间处理停顿可能 >4s，客户端误判"合成结束"→ 主动 finish_session + 1.5s 后强制收尾 → **音频尾部被硬切**。
- **实测证据**（任务 67e9607d，16 镜全中招）：所有 vo-*.mp3 最后 100ms RMS 仍有 32-47dB（说话中途），正常完整句尾应衰减到 <-40dB；尾部 500ms 也全在 43-67dB。时长 vs 字数明显偏短（165字→31.6s，正常应 ~40s+）。
- **修复方向**：4s 静默阈值太激进。建议：
  1. 把静默阈值提高到 20s（长文本句间停顿上限）；或
  2. 更稳妥：**不再用 idleTimer 主动截断**，只依赖 SessionFinished/ConnectionFinished 事件（:610-624 已有处理）+ TTS_TIMEOUT_MS 90s 总超时兜底。保留"无任何音频时超时"保护。
  - 选方案 2（事件驱动收尾最可靠）：删除 idleTimer 主动截断逻辑，保留 90s 总超时；SessionFinished 事件到达才 finish。若担心服务端不发 finish 事件导致挂满 90s，可保留 idleTimer 但阈值提到 25s 且触发前先发 finish_session 等 3s 确认（服务端正常会发完剩余帧）。
- 同时检查 `api/src/providers/runtime.ts` wingray synthesizeTts 是否有类似静默截断（用户后续可能切 wingray 音色）。

### 问题②：L3 拆镜切分点把语义连贯句子切断（影响配音词连贯性）

- 位置：`api/src/pipeline/steps/l3.ts` v2 确定性拆镜（:104-126）。
- 现状：按 `[。！？；!?;]` 句界切分后，每 `per` 句合并一镜。**不感知语义承接**：
  - shot4 结尾"可曹操没有怨天尤人。" + shot5 开头"更没有追究谁的责任"（"更"承接上文，作为新镜开头突兀）；
  - shot7 结尾"果断选择了小路。" + shot8 开头"为什么？因为他判断对手很可能故意在小路制造假象"（"为什么"承接上文选小路的原因，独立成镜怪异）。
- **修复方向**：拆镜时把"承接句"并入上一镜——正则识别以承接词开头的句子（更/而/但/却/也/所以/因此/于是/就这样/为何/为什么/接着/随后/然后/结果/最终/终于/因为/由于/虽然/尽管/不过/然而/幸而/恰巧 等），若某句以承接词开头且上一镜内容非空，则将其并入上一镜（而不是作为新镜开头）；下一镜从下一个非承接句开始。保持逐字拼接守恒不变（总字符数必须等于原文）。
- 注意：15-18 镜目标仍要尽量满足；若承接句并入导致镜数不足，可在剩余句界处再切分（保持句界内完整）。

## 修改点

1. `api/src/providers/runtime.ts` — bytedanceTTS 收尾逻辑（问题①）。
2. `api/src/pipeline/steps/l3.ts` — 拆镜承接句并入上一镜（问题②）。

## 验证（必须全部通过）

1. `cd api && npm run build` 通过。
2. `docker compose up -d --build api`（background=true；不要 docker compose down）。
3. 问题①验证：重跑 L6（POST /api/tasks/:id/rerun {"from_step":6,"scope":"step"}，任务 67e9607d-fe0f-4245-ac52-5c8739a88c29，cookie avs-test-1786603871）→ 新 vo-*.mp3 尾部 100ms RMS 应 < -35dB（句子自然说完）；165 字镜时长应明显 > 之前 31.6s。用 api 容器内 ffprobe + node 脚本检查（参考命令：ffmpeg -y -i vo.mp3 -ar 24000 -ac 1 -f s16le raw；node 算最后 100ms RMS）。
4. 问题②验证：重跑 L3（rerun from_step=3）→ storyboard.json 每镜开头不应是承接词（更/而/但/为什么 等）；总字数守恒（16 镜拼接 == L2 口播）。
5. git commit 分两个（runtime.ts / l3.ts 分开）：`fix(api): bytedance tts no longer hard-cuts long text on 4s audio idle (event-driven finish)` 和 `fix(api): L3 split merges continuation sentences into previous shot (cohesion)`。不要 push。

## 硬性要求

只改上述 2 个文件；不重构；不 push；不 docker compose down；不改任务卡外文件。完成后 read_file 自证 + 报告验证数据（新旧时长/尾部 RMS 对比表、L3 承接句检查、总字数守恒、commit hash）。
