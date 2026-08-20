# PIPELINE_TASK_19: 修复 TTS 音色预设（中文显示名 → wingray 真实音色 id）

## 背景与根因（听潮已实测确认，直接按此修复）

- 在 api 容器内用数据库中解密出的真实 wingray key 实测 `POST /api/open-apis/projects/easyllms/voice/synthesize-audio`：
  - `voice: 'longjiqi'` → HTTP 200 + 17947 字节音频 ✅
  - `voice: '中文女声-温暖'` → HTTP 200 + **0 字节** ❌（静默失败，wingray 不认中文显示名）
  - 无 voice（缺省）→ HTTP 200 + 17947 字节 ✅
- **根因**：TTS 预设里 voice 用了中文显示名，wingray 只认音色 id（`longjiqi` 等）。
- 涉及两处：
  1. `app/src/components/models/data.ts` — wingray-tts 预设 `voice: '中文女声-温暖'`
  2. `packages/shared/src/providers.ts` — PRESETS 里 wingray-tts 的 `voices: { zh: ['中文女声-温暖', '中文男声-沉稳'], en: [...] }`

## wingray 真实音色 id（voiceover 项目实测在用，全部有效）

- 男声：`longgaoseng`（旁白）、`longanlang`（阳光）、`longjiqi`（通用）、`longyingxiao`（权威）、`longhouge`（深沉）、`longjixin`（活力）
- 女声：`longyumi_v2`（甜美）、`longxiaochun_v2`（活泼）、`longxiaoxia_v2`（明亮）、`longshange`（专业）、`longdaiyu`（柔和）、`longanli`（友好）、`longanwen`（文学）、`longanyun`（清新）
- 童声：`longanran`

## 修改点

### 1. `app/src/components/models/data.ts`
`PRESETS.tts` 的 wingray-tts 条目：`voice: '中文女声-温暖'` → `voice: 'longjiqi'`（通用男声，最稳）。

### 2. `packages/shared/src/providers.ts`
wingray-tts 预设的 `voices` 改为真实音色 id：
```ts
voices: {
  zh: ['longjiqi', 'longxiaochun_v2', 'longyumi_v2', 'longyingxiao'],
  en: ['longjiqi', 'longshange'],
},
```
（中文音色能读英文，en 复用中文音色 id 即可。）

## 验证（必须全部通过）

1. `cd app && npm run build` 通过。
2. `packages/shared` 编译通过：`cd packages/shared && npx tsc --noEmit`（或根 workspace build 等价命令），确认 src 改动无 TS 错误。
3. 行为说明：Models 页新增 tts 配置选「Wingray · CosyVoice v2」→ voice 自动填 `longjiqi` → 保存后试听/测试连接可出真实音频。
4. git 提交：`git add` 仅限 `app/src/components/models/data.ts` + `packages/shared/src/providers.ts`（严禁 `git add -A`），commit message 如 `fix(app): use real wingray voice ids in tts presets`.

## 输出格式

完成后用 read_file 自证修改已落盘（贴出修改后的关键代码行），并报告：
- 修改的文件绝对路径
- 两个 build 的真实输出摘要
- git commit hash
