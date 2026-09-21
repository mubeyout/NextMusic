// lx161:歌词卡片分享(phone)——v3.37 重做对齐 Web 端 WebLyricCardModal 能力(老板:安卓端统一)
// 版式:竖版9:16/横版16:9/方形1:1 · 配色:专辑(blur封面氛围底)/浅色/深色 · 内容开关:封面/标题/歌手/歌词
// 行数3-7 · 字号/行距微调 · 品牌水印右下 · view-shot 截图 → MediaStore 存相册
import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Dimensions, Image, ScrollView } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { fixCoverUrl } from '../utils/cover'; // lxfix:kw 图床域名自愈
import { captureRef } from 'react-native-view-shot';
import { Icon } from '../theme/Icon';
import { C } from '../theme/tokens';
import { toast } from './Dialog';
import type { LyricLine } from '../services/lyric';
import type { SongItem } from '../services/server';
import { NativeModules } from 'react-native';

const Downloader = NativeModules.Downloader as { saveBase64ToGallery(b64: string, name: string): Promise<string> };

// [B 声波记忆 0921] 声波底纹伪随机高度(seed=songmid 稳定,20 根 20%-70%)
function waveHeights(seedStr: string): number[] {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
  const out: number[] = [];
  let x = (h >>> 0) || 1;
  for (let i = 0; i < 20; i++) { x = (Math.imul(x, 48271) + 11) >>> 0; out.push(0.2 + (x % 51) / 100); }
  return out;
}
const fmtMS = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

// 找当前高亮行索引前后各 N 行(时间单位:秒)
function windowLines(lyrics: LyricLine[] | null, positionSec: number, count: number): { lines: LyricLine[]; active: number } {
  if (!lyrics || !lyrics.length) return { lines: [], active: -1 };
  let idx = -1;
  for (let i = 0; i < lyrics.length; i++) if (lyrics[i].t <= positionSec) idx = i;
  if (idx < 0) idx = 0;
  const half = Math.floor((count - 1) / 2);
  const start = Math.max(0, Math.min(idx - half, lyrics.length - count));
  return { lines: lyrics.slice(start, start + count), active: idx - start };
}

type Layout = 'portrait' | 'landscape' | 'square'; // 与 Web 端 CARD_SIZES 对齐
type Theme = 'album' | 'light' | 'dark';

interface Opt { layout: Layout; theme: Theme; showCover: boolean; showTitle: boolean; showArtist: boolean; showLyric: boolean; lyricLines: number; fontSize: number; lineSpacing: number; blurLv: 0 | 1 | 2; }
// 弥散强度三档(与 web BLUR_LV 同配方:存在感=alpha×(1-veil))
const BLUR_LV = [
  { alpha: 0.5, veil: 0.62, radius: 100 },
  { alpha: 0.35, veil: 0.72, radius: 110 },
  { alpha: 0.22, veil: 0.82, radius: 120 },
] as const;

