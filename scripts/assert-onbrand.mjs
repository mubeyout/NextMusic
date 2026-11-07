#!/usr/bin/env node
// assert-onbrand.mjs —— [LEO 1107·拍板] onBrand/accent 对比断言：任一 accent 对派生 onBrand 对比 <4.5:1 即 exit 1（构建门禁）
// accent 源：src/car/cartokens.ts CAR_ACCENTS + 默认绿 #1ED760；派生规则与 tokens.ts deriveOnBrand 保持同步（候 #FFFFFF/#121212 取对比高者）
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const relLum = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const contrast = (a, b) => { const [hi, lo] = [relLum(a), relLum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const deriveOnBrand = acc => (contrast(acc, '#FFFFFF') >= contrast(acc, '#121212') ? '#FFFFFF' : '#121212');

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'car', 'cartokens.ts'), 'utf8');
const block = src.slice(src.indexOf('CAR_ACCENTS'));
const accents = ['#1ED760', ...block.slice(0, block.indexOf('}') + 1).matchAll(/'#[0-9A-Fa-f]{6}'/g).map(m => m[0].slice(1, -1))];

let fail = 0;
console.log('accent   L(WCAG)  onBrand  contrast  (threshold 4.5)');
for (const acc of accents) {
  const ob = deriveOnBrand(acc), c = contrast(acc, ob);
  const ok = c >= 4.5;
  if (!ok) fail++;
  console.log(acc + '  ' + relLum(acc).toFixed(3).padEnd(8) + '  ' + ob + '  ' + c.toFixed(2).padEnd(8) + (ok ? 'PASS' : 'FAIL <4.5'));
}
if (fail) { console.error('ONBRAND CONTRAST FAIL: ' + fail + ' accent(s) below 4.5:1'); process.exit(1); }
console.log('ONBRAND OK: ' + accents.length + ' accents all >= 4.5:1');
