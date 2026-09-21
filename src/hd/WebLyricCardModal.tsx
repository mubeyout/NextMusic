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
import markUrl from '../assets/brand/mark.png'; // v3.36(老板):卡片水印换 NextMusic 品牌 mark

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
function loadImage(src0: string): Promise<HTMLImageElement | null> {
  return new Promise(res => {
    const src = src0.replace(/^https?:\/\/img\.kuwo\.cn\//, 'https://img4.kuwo.cn/'); // lxfix:kw 图床域名自愈
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
  blurLv: 0 | 1 | 2; // lxfix:弥散强度三档(老板 12:42-14:32 四轮口味迭代→做成自选项)
}

// 弥散强度配方表:0=播放页逐参数 parity / 1=深 / 2=极深(封面存在感=alpha×(1-veil))
const BLUR_LV = [
  { alpha: 0.5, blur: 160, veil: 0.62 },  // 播放页:0.5×0.38≈0.19
  { alpha: 0.35, blur: 190, veil: 0.72 }, // 深:≈0.10
  { alpha: 0.22, blur: 220, veil: 0.82 }, // 极深:≈0.04
] as const;

export function WebLyricCardModal({ onClose, song, lyrics, positionSec }: {
  onClose: () => void;
  song: SongItem; lyrics: LyricLine[] | null; positionSec: number;
}) {
  const [opt, setOpt] = useState<Opt>({
    layout: 'landscape', theme: 'album',
    showCover: true, showTitle: true, showArtist: true, showLyric: true,
    lyricLines: 5, fontSize: 1.0, lineSpacing: 1.0, blurLv: 0,
  });
  const [dataUrl, setDataUrl] = useState<string>('');
  const [rendering, setRendering] = useState(true);
  const coverRef = useRef<HTMLImageElement | null>(null);
  const markImgRef = useRef<HTMLImageElement | null>(null); // v3.36:品牌 mark(加载一次复用)
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
      if (!img && song.img) return; // v3.28:cover 未就绪直接跳过(类型收窄)
      if (!markImgRef.current) markImgRef.current = await loadImage(markUrl as unknown as string);
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

      // 背景:专辑主题=逐参数复刻播放页(HDPlayer bgArt opacity.5+blur / bgVeil rgba(6,8,7,.62) 均匀纱)——老板 13:00/13:55/13:58 三次指定参考;不加饱和/亮度/渐变(那些=「清晰感」来源)
      if (o.theme === 'album' && img) {
        // lxfix:ctx.filter 在 Safari/部分浏览器不生效→降级 downscale 模糊
        const CAN_FILTER = (() => { try { const c = document.createElement('canvas').getContext('2d')!; c.filter = 'blur(2px)'; return c.filter !== 'none' && c.filter !== ''; } catch { return false; } })();
        const LV = BLUR_LV[o.blurLv] ?? BLUR_LV[0];
        ctx.save(); ctx.globalAlpha = LV.alpha; // 播放页 bgArt 同款存在感(0档)
        if (CAN_FILTER) {
          ctx.filter = `blur(${LV.blur}px)`; // 纯模糊,无 saturate/brightness
          ctx.drawImage(img, -W * .25, -H * .25, W * 1.5, H * 1.5);
        } else {
          const tiny = document.createElement('canvas');
          tiny.width = Math.max(5, Math.round(W / 64)); tiny.height = Math.max(5, Math.round(H / 64));
          const tctx = tiny.getContext('2d')!;
          tctx.drawImage(img, 0, 0, tiny.width, tiny.height);
          ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(tiny, -W * .25, -H * .25, W * 1.5, H * 1.5);
        }
        ctx.restore();
        // 均匀暗纱=播放页 bgVeil 原参数(0档)
        ctx.fillStyle = `rgba(6,8,7,${LV.veil})`; ctx.fillRect(0, 0, W, H);
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

      // lxfix(老板 20260920:方形/竖版文字排版大小有问题):原先 fillText(text,x,y,maxWidth) 靠浏览器
      // maxWidth 压缩——窄卡长句被横向压扁。改为逐 token 换行 + 总高超限自动缩字号(每轮 ×0.92)。
      const wrapTokens = (text: string) => text.match(/[\u4e00-\u9fa5]|[a-zA-Z0-9']+|\s+|./g) || [];
      const wrapLine = (text: string, fs: number, maxW: number): string[] => {
        ctx.font = `${fs}px ${FONT}`;
        const out: string[] = []; let cur = '';
        for (const tk of wrapTokens(text)) {
          const test = cur + tk;
          if (ctx.measureText(test).width > maxW && cur.trim()) { out.push(cur.trimEnd()); cur = tk.startsWith(' ') ? tk.trimStart() : tk; }
          else cur = test;
        }
        if (cur.trim()) out.push(cur.trimEnd());
        return out.length ? out : ['♪'];
      };
      const drawLyrics = (startY: number, availH: number, baseFS: number, align: 'left' | 'center', pad: number, fixedX?: number, maxW?: number) => {
        if (!ctxLines.length) return;
        const boxW = align === 'center' ? W - pad * 2 : (maxW ?? W - pad * 2);
        let fs = Math.min(baseFS, availH / (o.lyricLines * 1.7 * o.lineSpacing));
        // 自适应循环:换行后总高超 availH → 缩字号(下限 16px)
        for (let round = 0; round < 10; round++) {
          const rows: { text: string; on: boolean; h: number }[] = [];
          for (const { text, isActive } of ctxLines) {
            const lfs = isActive ? fs * 1.15 : fs;
            for (const seg of wrapLine(text, lfs, boxW)) rows.push({ text: seg, on: isActive, h: lfs * 1.6 * o.lineSpacing * (isActive ? 1.2 : 1) });
          }
          const totalH = rows.reduce((n, r) => n + r.h, 0);
          if (totalH <= availH || fs <= 16) {
            let y = startY + Math.max(0, (availH - totalH) / 2);
            ctx.textAlign = align; ctx.textBaseline = 'top';
            for (const r of rows) {
              ctx.font = `${r.on ? 'bold ' : ''}${Math.round(r.h / (1.6 * o.lineSpacing * (r.on ? 1.2 : 1)))}px ${FONT}`;
              ctx.fillStyle = r.on ? colors.lyricActive : colors.lyricInactive; // v2:高亮行由 lyricActive 驱动(album 主题可随取色主色)
              if (align === 'center') ctx.fillText(r.text, W / 2, y);
              else ctx.fillText(r.text, fixedX ?? pad, y);
              y += r.h;
            }
            return;
          }
          fs *= 0.92;
        }
      };

      const fMul = o.fontSize;
      // ===== 排版系统 v2(重新设计,老板 20260920:字太大/方形竖版布局失衡→H 基准字号+区域配额+层级 标题>歌词>歌手) =====
      // 字号系数(×fMul):竖/方同系数 标题 H*.028 歌词 H*.023 歌手 H*.019(竖版 54/44/36px,方卡自动收敛 30/25/20px)
      // 间距节奏:封面→标题 H*.035 | 标题→歌手 H*.014 | 歌手→线 H*.028 | 线→歌词 H*.028 | 底部留 9.5% 给水印呼吸
      if (o.layout === 'landscape') {
        const pad = H * 0.1, bottomLimit = H * 0.9;
        const cs = o.showCover && img ? H * 0.68 : 0;
        const coverX = pad, coverY = (H - cs) / 2;
        if (cs > 0 && img) {
          ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 50; ctx.shadowOffsetX = 15;
          roundRect(ctx, coverX, coverY, cs, cs, cs * 0.06); ctx.clip(); ctx.drawImage(img, coverX, coverY, cs, cs); ctx.restore();
        }
        const textX = cs > 0 ? coverX + cs + pad : pad;
        const textW = W - textX - pad, xOff = textX + 24;
        let y = H * 0.16;
        if (o.showTitle) {
          ctx.font = `bold ${H * 0.056 * fMul}px ${FONT}`;
          ctx.fillStyle = colors.textColor; ctx.textAlign = 'left';
          const lc = drawWrappedText(ctx, title, xOff, y, textW - 24, H * .056 * fMul * 1.2);
          y += lc * H * .056 * fMul * 1.2 + H * 0.012;
        }
        if (o.showArtist) {
          ctx.font = `${H * 0.033 * fMul}px ${FONT}`;
          ctx.fillStyle = colors.subColor; ctx.textAlign = 'left';
          ctx.fillText(artist, xOff, y);
          y += H * .033 * fMul * 1.4 + H * 0.03;
        }
        let endY = y;
        if (o.showLyric) {
          drawLyrics(y, bottomLimit - y, H * 0.042 * fMul, 'left', pad, xOff, textW - 24);
          const lyrLH = Math.min(H * .042 * fMul, (bottomLimit - y) / (o.lyricLines * 1.7 * o.lineSpacing)) * 1.6 * o.lineSpacing;
          endY = y + Math.max(0, (bottomLimit - y - lyrLH * o.lyricLines) / 2) + lyrLH * (o.lyricLines + 0.15);
        }
        ctx.strokeStyle = colors.accent; ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(textX, H * 0.16); ctx.lineTo(textX, endY); ctx.stroke();
      } else {
        // 竖版/方形:统一海报式结构(区域配额,顶部对齐,封面吃剩余空间,方卡封面收敛 62%)
        const sq = o.layout === 'square';
        const PAD = W * (sq ? 0.12 : 0.085);
        const fsTitle = H * 0.028 * fMul, fsLyric = H * 0.023 * fMul, fsArtist = H * 0.019 * fMul;
        const topY = H * 0.065, bottomLimit = H * 0.905;
        const headH = (o.showTitle ? fsTitle * 1.3 + H * 0.014 : 0) + (o.showArtist ? fsArtist * 1.4 + H * 0.028 : 0);
        const lyrH = o.showLyric ? H * 0.056 + o.lyricLines * fsLyric * 1.7 * o.lineSpacing : 0;
        let cs = 0;
        if (o.showCover && img) {
          const avail = bottomLimit - topY - headH - lyrH;
          cs = Math.min(sq ? W * 0.62 : W - PAD * 2, Math.max(W * 0.28, avail - H * 0.035));
        }
        let y = topY;
        if (cs > 0 && img) {
          const cx = (W - cs) / 2;
          ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = cs * 0.08; ctx.shadowOffsetY = cs * 0.03;
          roundRect(ctx, cx, y, cs, cs, cs * (sq ? 0.075 : 0.05)); ctx.clip(); ctx.drawImage(img, cx, y, cs, cs); ctx.restore();
          y += cs + H * 0.035;
        }
        if (o.showTitle) {
          ctx.font = `bold ${fsTitle}px ${FONT}`;
          ctx.fillStyle = colors.textColor; ctx.textAlign = 'center';
          const lc = drawWrappedText(ctx, title, W / 2, y, W - PAD * 2, fsTitle * 1.3);
          y += lc * fsTitle * 1.3 + H * 0.014;
        }
        if (o.showArtist) {
          ctx.font = `${fsArtist}px ${FONT}`;
          ctx.fillStyle = colors.subColor; ctx.textAlign = 'center';
          ctx.fillText(artist, W / 2, y);
          y += fsArtist * 1.4 + H * 0.028;
        }
        if (o.showLyric) {
          // 细分隔线:内容宽 60% 居中,accent 低透明(v2:与整体节奏统一)
          ctx.strokeStyle = colors.accent + (colors.isDark ? '55' : '44'); ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(W * 0.2, y); ctx.lineTo(W * 0.8, y); ctx.stroke();
          y += H * 0.028;
          drawLyrics(y, bottomLimit - y, fsLyric, 'center', PAD);
        }
      }

      // 水印(右下,品牌 mark+名)
      const wmFS = Math.round(W * 0.022), wmR = Math.round(W * 0.04), wmB = Math.round(H * 0.04);
      ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
      ctx.font = `bold ${wmFS}px ${FONT}`;
      ctx.fillStyle = colors.isDark ? 'rgba(255,255,255,0.6)' : 'rgba(30,30,30,0.5)';
      ctx.fillText('NextMusic', W - wmR, H - wmB);
      const tw = ctx.measureText('NextMusic').width;
      const mark = markImgRef.current;
      if (mark) {
        const mh = Math.round(wmFS * 1.3);
        ctx.drawImage(mark, W - wmR - tw - mh - wmFS * 0.55, H - wmB - mh / 2, mh, mh);
      } else {
        ctx.beginPath();
        ctx.fillStyle = '#1ED760';
        ctx.arc(W - wmR - tw - wmFS * 0.9, H - wmB, wmFS * 0.42, 0, Math.PI * 2);
        ctx.fill();
      }

      setDataUrl(canvas.toDataURL('image/png'));
    } finally { setRendering(false); }
  }, [song, lyrics]);

  useEffect(() => { render(opt); }, [opt, render]);

  // lxfix:实测容器尺寸算预览缩放——Dimensions.get('window') 是未缩放视口 px,而本组件在 HDMain 的 zoom:0.75 层内布局,
  // 两套坐标系混算 = 预览尺寸错乱(老板:歌词卡片缩放自适应异常)。onLayout 拿到的就是 zoom 层内布局 px,自洽。
  const [box, setBox] = useState({ w: 320, h: 420 });
  const narrow = Dimensions.get('window').width < 720; // 仅作窄屏堆叠阈值(粗粒度,误差可容忍)
  const size = CARD_SIZES[opt.layout];
  const scale = Math.min(box.w / size.w, box.h / size.h);
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
        <View style={[stP.body, narrow && stP.bodyCol]}>
          {/* 预览区 */}
          <View
            style={[stP.previewBox, narrow && { minHeight: 300 }]}
            onLayout={e => { const l = e.nativeEvent.layout; const w = Math.max(120, l.width - 36), h = Math.max(120, l.height - 36); setBox(p => (p.w === w && p.h === h ? p : { w, h })); }}
          >
            {dataUrl ? (
              <RNImage source={{ uri: dataUrl }} style={{ width: pw, height: ph, borderRadius: 12 }} />
            ) : <ActivityIndicator color={C.text2} />}
            {rendering ? <View style={stP.veil}><ActivityIndicator color="#fff" /><Text style={stP.veilText}>渲染中…</Text></View> : null}
          </View>
          {/* 选项区 */}
          <View style={[stP.opts, narrow && stP.optsNarrow]}>
            <Text style={stP.secTitle}>版式</Text>
            <View style={stP.row}>
              <Pill label="竖版" on={opt.layout === 'portrait'} onPress={() => setOpt(o => ({ ...o, layout: 'portrait' }))} />
              <Pill label="横版" on={opt.layout === 'landscape'} onPress={() => setOpt(o => ({ ...o, layout: 'landscape' }))} />
              <Pill label="方形" on={opt.layout === 'square'} onPress={() => setOpt(o => ({ ...o, layout: 'square' }))} />
            </View>
            <Text style={stP.secTitle}>配色</Text>
            <View style={stP.row}>
              <Pill label="专辑" on={opt.theme === 'album'} onPress={() => setOpt(o => ({ ...o, theme: 'album' }))} />
              <Pill label="浅色" on={opt.theme === 'light'} onPress={() => setOpt(o => ({ ...o, theme: 'light' }))} />
              <Pill label="深色" on={opt.theme === 'dark'} onPress={() => setOpt(o => ({ ...o, theme: 'dark' }))} />
            </View>
            <Text style={stP.secTitle}>弥散强度</Text>
            <View style={stP.row}>
              <Pill label="播放页" on={opt.blurLv === 0} onPress={() => setOpt(o => ({ ...o, blurLv: 0 }))} />
              <Pill label="深" on={opt.blurLv === 1} onPress={() => setOpt(o => ({ ...o, blurLv: 1 }))} />
              <Pill label="极深" on={opt.blurLv === 2} onPress={() => setOpt(o => ({ ...o, blurLv: 2 }))} />
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
          <Text style={stP.hint}>当前句高亮 · 配色「专辑」取封面主色 · 弥散v7</Text>
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
  bodyCol: { flexDirection: 'column' as const },
  optsNarrow: { width: '100%', borderLeftWidth: 0, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border, maxHeight: 328 } as ViewStyle, // lxfix:264→328,窄屏选项区不再挤成一条缝
  previewBox: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center', padding: 18, backgroundColor: 'rgba(255,255,255,.02)' },
  veil: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#00000066', alignItems: 'center', justifyContent: 'center', gap: 8 },
  veilText: { color: '#ffffffcc', fontSize: 11 },
  opts: { width: 296, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: C.border, padding: 14, gap: 6, overflowY: 'auto' as const } as ViewStyle, // v3.28:overflowY 为 RNW 属性,断言
  secTitle: { color: C.text3, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginTop: 8 },
  row: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6, marginTop: 6 },
  pill: { height: 28, borderRadius: 14, paddingHorizontal: 10, borderWidth: 1, borderColor: '#ffffff4d', backgroundColor: '#ffffff12', alignItems: 'center', justifyContent: 'center' }, // lxfix(09-21):描边+底色强化存在感(老板:不像按钮)
  pillOn: { backgroundColor: C.brand, borderColor: C.brand },
  pillText: { color: '#ffffffcc', fontSize: 11, fontWeight: '600' },
  valText: { color: '#ffffffcc', fontSize: 11, fontWeight: '700', alignSelf: 'center', minWidth: 44, textAlign: 'center', height: 22, lineHeight: 22, borderRadius: 11, backgroundColor: '#ffffff14', overflow: 'hidden' },
  foot: { flexDirection: 'row' as const, alignItems: 'center', padding: 14, gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  hint: { flex: 1, color: C.text3, fontSize: 11 },
  saveBtn: { height: 38, borderRadius: 19, backgroundColor: C.brand, paddingHorizontal: 20, flexDirection: 'row' as const, alignItems: 'center', gap: 7 },
  saveText: { color: '#0b0f0d', fontSize: 13, fontWeight: '800' },
});
