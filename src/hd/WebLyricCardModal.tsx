// v3.18(老板:歌词卡片太丑→重做,对齐 lxserver 原版 lyric-card.js 能力)
// web 专属:Canvas 渲染引擎(三版式×三配色×内容开关×行数/字号/行距),预览+下载 PNG
// 原生端(手机/TV)继续走 components/LyricCardModal(view-shot 截 RN View)
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, type ViewStyle, TouchableOpacity, Image as RNImage, Dimensions, ActivityIndicator } from 'react-native';
import { Icon } from '../theme/Icon';
import { C, H } from './hdtokens';
import { HDTouch } from './HDTouch';
import { toast } from '../components/Dialog';
import type { LyricLine } from '../services/lyric';
import type { SongItem } from '../services/server';

type Layout = 'portrait' | 'landscape' | 'square';
type Theme = 'light' | 'dark' | 'album';

const CARD_SIZES: Record<Layout, { w: number; h: number }> = {
  portrait: { w: 1080, h: 1920 },
  landscape: { w: 1920, h: 1080 },
  square: { w: 1080, h: 1080 },
};

const FONT = '-apple-system,"PingFang SC","Microsoft YaHei","Segoe UI",sans-serif';

interface Colors {
  bg1: string; bg2: string; accent: string;
  textColor: string; subColor: string;
  lyricActive: string; lyricInactive: string; isDark: boolean;
}

// ===== 工具(移植原版) =====
function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise(res => {
    if (!src) { res(null); return; }
    const img = new (window as unknown as { Image: new () => HTMLImageElement }).Image();
    img.crossOrigin = 'anonymous'; // 必须,否则 canvas 导出污染
    img.onload = () => res(img);
    img.onerror = () => {
      // CORS 共底:走服务端 inline 代理
      const p = new (window as unknown as { Image: new () => HTMLImageElement }).Image();
      p.crossOrigin = 'anonymous';
      p.onload = () => res(p);
      p.onerror = () => res(null);
      p.src = `/api/music/download?url=${encodeURIComponent(src)}&inline=1`;
    };
    img.src = src;
  });
}

function extractAlbumColors(img: HTMLImageElement): Colors | null {
  try {
    const size = 100;
    const cv = document.createElement('canvas');
    cv.width = size; cv.height = size;
    const ctx = cv.getContext('2d')!;
    ctx.drawImage(img, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data; // 污染则 throw
    const regions = [[0, 0, 30, 30], [70, 0, 100, 30], [0, 70, 30, 100], [70, 70, 100, 100], [35, 35, 65, 65]];
    let bestR = 0, bestG = 0, bestB = 0, maxSat = -1;
    for (const [x1, y1, x2, y2] of regions) {
      let r = 0, g = 0, b = 0, cnt = 0;
      for (let y = y1; y < y2; y++) for (let x = x1; x < x2; x++) {
        const i = (y * size + x) * 4; r += data[i]; g += data[i + 1]; b += data[i + 2]; cnt++;
      }
      r = Math.round(r / cnt); g = Math.round(g / cnt); b = Math.round(b / cnt);
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const sat = mx === 0 ? 0 : (mx - mn) / mx;
      if (sat > maxSat) { maxSat = sat; bestR = r; bestG = g; bestB = b; }
    }
    const lum = 0.299 * bestR + 0.587 * bestG + 0.114 * bestB;
    const isDark = lum < 160;
    const dk = (v: number, f: number) => Math.max(0, Math.round(v * f));
    return {
      bg1: `rgb(${dk(bestR, .2)},${dk(bestG, .2)},${dk(bestB, .2)})`,
      bg2: `rgb(${dk(bestR, .08)},${dk(bestG, .08)},${dk(bestB, .08)})`,
      accent: `rgb(${bestR},${bestG},${bestB})`,
      textColor: isDark ? '#ffffff' : '#1a1a2e',
      subColor: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.55)',
      lyricActive: isDark ? '#ffffff' : '#1a1a2e',
      lyricInactive: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)',
      isDark,
    };
  } catch { return null; }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

function drawWrappedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  ctx.textBaseline = 'top';
  let line = '', lineCount = 0;
  const tokens = text.match(/[\u4e00-\u9fa5]|[a-zA-Z0-9']+|./g) || [];
  for (const tk of tokens) {
    const test = line + tk;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y + lineCount * lineHeight); line = tk; lineCount++;
    } else line = test;
  }
  ctx.fillText(line, x, y + lineCount * lineHeight);
  return lineCount + 1;
}

// 当前歌词上下文(高亮行前后各半)
function windowCtx(lyrics: LyricLine[] | null, positionSec: number, count: number) {
  if (!lyrics || !lyrics.length) return [] as { text: string; isActive: boolean }[];
  let idx = -1;
  for (let i = 0; i < lyrics.length; i++) if (lyrics[i].t <= positionSec) idx = i;
  if (idx < 0) idx = 0;
  const half = Math.floor((count - 1) / 2);
  const start = Math.max(0, Math.min(idx - half, lyrics.length - count));
  const out: { text: string; isActive: boolean }[] = [];
  for (let i = start; i < Math.min(start + count, lyrics.length); i++) out.push({ text: lyrics[i].text || '♪', isActive: i === idx });
  return out;
}

interface Opt {
  layout: Layout; theme: Theme;
  showCover: boolean; showTitle: boolean; showArtist: boolean; showLyric: boolean;
  lyricLines: number; fontSize: number; lineSpacing: number;
}