export function LyricCardModal({ visible, onClose, song, lyrics, positionSec }: {
  visible: boolean; onClose: () => void;
  song: SongItem; lyrics: LyricLine[] | null; positionSec: number;
}) {
  const cardRef = useRef<React.ElementRef<typeof View>>(null);
  const [saving, setSaving] = useState(false);
  const [opt, setOpt] = useState<Opt>({ layout: 'portrait', theme: 'album', showCover: true, showTitle: true, showArtist: true, showLyric: true, lyricLines: 5, fontSize: 1.0, lineSpacing: 1.0, blurLv: 0 });

  const win = Dimensions.get('window');
  // 卡片宽:竖屏手机可用高约束 9:16 优先(卡片必须完整可见,操作区在下方)
  const maxByH = (win.height - 250) * (opt.layout === 'portrait' ? 9 / 16 : opt.layout === 'square' ? 1 : 16 / 9);
  const cardW = opt.layout === 'landscape'
    ? Math.min(win.width - 40, 460, maxByH)
    : Math.min(win.width - 48, opt.layout === 'portrait' ? 320 : 340, maxByH);
  const cardH = Math.round(opt.layout === 'portrait' ? cardW * 16 / 9 : opt.layout === 'square' ? cardW : cardW * 9 / 16);

  // v2 区域配额:封面吃剩余空间(竖版上限 cardW-2PAD,方卡收敛 62%),同 Web 端 Canvas 逻辑
  const coverSize = (() => {
    if (opt.layout === 'landscape' || !opt.showCover) return 0;
    const PADW = cardW * (opt.layout === 'square' ? 0.12 : 0.085);
    const fsT2 = cardH * 0.028 * opt.fontSize, fsA2 = cardH * 0.019 * opt.fontSize, fsL2 = cardH * 0.023 * opt.fontSize;
    const headH = (opt.showTitle ? fsT2 * 1.3 + cardH * 0.014 : 0) + (opt.showArtist ? fsA2 * 1.4 + cardH * 0.028 : 0);
    const lyrH = opt.showLyric ? cardH * 0.056 + opt.lyricLines * fsL2 * 1.7 * opt.lineSpacing : 0;
    const avail = cardH * 0.84 - headH - lyrH;
    return Math.round(Math.min(opt.layout === 'square' ? cardW * 0.62 : cardW - PADW * 2, Math.max(cardW * 0.28, avail - cardH * 0.035)));
  })();

  const { lines, active } = useMemo(() => windowLines(lyrics, positionSec, opt.lyricLines), [lyrics, positionSec, opt.lyricLines]);

  const save = async () => {
    if (saving || !cardRef.current) return;
    setSaving(true);
    try {
      const dataUrl = await captureRef(cardRef, { format: 'png', quality: 1, result: 'data-uri' });
      const uri = await Downloader.saveBase64ToGallery(dataUrl, `NextMusic-${song.name}-${Date.now()}`);
      toast(uri ? '已保存到相册 Pictures/NextMusic' : '保存失败');
      onClose();
    } catch (e) {
      toast(`保存失败:${(e as Error).message.slice(0, 40)}`);
    }
    setSaving(false);
  };

  const dark = opt.theme === 'dark';
  const light = opt.theme === 'light';
  // 浅色/深色为纯色主题;专辑色延续 blur 封面氛围底(移动端无 canvas 取色,氛围底即专辑色近似)
  const tTitle = light ? '#1C1C1E' : '#FFFFFF';
  const tSub = light ? '#6E6E73' : '#FFFFFF99';
  const tLyric = light ? '#00000066' : '#FFFFFF73';
  const tLyricOn = light ? '#000000' : '#FFFFFF';
  const fMul = opt.fontSize;
  const gap = Math.round(7 * opt.lineSpacing);
  // ===== 排版系统 v2(与 Web 端 Canvas 同系数,H 基准+区域配额+层级 标题>歌词>歌手,老板 20260920 字太大) =====
  const fsT = cardH * 0.028 * fMul, fsL = cardH * 0.023 * fMul, fsA = cardH * 0.019 * fMul;
  const fsTr = cardH * 0.056 * fMul, fsLr = cardH * 0.042 * fMul, fsAr = cardH * 0.033 * fMul; // 横版左右结构放大

  // [B 声波记忆 0921] 横版三主题 token(LEO spec:浅色深灰系禁白,对比度红线 ≥#00000045)
  const wvLight = light, wvDark = dark;
  const wvTitle = wvLight ? '#1C1C1E' : '#FFFFFF';
  const wvSub = wvLight ? '#0000008C' : '#FFFFFF8C';
  const wvLyr = wvLight ? '#00000045' : '#FFFFFF4D';
  const wvLyrOn = wvLight ? '#111111' : '#FFFFFF';
  const wvAccent = wvLight ? '#0FAE4E' : '#1ED760';
  const wvTimeS = wvLight ? '#00000073' : '#FFFFFF59';
  const wvFoot = wvLight ? '#00000066' : '#FFFFFF52';
  const waves = useMemo(() => waveHeights(song.songmid || song.name), [song.songmid, song.name]);
  // 高亮词 v1:当前行中间词(空格/标点切分 2-4 字)品牌色
  const hlWord = (t: string): { pre: string; mid: string; post: string } => {
    const parts = t.split(/[\s,，。.!！?？、]+/).filter(Boolean);
    if (parts.length < 2) return { pre: '', mid: '', post: '' };
    const mid = parts[Math.floor(parts.length / 2)].slice(0, 4) || '';
    const i = t.indexOf(mid);
    return i < 0 || !mid ? { pre: '', mid: '', post: '' } : { pre: t.slice(0, i), mid, post: t.slice(i + mid.length) };
  };
  const fsWT = Math.max(cardH * 0.058, 15) * fMul, fsWA = Math.max(cardH * 0.034, 10) * fMul;
  const fsWL = Math.max(cardH * 0.048, 11.5) * fMul, fsWLOn = fsWL * 1.58;
  const fsWTm = Math.max(cardH * 0.05, 12.5), fsWTs = Math.max(cardH * 0.031, 9);
  const headCover = Math.round(cardH * 0.13);

  const pill = (on: boolean) => on ? st.pillOn : null;
  const pillText = (on: boolean) => [st.pillText, on && st.pillTextOn] as { color: string; fontSize: number; fontWeight: '600' | '800' }[];
  const Pill = ({ on, label, onPress, w }: { on?: boolean; label: string; onPress: () => void; w?: number }) => (
    <TouchableOpacity style={[st.pill, w ? { width: w } : null, pill(!!on)]} activeOpacity={0.72} onPress={onPress}>
      <Text style={pillText(!!on)}>{label}</Text>
    </TouchableOpacity>
  );

  const LyricWin = ({ fs }: { fs: number }) => (
    <View style={{ flex: 1, justifyContent: 'center', gap }}>
      {lines.length ? lines.map((l, i) => (
        <Text
          key={`${l.t}-${i}`}
          style={[st.lyric, { color: tLyric, fontSize: Math.round(fs), lineHeight: Math.round(fs * 1.7 * opt.lineSpacing) }, i === active && { color: tLyricOn, fontSize: Math.round(fs * 1.12), fontWeight: '800' }]}
          numberOfLines={2} ellipsizeMode="tail"
        >
          {l.text || '♪'}
        </Text>
      )) : <Text style={[st.lyric, { color: tLyricOn, fontSize: Math.round(fs) }]}>♪ 纯音乐,请欣赏</Text>}
    </View>
  );

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={st.scrim}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={{ alignItems: 'center' }}>
          {/* 卡片本体(截图目标) */}
          <View ref={cardRef} collapsable={false} style={[st.card, { width: cardW, height: cardH }]}>
            {/* 氛围底:逐参数复刻播放页(HDPlayer bgArt opacity.5 / bgVeil rgba(6,8,7,.62) 均匀纱;老板 13:00-13:58 三次指定参考,不加饱和/渐变=「清晰感」来源) */}
            {opt.theme === 'album' && song.img ? (
              <>
                <Image
                  source={{ uri: fixCoverUrl(song.img) }}
                  blurRadius={BLUR_LV[opt.blurLv].radius} resizeMode="cover"
                  style={{ position: 'absolute', left: '-15%', top: '-15%', width: '130%', height: '130%', opacity: BLUR_LV[opt.blurLv].alpha }}
                />
                <View style={[StyleSheet.absoluteFill, { backgroundColor: opt.layout === 'landscape' ? 'rgba(4,8,6,.42)' : `rgba(6,8,7,${BLUR_LV[opt.blurLv].veil})` }]} />
              </>
            ) : light ? (
              <LinearGradient colors={['#F2F5EF', '#E4EAE2']} style={StyleSheet.absoluteFill} />
            ) : (
              <LinearGradient colors={dark ? ['#26243A', '#101018'] : ['#3A3850', '#101018']} style={StyleSheet.absoluteFill} />
            )}

            {opt.layout === 'landscape' ? (
              // [B 声波记忆 0921] 横版重做(LEO spec):头部条+居中左对齐歌词+高亮词+声波底纹+引号装饰——不在旧左右结构上缝
              <View style={st.waveBody}>
                <View style={st.waveHead}>
                  {opt.showCover && (
                    song.img ? (
                      <Image source={{ uri: fixCoverUrl(song.img) }} style={{ width: headCover, height: headCover, borderRadius: Math.round(headCover * 0.2) }} />
                    ) : (
                      <View style={[st.coverFallback, { width: headCover, height: headCover, borderRadius: Math.round(headCover * 0.2) }]}><Icon name="music" size={18} color="#ffffff66" /></View>
                    )
                  )}
                  <View style={{ flex: 1, minHeight: 0, marginLeft: opt.showCover ? Math.round(cardH * 0.035) : 0 }}>
                    {opt.showTitle && (
                      <Text style={{ color: wvTitle, fontSize: Math.round(fsWT), fontWeight: '800' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                        {song.name}
                      </Text>
                    )}
                    {opt.showArtist && (
                      <Text style={{ color: wvSub, fontSize: Math.round(fsWA), marginTop: 2 }} numberOfLines={1}>
                        {song.singer}{song.albumName ? ` · ${song.albumName}` : ''}
                      </Text>
                    )}
                  </View>
                  <View style={st.waveTime}>
                    <Text style={{ color: wvAccent, fontSize: Math.round(fsWTm), fontWeight: '800', fontVariant: ['tabular-nums'] }}>{fmtMS(positionSec)}</Text>
                    <Text style={{ color: wvTimeS, fontSize: Math.round(fsWTs), fontVariant: ['tabular-nums'] }}>/ {song.interval || '--:--'}</Text>
                  </View>
                </View>
                {opt.showLyric && (
                  <View style={{ flex: 1, justifyContent: 'center', minHeight: 0 }}>
                    {lines.length ? lines.map((l, i) => {
                      const on = i === active;
                      const hl = on ? hlWord(l.text || '') : null;
                      return (
                        <Text
                          key={`${l.t}-${i}`}
                          style={{ color: on ? wvLyrOn : wvLyr, fontSize: Math.round(on ? fsWLOn : fsWL), fontWeight: on ? '800' : '400', lineHeight: Math.round(fsWL * 1.5 * opt.lineSpacing) }}
                          numberOfLines={1} ellipsizeMode="tail"
                        >
                          {on && hl && hl.mid ? <>{hl.pre}<Text style={{ color: wvAccent }}>{hl.mid}</Text>{hl.post}</> : (l.text || '♪')}
                        </Text>
                      );
                    }) : <Text style={{ color: wvLyrOn, fontSize: Math.round(fsWL) }}>♪ 纯音乐,请欣赏</Text>}
                  </View>
                )}
                {/* 声波底纹:20 根圆顶条,品牌色 44%→4% 渐隐(浅 30%→6%) */}
                <View style={[st.waveBars, { height: Math.round(cardH * 0.139) }]}>
                  {waves.map((h, i) => (
                    <View key={i} style={{
                      flex: 1, height: `${Math.round(h * 100)}%`, borderRadius: 999,
                      backgroundColor: wvAccent,
                      opacity: 0.44 - (i / waves.length) * 0.4 * (wvLight ? 0.68 : 1) * (0.44 / 0.44),
                    }} />
                  ))}
                </View>
                {/* 装饰引号(纯装饰) */}
                <Text style={[st.waveQuote, { fontSize: Math.round(cardH * 0.1), color: wvLight ? '#000000' : '#FFFFFF', opacity: wvLight ? 0.08 : 0.06 }]}>”</Text>
                {/* 页脚:左 NEXT MUSIC · 右 分享自 */}
                <View style={st.waveFoot}>
                  <Text style={{ color: wvFoot, fontSize: Math.max(Math.round(cardH * 0.028), 9), fontWeight: '700', letterSpacing: 1 }}>
                    NEXT <Text style={{ color: wvAccent }}>MUSIC</Text>
                  </Text>
                  <Text style={{ color: wvFoot, fontSize: Math.max(Math.round(cardH * 0.028), 9), letterSpacing: 1 }}>· 分享自 NextMusic</Text>
                </View>
              </View>
            ) : (
              // 竖版/方形:统一海报式结构(v2 区域配额,同 Web 端系数)
              <View style={st.cardBody}>
                {opt.showCover && (
                  <View style={[st.coverWrap, { marginTop: Math.round(cardH * 0.02), marginBottom: Math.round(cardH * 0.035) }]}>
                    {song.img ? (
                      <Image source={{ uri: fixCoverUrl(song.img) }} style={[st.cover, { width: Math.round(coverSize), height: Math.round(coverSize), borderRadius: Math.round(coverSize * (opt.layout === 'square' ? 0.075 : 0.05)) }]} />
                    ) : (
                      <View style={[st.cover, st.coverFallback, { width: Math.round(coverSize), height: Math.round(coverSize) }]}><Icon name="music" size={30} color="#ffffff66" /></View>
                    )}
                  </View>
                )}
                {opt.showTitle && (
                  <Text style={{ color: tTitle, fontSize: Math.round(fsT), fontWeight: '800', textAlign: 'center' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                    {song.name}
                  </Text>
                )}
                {opt.showArtist && (
                  <Text style={{ color: tSub, fontSize: Math.round(fsA), marginTop: Math.round(cardH * 0.014), marginBottom: Math.round(cardH * 0.028), textAlign: 'center' }} numberOfLines={1}>
                    {song.singer}{song._types?.flac ? ' · 无损' : ''}
                  </Text>
                )}
                {opt.showLyric && <View style={{ height: 1, backgroundColor: light ? '#0000001A' : '#1ED76055', marginHorizontal: Math.round(cardW * 0.2) }} />}
                {opt.showLyric && <View style={{ height: Math.round(cardH * 0.028) }} />}
                {opt.showLyric && <LyricWin fs={fsL} />}
              </View>
            )}

            {/* 品牌水印右下 */}
            <View style={st.brandRow}>
              <Image source={require('../assets/brand/mark.png')} style={st.brandMark} />
              <Text style={[st.brandText, light && { color: '#1C1C1E99' }]}>NextMusic</Text>
            </View>
          </View>

          {/* 操作区(截图范围外) */}
          {/* lxfix(老板 09-21 排布+按钮观感):分区标签对齐 Web 端;字号/行距分组容器防折行错位;按钮强化存在感 */}
          <ScrollView style={st.ops} contentContainerStyle={st.opsInner} showsVerticalScrollIndicator={false}>
            <Text style={st.secTitle}>版式</Text>
            <View style={st.opsRow}>
              <Pill label="竖版" on={opt.layout === 'portrait'} onPress={() => setOpt(o => ({ ...o, layout: 'portrait' }))} />
              <Pill label="方形" on={opt.layout === 'square'} onPress={() => setOpt(o => ({ ...o, layout: 'square' }))} />
              <Pill label="横版" on={opt.layout === 'landscape'} onPress={() => setOpt(o => ({ ...o, layout: 'landscape' }))} />
            </View>
            <Text style={st.secTitle}>配色</Text>
            <View style={st.opsRow}>
              <Pill label="专辑" on={opt.theme === 'album'} onPress={() => setOpt(o => ({ ...o, theme: 'album' }))} />
              <Pill label="浅色" on={opt.theme === 'light'} onPress={() => setOpt(o => ({ ...o, theme: 'light' }))} />
              <Pill label="深色" on={opt.theme === 'dark'} onPress={() => setOpt(o => ({ ...o, theme: 'dark' }))} />
            </View>
            <Text style={st.secTitle}>弥散强度</Text>
            <View style={st.opsRow}>
              <Pill label="播放页" on={opt.blurLv === 0} onPress={() => setOpt(o => ({ ...o, blurLv: 0 }))} />
              <Pill label="深" on={opt.blurLv === 1} onPress={() => setOpt(o => ({ ...o, blurLv: 1 }))} />
              <Pill label="极深" on={opt.blurLv === 2} onPress={() => setOpt(o => ({ ...o, blurLv: 2 }))} />
            </View>
            <Text style={st.secTitle}>显示内容</Text>
            <View style={st.opsRow}>
              <Pill label="封面" on={opt.showCover} onPress={() => setOpt(o => ({ ...o, showCover: !o.showCover }))} />
              <Pill label="标题" on={opt.showTitle} onPress={() => setOpt(o => ({ ...o, showTitle: !o.showTitle }))} />
              <Pill label="歌手" on={opt.showArtist} onPress={() => setOpt(o => ({ ...o, showArtist: !o.showArtist }))} />
              <Pill label="歌词" on={opt.showLyric} onPress={() => setOpt(o => ({ ...o, showLyric: !o.showLyric }))} />
            </View>
            <Text style={st.secTitle}>歌词行数</Text>
            <View style={st.opsRow}>
              {[3, 4, 5, 6, 7].map(n => (
                <Pill key={n} label={`${n}`} w={34} on={opt.lyricLines === n} onPress={() => setOpt(o => ({ ...o, lyricLines: n }))} />
              ))}
            </View>
            <Text style={st.secTitle}>字号 / 行距</Text>
            <View style={st.ctlGroup}>
              <Pill label="A−" w={40} onPress={() => setOpt(o => ({ ...o, fontSize: Math.max(0.8, +(o.fontSize - 0.05).toFixed(2)) }))} />
              <Text style={st.valPill}>{Math.round(opt.fontSize * 100)}%</Text>
              <Pill label="A+" w={40} onPress={() => setOpt(o => ({ ...o, fontSize: Math.min(1.25, +(o.fontSize + 0.05).toFixed(2)) }))} />
            </View>
            <View style={st.ctlGroup}>
              <Pill label="行−" w={46} onPress={() => setOpt(o => ({ ...o, lineSpacing: Math.max(0.9, +(o.lineSpacing - 0.1).toFixed(1)) }))} />
              <Text style={st.valPill}>{opt.lineSpacing.toFixed(1)}</Text>
              <Pill label="行+" w={46} onPress={() => setOpt(o => ({ ...o, lineSpacing: Math.min(1.5, +(o.lineSpacing + 0.1).toFixed(1)) }))} />
            </View>
            <TouchableOpacity style={[st.opMain, saving && { opacity: 0.6 }]} disabled={saving} onPress={save}>
              <Icon name="download" size={17} color="#0b0f0d" />
              <Text style={st.opMainText}>{saving ? '生成中…' : '保存图片'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: '#000000CC', alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 22, overflow: 'hidden', backgroundColor: '#101018' },
  cardBody: { flex: 1, padding: 22, paddingBottom: 26 },
  cardBodyRow: { flex: 1, flexDirection: 'row', padding: 20, gap: 16, alignItems: 'center' },
  coverWrap: { alignSelf: 'center', marginTop: 4, marginBottom: 14 },
  cover: {
    width: 108, height: 108, borderRadius: 16,
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  coverWrapRow: { alignSelf: 'stretch', justifyContent: 'center' },
  coverRow: { width: 96, height: 96, borderRadius: 14 },
  coverFallback: { backgroundColor: '#ffffff14', alignItems: 'center', justifyContent: 'center' },
  lyric: { textAlign: 'center' },
  brandRow: { position: 'absolute', right: 16, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 5 },
  brandMark: { width: 13, height: 13 },
  brandText: { color: '#ffffffb3', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  // [B 声波记忆 0921] 横版结构样式
  waveBody: { flex: 1, paddingVertical: 14, paddingHorizontal: 18 }, // H×0.037/0.042 缩放后手机档基准,TV 档由 cardW 撑大
  waveHead: { flexDirection: 'row', alignItems: 'center', gap: 0 },
  waveTime: { alignItems: 'flex-end', marginLeft: 10 },
  waveBars: { flexDirection: 'row', gap: 3, alignItems: 'flex-end', marginTop: 10, marginBottom: 4 },
  waveQuote: { position: 'absolute', top: -6, right: 14, fontWeight: '400' },
  waveFoot: { position: 'absolute', left: 18, right: 18, bottom: 8, flexDirection: 'row', justifyContent: 'space-between' },
  ops: { marginTop: 12, maxHeight: 268, width: '100%' },
  opsInner: { alignItems: 'center', gap: 7, paddingHorizontal: 16 },
  secTitle: { color: '#ffffff59', fontSize: 10, fontWeight: '700', letterSpacing: 2, marginTop: 2 },
  opsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  ctlGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 }, // 字号/行距组:整组不折行,数值胶囊居中
  pill: { height: 32, borderRadius: 16, paddingHorizontal: 14, borderWidth: 1, borderColor: '#ffffff5c', justifyContent: 'center', backgroundColor: '#ffffff1f' },
  pillOn: { backgroundColor: C.brand, borderColor: C.brand },
  pillText: { color: '#ffffffe6', fontSize: 12, fontWeight: '600' },
  pillTextOn: { color: '#0b0f0d', fontWeight: '800' },
  valPill: { color: '#ffffffcc', fontSize: 11, fontWeight: '700', minWidth: 46, textAlign: 'center', height: 24, lineHeight: 24, borderRadius: 12, backgroundColor: '#ffffff17', overflow: 'hidden' },
  opMain: { height: 42, borderRadius: 21, backgroundColor: '#1ED760', paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4 },
  opMainText: { color: '#0b0f0d', fontSize: 13, fontWeight: '800' },
});
