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
    let an: { disconnect: () => void } | null = null;
    try {
      // 复用 audio-pro shim 已建的 AudioContext(其分析器可并联;直接自建会断 MediaElementSource 单源限制)
      const ctx = w.__nmActx;
      if (ctx) {
        an = ctx.createAnalyser();
        (an as unknown as { fftSize: number; smoothingTimeConstant: number }).fftSize = 256;
        (an as unknown as { smoothingTimeConstant: number }).smoothingTimeConstant = 0.78;
        ctx.resume?.()?.catch?.(() => {});
      }
    } catch { /* 分析器不可用 → 静态 */ }
    ref.current.an = an;
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

  const R = size / 2;
  const barLen = Math.max(10, size * 0.075);
  const items: React.ReactNode[] = [];
  for (let i = 0; i < BARS; i++) {
    const a = (i / BARS) * Math.PI * 2 - Math.PI / 2;
    const lv = playing ? levels[i] : 0.06;
    const h = barLen * (0.18 + lv * 0.92);
    const r0 = R + size * 0.045;
    const x0 = R + Math.cos(a) * r0 - 1.5, y0 = R + Math.sin(a) * r0 - 1.5;
    const x1 = R + Math.cos(a) * (r0 + h) - 1.5, y1 = R + Math.sin(a) * (r0 + h) - 1.5;
    const w = Math.max(2, size * 0.006);
    items.push(
      <div key={i} style={{
        position: 'absolute', left: 0, top: 0, width: w * 2, height: w * 2,
        transform: `translate(${x0 - w}px, ${y0 - w}px)`,
        pointerEvents: 'none',
      }}>
        <div style={{
          position: 'absolute', left: w, top: -h / 2 * 0, width: w, height: h,
          background: `linear-gradient(to top, ${C.brand}55, ${C.brand}EE)`,
          borderRadius: w, transformOrigin: `50% ${h / 2}px`,
          transform: `rotate(${(a * 180) / Math.PI + 90}deg) translateY(${-h / 2}px)`,
          opacity: 0.55 + lv * 0.45,
        }} />
      </div>
    );
  }
  return <div style={{ width: size, height: size, position: 'relative', pointerEvents: 'none' }}>{items}</div>;
}