export function WebLyricCardModal({ onClose, song, lyrics, positionSec }: {
  onClose: () => void;
  song: SongItem; lyrics: LyricLine[] | null; positionSec: number;
}) {
  const [opt, setOpt] = useState<Opt>({
    layout: 'landscape', theme: 'album',
    showCover: true, showTitle: true, showArtist: true, showLyric: true,
    lyricLines: 5, fontSize: 1.0, lineSpacing: 1.0,
  });
  const [dataUrl, setDataUrl] = useState<string>('');
  const [rendering, setRendering] = useState(true);
  const coverRef = useRef<HTMLImageElement | null>(null);
  const posRef = useRef(positionSec);
  posRef.current = positionSec;

  // Esc 关闭(web 惯例,v3.15 同款)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const render = useCallback(async (o: Opt) => {
    setRendering(true);
    try {
      if (!coverRef.current && song.img) coverRef.current = await loadImage(song.img);
      const img = coverRef.current;
      if (!img && song.img) return; // v3.28:cover 未就绪直接跳过(类型收窄 null)
      const W = size.w, H = size.h;
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d')!;

      let colors: Colors;
      if (o.theme === 'dark') {
        colors = { bg1: '#0f0c29', bg2: '#302b63', accent: '#a78bfa', textColor: '#ffffff', subColor: 'rgba(255,255,255,0.6)', lyricActive: '#ffffff', lyricInactive: 'rgba(255,255,255,0.35)', isDark: true };
      } else if (o.theme === 'light') {
        colors = { bg1: '#ffffff', bg2: '#f0f4f8', accent: '#4a90e2', textColor: '#1a1a2e', subColor: 'rgba(0,0,0,0.5)', lyricActive: '#1a1a2e', lyricInactive: 'rgba(0,0,0,0.3)', isDark: false };
      } else {
        colors = (img && extractAlbumColors(img)) || { bg1: '#1a1a2e', bg2: '#0d0d1a', accent: '#1ED760', textColor: '#ffffff', subColor: 'rgba(255,255,255,0.6)', lyricActive: '#ffffff', lyricInactive: 'rgba(255,255,255,0.35)', isDark: true };
      }

      // 背景:专辑主题=封面 60px 模糊+压暗;否则线性渐变+accent 辉光
      if (o.theme === 'album' && img) {
        ctx.save(); ctx.filter = 'blur(60px)';
        ctx.drawImage(img, -W * .15, -H * .15, W * 1.3, H * 1.3);
        ctx.restore();
        ctx.fillStyle = colors.isDark ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.25)';
        ctx.fillRect(0, 0, W, H);
      } else {
        const grad = ctx.createLinearGradient(0, 0, W * .4, H);
        grad.addColorStop(0, colors.bg1); grad.addColorStop(1, colors.bg2);
        ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
        const glow = ctx.createRadialGradient(W * .8, H * .15, 0, W * .8, H * .15, W * .65);
        glow.addColorStop(0, colors.accent + '33'); glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
      }

      const title = song.name || '未知歌曲';
      const artist = song.singer || '未知歌手';
      const ctxLines = o.showLyric ? windowCtx(lyrics, posRef.current, o.lyricLines) : [];

      const drawLyrics = (startY: number, availH: number, baseFS: number, align: 'left' | 'center', pad: number, fixedX?: number, maxW?: number) => {
        if (!ctxLines.length) return;
        const lyrFS = Math.min(baseFS, availH / (o.lyricLines * 1.7 * o.lineSpacing));
        const lyrLH = lyrFS * 1.6 * o.lineSpacing;
        const lyrY = startY + Math.max(0, (availH - lyrLH * o.lyricLines) / 2);
        ctx.textAlign = align; ctx.textBaseline = 'top';
        let y = lyrY;
        for (const { text, isActive } of ctxLines) {
          const fs = isActive ? lyrFS * 1.15 : lyrFS;
          ctx.font = `${isActive ? 'bold ' : ''}${fs}px ${FONT}`;
          ctx.fillStyle = isActive ? colors.lyricActive : colors.lyricInactive;
          if (align === 'center') ctx.fillText(text, W / 2, y, W - pad * 2);
          else ctx.fillText(text, fixedX ?? pad, y, maxW ?? W - pad * 2);
          y += lyrLH * (isActive ? 1.2 : 1.0);
        }
      };

      const fMul = o.fontSize;
      if (o.layout === 'portrait') {
        const pad = W * 0.1, bottomLimit = H * 0.94;
        let y = H * 0.07;
        if (o.showCover && img) {
          const cs = Math.max(W * 0.3, Math.min(W * 0.75, H - H * .07 - H * .06
            - (o.showTitle ? W * .075 * fMul * 1.35 + H * .015 : 0)
            - (o.showArtist ? W * .043 * fMul * 1.4 + H * .02 : 0)
            - (o.showLyric ? H * .03 + W * .06 * fMul * 1.6 * o.lineSpacing * o.lyricLines * 1.2 + H * .05 : 0)));
          const cx = (W - cs) / 2;
          ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 20;
          roundRect(ctx, cx, y, cs, cs, cs * 0.06); ctx.clip(); ctx.drawImage(img, cx, y, cs, cs); ctx.restore();
          y += cs + H * 0.05;
        }
        if (o.showTitle) {
          ctx.font = `bold ${W * 0.075 * fMul}px ${FONT}`;
          ctx.fillStyle = colors.textColor; ctx.textAlign = 'center';
          const lc = drawWrappedText(ctx, title, W / 2, y, W - pad * 2, W * .075 * fMul * 1.3);
          y += lc * W * .075 * fMul * 1.3 + H * 0.005;
        }
        if (o.showArtist) {
          ctx.font = `${W * 0.043 * fMul}px ${FONT}`;
          ctx.fillStyle = colors.subColor; ctx.textAlign = 'center';
          ctx.fillText(artist, W / 2, y);
          y += W * .043 * fMul * 1.4 + H * 0.02;
        }
        if (o.showLyric) {
          ctx.strokeStyle = colors.accent + '55'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(pad * 1.5, y); ctx.lineTo(W - pad * 1.5, y); ctx.stroke();
          y += H * 0.025;
          drawLyrics(y, bottomLimit - y, W * 0.06 * fMul, 'center', pad);
        }
      } else if (o.layout === 'landscape') {
        const pad = H * 0.1, bottomLimit = H * 0.92;
        const cs = o.showCover && img ? Math.max(H * 0.4, Math.min(H * 0.75, H * 0.8)) : 0;
        const coverX = pad, coverY = (H - cs) / 2;
        if (cs > 0 && img) { // v3.28:img null 收窄
          ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 50; ctx.shadowOffsetX = 15;
          roundRect(ctx, coverX, coverY, cs, cs, cs * 0.06); ctx.clip(); ctx.drawImage(img, coverX, coverY, cs, cs); ctx.restore();
        }
        const textX = cs > 0 ? coverX + cs + pad : pad;
        const textW = W - textX - pad, xOff = textX + 24;
        let y = H * 0.18;
        if (o.showTitle) {
          ctx.font = `bold ${H * 0.08 * fMul}px ${FONT}`;
          ctx.fillStyle = colors.textColor; ctx.textAlign = 'left';
          const lc = drawWrappedText(ctx, title, xOff, y, textW - 24, H * .08 * fMul * 1.2);
          y += lc * H * .08 * fMul * 1.2 + H * 0.008;
        }
        if (o.showArtist) {
          ctx.font = `${H * 0.048 * fMul}px ${FONT}`;
          ctx.fillStyle = colors.subColor; ctx.textAlign = 'left';
          ctx.fillText(artist, xOff, y);
          y += H * .048 * fMul * 1.4 + H * 0.035;
        }
        let endY = y;
        if (o.showLyric) {
          drawLyrics(y, bottomLimit - y, H * 0.058 * fMul, 'left', pad, xOff, textW - 24);
          const lyrLH = Math.min(H * .058 * fMul, (bottomLimit - y) / (o.lyricLines * 1.7 * o.lineSpacing)) * 1.6 * o.lineSpacing;
          endY = y + Math.max(0, (bottomLimit - y - lyrLH * o.lyricLines) / 2) + lyrLH * (o.lyricLines + 0.15);
        }
        ctx.strokeStyle = colors.accent; ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(textX, H * 0.18); ctx.lineTo(textX, endY); ctx.stroke();
      } else {
        const pad = W * 0.08, bottomLimit = H * 0.93;
        let y = H * 0.04;
        if (o.showCover && img) {
          const cs = Math.max(W * 0.3, Math.min(W * 0.85, H - H * .04 - H * .06
            - (o.showTitle ? W * .068 * fMul * 1.25 + H * .01 : 0)
            - (o.showArtist ? W * .04 * fMul * 1.6 + H * .015 : 0)
            - (o.showLyric ? H * .02 + W * .055 * fMul * 1.6 * o.lineSpacing * o.lyricLines * 1.25 + H * .02 : 0)));
          const cx = (W - cs) / 2;
          ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 15;
          roundRect(ctx, cx, y, cs, cs, cs * 0.08); ctx.clip(); ctx.drawImage(img, cx, y, cs, cs); ctx.restore();
          y += cs + H * 0.02;
        }
        if (o.showTitle) {
          ctx.font = `bold ${W * 0.068 * fMul}px ${FONT}`;
          ctx.fillStyle = colors.textColor; ctx.textAlign = 'center';
          const lc = drawWrappedText(ctx, title, W / 2, y, W - pad * 2, W * .068 * fMul * 1.25);
          y += lc * W * .068 * fMul * 1.25 + H * 0.01;
        }
        if (o.showArtist) {
          ctx.font = `${W * 0.04 * fMul}px ${FONT}`;
          ctx.fillStyle = colors.subColor; ctx.textAlign = 'center';
          ctx.fillText(artist, W / 2, y);
          y += W * .04 * fMul * 1.6 + H * 0.015;
        }
        if (o.showLyric) {
          ctx.strokeStyle = colors.isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.15)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(pad * 2, y); ctx.lineTo(W - pad * 2, y); ctx.stroke();
          y += H * 0.02;
          drawLyrics(y, bottomLimit - y, W * 0.055 * fMul, 'center', pad);
        }
      }

      // 水印(右下,品牌绿点+名)
      const wmFS = Math.round(W * 0.022), wmR = Math.round(W * 0.04), wmB = Math.round(H * 0.04);
      ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
      ctx.font = `bold ${wmFS}px ${FONT}`;
      ctx.fillStyle = colors.isDark ? 'rgba(255,255,255,0.6)' : 'rgba(30,30,30,0.5)';
      ctx.fillText('NextMusic', W - wmR, H - wmB);
      const tw = ctx.measureText('NextMusic').width;
      ctx.beginPath();
      ctx.fillStyle = '#1ED760';
      ctx.arc(W - wmR - tw - wmFS * 0.9, H - wmB, wmFS * 0.42, 0, Math.PI * 2);
      ctx.fill();

      setDataUrl(canvas.toDataURL('image/png'));
    } finally { setRendering(false); }
  }, [song, lyrics]);

  useEffect(() => { render(opt); }, [opt, render]);

  const win = Dimensions.get('window');
  const size = CARD_SIZES[opt.layout];
  const boxW = Math.max(240, Math.min(win.width - 460, win.width * 0.52));
  const boxH = Math.max(240, win.height - 290);
  const scale = Math.min(boxW / size.w, boxH / size.h);
  const pw = Math.round(size.w * scale), ph = Math.round(size.h * scale);

  const dl = () => {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `NextMusic-${song.name}-${opt.layout}.png`;
    a.click();
    toast('已保存图片');
    onClose();
  };

  const Pill = ({ on, label, onPress, w }: { on?: boolean; label: string; onPress: () => void; w?: number }) => (
    <HDTouch style={[stP.pill, on && stP.pillOn, w ? { width: w } : null]} hoverBg="#ffffff1a" onPress={onPress}>
      <Text style={[stP.pillText, on && { color: '#0b0f0d', fontWeight: '700' }]}>{label}</Text>
    </HDTouch>
  );

  return (
    <View style={stP.root}>
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
      <View style={stP.panel}>
        <View style={stP.head}>
          <Icon name="music" size={18} color={C.brand} />
          <View style={{ flex: 1 }}>
            <Text style={stP.headTitle}>歌词卡片分享</Text>
            <Text style={stP.headSub}>LYRIC CARD SHARE</Text>
          </View>
          <HDTouch style={stP.closeBtn} hoverBg="#ffffff1a" onPress={onClose}><Icon name="close" size={16} color={C.text2} /></HDTouch>
        </View>
        <View style={stP.body}>
          {/* 预览区 */}
          <View style={stP.previewBox}>
            {dataUrl ? (
              <RNImage source={{ uri: dataUrl }} style={{ width: pw, height: ph, borderRadius: 12 }} />
            ) : <ActivityIndicator color={C.text2} />}
            {rendering ? <View style={stP.veil}><ActivityIndicator color="#fff" /><Text style={stP.veilText}>渲染中…</Text></View> : null}
          </View>
          {/* 选项区 */}
          <View style={stP.opts}>
            <Text style={stP.secTitle}>版式</Text>
            <View style={stP.row}>
              <Pill label="竖版 9:16" on={opt.layout === 'portrait'} onPress={() => setOpt(o => ({ ...o, layout: 'portrait' }))} />
              <Pill label="横版 16:9" on={opt.layout === 'landscape'} onPress={() => setOpt(o => ({ ...o, layout: 'landscape' }))} />
              <Pill label="方形 1:1" on={opt.layout === 'square'} onPress={() => setOpt(o => ({ ...o, layout: 'square' }))} />
            </View>
            <Text style={stP.secTitle}>配色</Text>
            <View style={stP.row}>
              <Pill label="专辑" on={opt.theme === 'album'} onPress={() => setOpt(o => ({ ...o, theme: 'album' }))} />
              <Pill label="浅色" on={opt.theme === 'light'} onPress={() => setOpt(o => ({ ...o, theme: 'light' }))} />
              <Pill label="深色" on={opt.theme === 'dark'} onPress={() => setOpt(o => ({ ...o, theme: 'dark' }))} />
            </View>
            <Text style={stP.secTitle}>显示内容</Text>
            <View style={stP.row}>
              <Pill label="封面" on={opt.showCover} onPress={() => setOpt(o => ({ ...o, showCover: !o.showCover }))} />
              <Pill label="标题" on={opt.showTitle} onPress={() => setOpt(o => ({ ...o, showTitle: !o.showTitle }))} />
              <Pill label="歌手" on={opt.showArtist} onPress={() => setOpt(o => ({ ...o, showArtist: !o.showArtist }))} />
              <Pill label="歌词" on={opt.showLyric} onPress={() => setOpt(o => ({ ...o, showLyric: !o.showLyric }))} />
            </View>
            <Text style={stP.secTitle}>歌词行数</Text>
            <View style={stP.row}>
              {[3, 4, 5, 6, 7].map(n => (
                <Pill key={n} label={`${n}`} w={34} on={opt.lyricLines === n} onPress={() => setOpt(o => ({ ...o, lyricLines: n }))} />
              ))}
            </View>
            <Text style={stP.secTitle}>字号 / 行距</Text>
            <View style={stP.row}>
              <Pill label="A−" w={40} onPress={() => setOpt(o => ({ ...o, fontSize: Math.max(0.8, +(o.fontSize - 0.05).toFixed(2)) }))} />
              <Text style={stP.valText}>{Math.round(opt.fontSize * 100)}%</Text>
              <Pill label="A+" w={40} onPress={() => setOpt(o => ({ ...o, fontSize: Math.min(1.25, +(o.fontSize + 0.05).toFixed(2)) }))} />
              <Pill label="行−" w={46} onPress={() => setOpt(o => ({ ...o, lineSpacing: Math.max(0.9, +(o.lineSpacing - 0.1).toFixed(1)) }))} />
              <Text style={stP.valText}>{opt.lineSpacing.toFixed(1)}</Text>
              <Pill label="行+" w={46} onPress={() => setOpt(o => ({ ...o, lineSpacing: Math.min(1.5, +(o.lineSpacing + 0.1).toFixed(1)) }))} />
            </View>
          </View>
        </View>
        <View style={stP.foot}>
          <Text style={stP.hint}>当前句高亮 · 配色「专辑」取封面主色</Text>
          <HDTouch style={stP.saveBtn} hoverBg="#24cf68" onPress={dl} disabled={!dataUrl}>
            <Icon name="download" size={15} color="#0b0f0d" />
            <Text style={stP.saveText}>下载 PNG</Text>
          </HDTouch>
        </View>
      </View>
    </View>
  );
}

