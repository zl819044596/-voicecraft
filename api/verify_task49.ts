/**
 * PIPELINE_TASK_49 临时验证脚本（跑完即删，不提交）。
 * 验证共享 style-context 助手 + L4 写回 merge 的纯逻辑路径。
 */
import {
  styleSuffixFor,
  seedFromTaskId,
  withProtagonistPrefix,
  protagonistFromOut,
} from './src/pipeline/style-context.js';

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    failures += 1;
    console.log(`FAIL  ${name} :: ${JSON.stringify(detail ?? '')}`);
  }
}

// ---- seedFromTaskId ----
console.log('seedFromTaskId');
const seedA = seedFromTaskId('task-abc-123');
const seedB = seedFromTaskId('task-abc-123');
const seedC = seedFromTaskId('task-abc-124');
check('deterministic (same task → same seed)', seedA === seedB, seedA);
check('within [0, 100000)', seedA >= 0 && seedA < 100000, seedA);
check('different task usually differs', seedA !== seedC, { a: seedA, c: seedC });

// ---- styleSuffixFor ----
console.log('styleSuffixFor');
check('zh suffix', styleSuffixFor('zh') === '电影感写实，暖色调，自然光，细节丰富');
check('en suffix', styleSuffixFor('en') === 'cinematic realism, warm tones, natural light, rich detail');

// ---- withProtagonistPrefix ----
console.log('withProtagonistPrefix');
check('prepends when missing (with ，)', withProtagonistPrefix('a busy street', 'a man in red coat') === 'a man in red coat，a busy street');
check('no-op when already present', withProtagonistPrefix('a man in red coat, walking', 'a man in red coat') === 'a man in red coat, walking');
check('null desc → unchanged', withProtagonistPrefix('a busy street', null) === 'a busy street');
check('empty desc → unchanged', withProtagonistPrefix('a busy street', '') === 'a busy street');

// ---- protagonistFromOut ----
console.log('protagonistFromOut');
check('object contract true', protagonistFromOut({ has_protagonist: true, description: ' 30yo woman ' }) === '30yo woman');
check('object contract false', protagonistFromOut({ has_protagonist: false, description: 'x' }) === null);
check('raw JSON string', protagonistFromOut('{"has_protagonist": true, "description": "a girl in a yellow dress"}') === 'a girl in a yellow dress');
check(
  'fenced markdown JSON',
  protagonistFromOut('```json\n{"has_protagonist": true, "description": "an old man with glasses"}\n```') === 'an old man with glasses',
);
check('escaped newline in description', protagonistFromOut('{"has_protagonist": true, "description": "line1\\nline2"}') === 'line1 line2');
check('non-strict garbage with has_protagonist true', protagonistFromOut('here: has_protagonist: true, description: "x"') === 'x');
{
  const probe = 'here: has_protagonist: true, description: "x"';
  const res = protagonistFromOut(probe);
  const hasRe = /"?has_protagonist"?\s*:\s*true/.test(probe);
  const descRe = probe.match(/"?"description"?\s*:\s*"((?:[^"\\]|\\.)*)"/);
  const descRe2 = new RegExp('"?description"?\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"');
  const literalRe = /"?description"?\s*:\s*"((?:[^"\\]|\\.)*)"/;
  console.log('  [debug] res=', JSON.stringify(res), 'hasRe=', hasRe, 'descRe=', JSON.stringify(descRe && descRe[1]));
  console.log('  [debug] literal.source=', JSON.stringify(literalRe.source), 'vs regExpString.source=', JSON.stringify(descRe2.source));
  console.log('  [debug] literal.test=', literalRe.test(probe), 'match0=', JSON.stringify(probe.match(literalRe)?.[0]));
}
check('garbage without contract → null', protagonistFromOut('not json at all') === null);

// ---- L4 write-back merge（P1-2 逻辑复刻） ----
console.log('L4 write-back merge (P1-2)');
const rawSb = {
  generated_at: '2026-01-01T00:00:00Z',
  aspect: '9:16',
  preset: 'ecommerce',
  protagonist: 'a man in red coat',
  title: '我的标题',
  shots: [
    { index: 1, title: '镜1', script: 's1', prompt: '', segment_break: true, candidates: [] },
    { index: 2, title: '镜2', script: 's2', prompt: 'existing prompt', segment_break: false },
    { index: 3, title: '镜3', script: 's3', prompt: '', segment_break: false, ref_key: 'keep-me' },
  ],
};
const map = new Map<number, string>([
  [1, 'LLM filled 1'],
  [3, 'LLM filled 3'],
]);
const baseShots = Array.isArray(rawSb.shots) ? (rawSb.shots as Record<string, unknown>[]) : [];
let changed = false;
const nextShots = baseShots.map((s) => {
  const idx = Number((s as { index?: unknown })?.index);
  if (idx > 0 && (!s.prompt || !String(s.prompt).trim()) && map.has(idx)) {
    changed = true;
    return { ...s, prompt: map.get(idx) ?? '' };
  }
  return s;
});
const written = { ...rawSb, shots: nextShots };
check('top-level preset preserved', written.preset === 'ecommerce');
check('top-level protagonist preserved', written.protagonist === 'a man in red coat');
check('top-level unknown field (title) preserved', written.title === '我的标题');
check('shot 1 prompt filled', written.shots[0].prompt === 'LLM filled 1');
check('shot 2 prompt untouched', written.shots[1].prompt === 'existing prompt');
check('shot 1 segment_break preserved', written.shots[0].segment_break === true);
check('shot 3 ref_key preserved', written.shots[2].ref_key === 'keep-me');
check('changed flagged', changed === true);

// ---- rerun regenerateShotImage prompt 组装（P1-1 逻辑复刻） ----
console.log('rerun regenerateShotImage prompt assembly (P1-1)');
const lang = 'zh';
const shot = { prompt: '一个人在海边跑步', title: '镜1', scene: '海边', aspect: '9:16' };
const protagonistDescription = '穿红色外套的男人';
let p = shot.prompt ? String(shot.prompt) : `${shot.title}, ${shot.scene}, ${shot.aspect}, high detail, sharp focus, 4k`;
p = withProtagonistPrefix(p, protagonistDescription);
p += `, ${styleSuffixFor(lang)}`;
check('protagonist prefixed first', p.startsWith(`${protagonistDescription}，一个人在海边跑步`), p);
check('style suffix appended last', p.endsWith(`, ${styleSuffixFor('zh')}`), p);

// ---- style-context protagonistFromOut in rerun/l3 path (extractProtagonist result parsing) ----
console.log('rerun/l3 shared protagonistFromOut on chatJson(json:false) output');
const chatOut = '```\n{"has_protagonist": true, "description": "扎马尾的年轻女性，穿白T恤"}\n```';
check('fenced output parsed', protagonistFromOut(chatOut) === '扎马尾的年轻女性，穿白T恤');

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
