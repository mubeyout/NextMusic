#!/usr/bin/env node
// 边界守护：防止 phone 层反向依赖 HD 层（改 hd 坏 phone / 改 phone 坏 hd）
// 规则见 docs/FLAVORS.md。新增跨层依赖必须显式进白名单并在 PR 说明理由。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
// 白名单：物理在 src/hd/ 但语义属共享原语（历史桥接,待逐步迁往 src/shared/）
const HD_WHITELIST = new Set(['HDTouch', 'HDActions', 'hdtokens', 'hdkeyboard']);
const L1_DIRS = ['src/screens', 'src/components'];
const ROOT_FILES = ['App.tsx'];

let bad = 0;
function walk(d, out = []) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(f)) out.push(p);
  }
  return out;
}
const files = [...L1_DIRS.map(d => walk(join(ROOT, d))).flat(), ...ROOT_FILES.map(f => join(ROOT, f))];
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const rel = relative(ROOT, f);
  const re = /from\s+'([^']*hd\/([^./'][^']+))'/g;
  let m;
  while ((m = re.exec(src))) {
    const target = m[2].split('/')[0];
    if (!HD_WHITELIST.has(target.replace(/\.js$/, ''))) {
      console.error(`✗ 边界违规 ${rel} -> ${m[1]}（phone 层不得依赖 hd 层;共享原语请放 src/state 或加白名单并说明）`);
      bad++;
    }
  }
}
if (bad) { console.error(`\n${bad} 处违规`); process.exit(1); }
console.log('✓ 边界检查通过（phone 层无非法 hd 依赖）');
