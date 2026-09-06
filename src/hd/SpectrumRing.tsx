// 桌面播放页频谱环:WebAudio AnalyserNode 接 audio-pro shim 的 HTML5 Audio(__nmAudio),
// 环形 bar 绕唱片分布(播放时律动);无数据/暂停时静态回落。仅 web 使用。
import React, { useEffect, useRef, useState } from 'react';
import { C } from './hdtokens';

const BARS = 48;

export function SpectrumRing({ size, playing }: { size: number; playing: boolean }) {
  const [levels, setLevels] = useState<number[]>(() => new Array(BARS).fill(0.08));
  const ref = useRef({ an: null as unknown as { disconnect: () => void } | null, raf: 0 });

  useEffect(() => {
    if (typeof globalThis === 'undefined') return;
    const w = globalThis as unknown as { __nmAudio?: unknown; __nmActx?: { createAnalyser: () => { disconnect: () => void } | null; resume?: () => { catch(_: unknown): void } } | null };
    const audio = w.__nmAudio;
    if (!audio) return;
    // v1.2.0:直接取 audio-pro shim 已并联进信号链的 __nmAnalyser(tap 挂在 panNode 后);
    // 自建悬空 analyser 无数据(恒 0)——波浪不动的根因
    const w2 = globalThis as unknown as { __nmAnalyser?: unknown };
    const an = w2.__nmAnalyser as { disconnect: () => void } | undefined ?? null;
    ref.current.an = an;
    try { (w.__nmActx as unknown as { resume?: () => { catch(_: unknown): void } } | undefined)?.resume?.()?.catch?.(() => {}); } catch { /* ignore */ }
    const data = new (globalThis as never as { Uint8Array: new (n: number) => number[] }).Uint8Array(an ? (an as unknown as { frequencyBinCount: number }).frequencyBinCount : 8);
    const tick = () => {
      if (ref.current.an) {
        (ref.current.an as unknown as { getByteFrequencyData: (d: number[]) => void }).getByteFrequencyData(data);
        const out: number[] = [];
        for (let i = 0; i < BARS; i++) {
          // 对数取样(低频密高频疏,观感均匀)
          const idx = Math.floor(Math.pow(i / BARS, 1.6) * (data.length * 0.72));
          out.push(Math.min(1, (data[idx] / 255) * 1.35));
        }
        setLevels(out);
      } else {
        // 无分析器:播放时伪律动
        const t = Date.now() / 300;
        setLevels(new Array(BARS).fill(0).map((_, i) => 0.1 + 0.18 * (1 + Math.sin(t + i * 0.55)) * 0.5));
      }
      ref.current.raf = requestAnimationFrame(tick);
    };
    ref.current.raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(ref.current.raf); ref.current.an?.disconnect(); };
  }, []);

  // v1.2.0 波浪环:连续平滑路径(SVG),径向渐变填充、无描边——替代离散 bar
  const R = size / 2;
  const inner = R + size * 0.02;               // 波浪内缘(贴唱片)
  const amp = Math.max(12, size * 0.085);      // 最大振幅
  const lv = playing ? levels : new Array(BARS).fill(0.05);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= BARS; i++) {
    const a = (i / BARS) * Math.PI * 2 - Math.PI / 2;
    const v = Math.max(0.06, lv[i % BARS]);
    const r = inner + amp * v;
    pts.push([R + Math.cos(a) * r, R + Math.sin(a) * r]);
  }
  // Catmull-Rom → 平滑闭合曲线
  const pt = (i: number): [number, number] => pts[Math.max(0, Math.min(BARS, i))];
  let d = `M ${pt(0)[0].toFixed(1)} ${pt(0)[1].toFixed(1)}`;
  for (let i = 0; i < BARS; i++) {
    const p0 = pt(i - 1), p1 = pt(i), p2 = pt(i + 1), p3 = pt(i + 2);
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  d += ' Z';
  const h = React.createElement;
  const ring = h('div', { style: { width: size, height: size, position: 'relative', pointerEvents: 'none' } as never },
    h('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}`, style: { position: 'absolute', inset: 0, overflow: 'visible' } as never },
      h('defs', null,
        h('radialGradient', { id: 'nmWave', cx: '50%', cy: '50%', r: '50%' },
          h('stop', { offset: '72%', stopColor: C.brand, stopOpacity: '0.06' }),
          h('stop', { offset: '88%', stopColor: C.brand, stopOpacity: '0.34' }),
          h('stop', { offset: '100%', stopColor: C.brandSoft, stopOpacity: '0.92' }),
        ),
      ),
      h('path', { d, fill: 'url(#nmWave)', stroke: 'none', fillRule: 'evenodd' }),
    ));
  return ring;
}