const stP = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999, backgroundColor: '#000000CC', alignItems: 'center', justifyContent: 'center' },
  panel: { width: '92%', maxWidth: 1020, maxHeight: '90%', backgroundColor: '#17191E', borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, overflow: 'hidden', flexDirection: 'column' as const },
  head: { flexDirection: 'row' as const, alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  headTitle: { color: C.text, fontSize: 15, fontWeight: '800' },
  headSub: { color: C.text3, fontSize: 9, fontWeight: '700', letterSpacing: 1.2, marginTop: 2 },
  closeBtn: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  body: { flexDirection: 'row' as const, flex: 1, minHeight: 0 },
  previewBox: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center', padding: 18, backgroundColor: 'rgba(255,255,255,.02)' },
  veil: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#00000066', alignItems: 'center', justifyContent: 'center', gap: 8 },
  veilText: { color: '#ffffffcc', fontSize: 11 },
  opts: { width: 300, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: C.border, padding: 16, gap: 6, overflowY: 'auto' as const } as ViewStyle, // v3.28:overflowY 为 RNW 属性,断言
  secTitle: { color: C.text3, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginTop: 8 },
  row: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6, marginTop: 6 },
  pill: { height: 30, borderRadius: 15, paddingHorizontal: 12, borderWidth: 1, borderColor: '#ffffff26', alignItems: 'center', justifyContent: 'center' },
  pillOn: { backgroundColor: C.brand, borderColor: C.brand },
  pillText: { color: '#ffffffcc', fontSize: 11, fontWeight: '600' },
  valText: { color: C.text2, fontSize: 11, alignSelf: 'center', minWidth: 34, textAlign: 'center' },
  foot: { flexDirection: 'row' as const, alignItems: 'center', padding: 14, gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  hint: { flex: 1, color: C.text3, fontSize: 11 },
  saveBtn: { height: 38, borderRadius: 19, backgroundColor: C.brand, paddingHorizontal: 20, flexDirection: 'row' as const, alignItems: 'center', gap: 7 },
  saveText: { color: '#0b0f0d', fontSize: 13, fontWeight: '800' },
});
