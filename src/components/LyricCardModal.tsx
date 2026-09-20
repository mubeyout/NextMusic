// lx161:歌词卡片分享(phone)——v3.37 重做对齐 Web 端 WebLyricCardModal 能力(老板:安卓端统一)
// 版式:竖版9:16/横版16:9/方形1:1 · 配色:专辑(blur封面氛围底)/浅色/深色 · 内容开关:封面/标题/歌手/歌词
// 行数3-7 · 字号/行距微调 · 品牌水印右下 · view-shot 截图 → MediaStore 存相册
import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Dimensions, Image, ScrollView } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { captureRef } from 'react-native-view-shot';
import { Icon } from '../theme/Icon';
import { C } from '../theme/tokens';
import { toast } from './Dialog';
import type { LyricLine } from '../services/lyric';
import type { SongItem } from '../services/server';
import { NativeModules } from 'react-native';

const Downloader = NativeModules.Downloader as { saveBase64ToGallery(b64: string, name: string): Promise<string> };

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

interface Opt { layout: Layout; theme: Theme; showCover: boolean; showTitle: boolean; showArtist: boolean; showLyric: boolean; lyricLines: number; fontSize: number; lineSpacing: number; }

export function LyricCardModal({ visible, onClose, song, lyrics, positionSec }: {
  visible: boolean; onClose: () => void;
  song: SongItem; lyrics: LyricLine[] | null; positionSec: number;
}) {
  const cardRef = useRef<React.ElementRef<typeof View>>(null);
  const [saving, setSaving] = useState(false);
  const [opt, setOpt] = useState<Opt>({ layout: 'portrait', theme: 'album', showCover: true, showTitle: true, showArtist: true, showLyric: true, lyricLines: 5, fontSize: 1.0, lineSpacing: 1.0 });

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

  const pill = (on: boolean) => on ? st.pillOn : null;
  const pillText = (on: boolean) => [st.pillText, on && st.pillTextOn] as { color: string; fontSize: number; fontWeight: '600' | '800' }[];
  const Pill = ({ on, label, onPress, w }: { on?: boolean; label: string; onPress: () => void; w?: number }) => (
    <TouchableOpacity style={[st.pill, w ? { width: w } : null, pill(!!on)]} onPress={onPress}>
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
            {/* 氛围底:玻璃弥散(老板 20260920:高斯模糊+玻璃质感+弥散)——blur 封面+双层渐变近似径向渐晕 */}
            {opt.theme === 'album' && song.img ? (
              <>
                <Image
                  source={{ uri: song.img }}
                  blurRadius={100} resizeMode="cover"
                  style={{ position: 'absolute', left: '-15%', top: '-15%', width: '130%', height: '130%' }}
                />
                {/* 纵向弥散:顶部微亮→中部透→底部沉 */}
                <LinearGradient colors={['#ffffff12', '#00000000', '#000000C4']} locations={[0, 0.42, 1]} style={StyleSheet.absoluteFill} />
                {/* 对角弥散近似渐晕:左上浮光→右下压暗 */}
                <LinearGradient colors={['#ffffff0D', '#00000000', '#00000059']} locations={[0, 0.5, 1]} style={[StyleSheet.absoluteFill, { transform: [{ rotate: '45deg' }], width: '160%', height: '160%', left: '-30%', top: '-30%' }]} />
              </>
            ) : light ? (
              <LinearGradient colors={['#FAFAF6', '#EFEFE9']} style={StyleSheet.absoluteFill} />
            ) : (
              <LinearGradient colors={dark ? ['#26243A', '#101018'] : ['#3A3850', '#101018']} style={StyleSheet.absoluteFill} />
            )}

            {opt.layout === 'landscape' ? (
              // 横版:左封面右文字
              <View style={st.cardBodyRow}>
                {opt.showCover && (
                  <View style={st.coverWrapRow}>
                    {song.img ? (
                      <Image source={{ uri: song.img }} style={[st.coverRow, { width: Math.round(cardH * 0.68), height: Math.round(cardH * 0.68), borderRadius: Math.round(cardH * 0.04) }]} />
                    ) : (
                      <View style={[st.coverRow, st.coverFallback, { width: Math.round(cardH * 0.68), height: Math.round(cardH * 0.68) }]}><Icon name="music" size={26} color="#ffffff66" /></View>
                    )}
                  </View>
                )}
                <View style={{ flex: 1, minHeight: 0, justifyContent: 'center' }}>
                  {opt.showTitle && (
                    <Text style={{ color: tTitle, fontSize: Math.round(fsTr), fontWeight: '800' }} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
                      {song.name}
                    </Text>
                  )}
                  {opt.showArtist && (
                    <Text style={{ color: tSub, fontSize: Math.round(fsAr), marginTop: Math.round(cardH * 0.012) }}>{song.singer}{song._types?.flac ? ' · 无损' : ''}</Text>
                  )}
                  {opt.showLyric && <View style={{ height: 1, backgroundColor: light ? '#0000001A' : '#1ED76055', marginVertical: Math.round(cardH * 0.028) }} />}
                  {opt.showLyric && <LyricWin fs={fsLr} />}
                </View>
              </View>
            ) : (
              // 竖版/方形:统一海报式结构(v2 区域配额,同 Web 端系数)
              <View style={st.cardBody}>
                {opt.showCover && (
                  <View style={[st.coverWrap, { marginTop: Math.round(cardH * 0.02), marginBottom: Math.round(cardH * 0.035) }]}>
                    {song.img ? (
                      <Image source={{ uri: song.img }} style={[st.cover, { width: Math.round(coverSize), height: Math.round(coverSize), borderRadius: Math.round(coverSize * (opt.layout === 'square' ? 0.075 : 0.05)) }]} />
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
          <ScrollView style={st.ops} contentContainerStyle={st.opsInner} showsVerticalScrollIndicator={false}>
            <View style={st.opsRow}>
              <Pill label="竖版" on={opt.layout === 'portrait'} onPress={() => setOpt(o => ({ ...o, layout: 'portrait' }))} />
              <Pill label="方形" on={opt.layout === 'square'} onPress={() => setOpt(o => ({ ...o, layout: 'square' }))} />
              <Pill label="横版" on={opt.layout === 'landscape'} onPress={() => setOpt(o => ({ ...o, layout: 'landscape' }))} />
            </View>
            <View style={st.opsRow}>
              <Pill label="专辑" on={opt.theme === 'album'} onPress={() => setOpt(o => ({ ...o, theme: 'album' }))} />
              <Pill label="浅色" on={opt.theme === 'light'} onPress={() => setOpt(o => ({ ...o, theme: 'light' }))} />
              <Pill label="深色" on={opt.theme === 'dark'} onPress={() => setOpt(o => ({ ...o, theme: 'dark' }))} />
            </View>
            <View style={st.opsRow}>
              <Pill label="封面" on={opt.showCover} onPress={() => setOpt(o => ({ ...o, showCover: !o.showCover }))} />
              <Pill label="标题" on={opt.showTitle} onPress={() => setOpt(o => ({ ...o, showTitle: !o.showTitle }))} />
              <Pill label="歌手" on={opt.showArtist} onPress={() => setOpt(o => ({ ...o, showArtist: !o.showArtist }))} />
              <Pill label="歌词" on={opt.showLyric} onPress={() => setOpt(o => ({ ...o, showLyric: !o.showLyric }))} />
            </View>
            <View style={st.opsRow}>
              {[3, 4, 5, 6, 7].map(n => (
                <Pill key={n} label={`${n}`} w={34} on={opt.lyricLines === n} onPress={() => setOpt(o => ({ ...o, lyricLines: n }))} />
              ))}
            </View>
            <View style={st.opsRow}>
              <Pill label="A−" w={40} onPress={() => setOpt(o => ({ ...o, fontSize: Math.max(0.8, +(o.fontSize - 0.05).toFixed(2)) }))} />
              <Text style={st.valText}>{Math.round(opt.fontSize * 100)}%</Text>
              <Pill label="A+" w={40} onPress={() => setOpt(o => ({ ...o, fontSize: Math.min(1.25, +(o.fontSize + 0.05).toFixed(2)) }))} />
              <Pill label="行−" w={46} onPress={() => setOpt(o => ({ ...o, lineSpacing: Math.max(0.9, +(o.lineSpacing - 0.1).toFixed(1)) }))} />
              <Text style={st.valText}>{opt.lineSpacing.toFixed(1)}</Text>
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
  ops: { marginTop: 14, maxHeight: 210, width: '100%' },
  opsInner: { alignItems: 'center', gap: 8, paddingHorizontal: 16 },
  opsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  pill: { height: 32, borderRadius: 16, paddingHorizontal: 14, borderWidth: 1, borderColor: '#ffffff33', justifyContent: 'center', backgroundColor: '#ffffff0d' },
  pillOn: { backgroundColor: C.brand, borderColor: C.brand },
  pillText: { color: '#ffffffcc', fontSize: 12, fontWeight: '600' },
  pillTextOn: { color: '#0b0f0d', fontWeight: '800' },
  valText: { color: '#ffffffcc', fontSize: 11, alignSelf: 'center', minWidth: 34, textAlign: 'center' },
  opMain: { height: 42, borderRadius: 21, backgroundColor: '#1ED760', paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4 },
  opMainText: { color: '#0b0f0d', fontSize: 13, fontWeight: '800' },
});
