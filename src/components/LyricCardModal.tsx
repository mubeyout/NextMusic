// lx161:歌词卡片分享(phone)——v2 重做(老板:手机端不好看),对齐 Web 端 lyric-card 审美
// 封面 blur 氛围底+压暗渐变 / 海报式大封面+阴影 / 歌词窗口高亮 / 品牌水印右下 / 竖版·方形两版式
// view-shot 截图 → base64 → 原生 MediaStore 存相册
import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Dimensions, Image } from 'react-native';
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

type Layout = 'poster' | 'square'; // 竖版 3:4 海报 / 方形 1:1

export function LyricCardModal({ visible, onClose, song, lyrics, positionSec }: {
  visible: boolean; onClose: () => void;
  song: SongItem; lyrics: LyricLine[] | null; positionSec: number;
}) {
  const cardRef = useRef<React.ElementRef<typeof View>>(null);
  const [saving, setSaving] = useState(false);
  const [lineCount, setLineCount] = useState(5);
  const [layout, setLayout] = useState<Layout>('poster');
  const W = Dimensions.get('window').width;
  const cardW = Math.min(W - 48, 340);
  const cardH = Math.round(layout === 'poster' ? cardW * 1.33 : cardW); // 3:4 / 1:1

  const { lines, active } = useMemo(() => windowLines(lyrics, positionSec, lineCount), [lyrics, positionSec, lineCount]);

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

  const pill = (on: boolean) => on ? st.pillOn : null;

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={st.scrim}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={{ alignItems: 'center' }}>
          {/* 卡片本体(截图目标) */}
          <View ref={cardRef} collapsable={false} style={[st.card, { width: cardW, height: cardH }]}>
            {/* 氛围底:封面放大 blur(裁掉采样边缘)+压暗渐变;无封面=深色渐变 */}
            {song.img ? (
              <>
                <Image
                  source={{ uri: song.img }}
                  blurRadius={70} resizeMode="cover"
                  style={{ position: 'absolute', left: '-8%', top: '-8%', width: '116%', height: '116%' }}
                />
                <LinearGradient colors={['#0000004D', '#00000026', '#000000CC']} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} />
              </>
            ) : (
              <LinearGradient colors={['#26243A', '#101018']} style={StyleSheet.absoluteFill} />
            )}

            <View style={st.cardBody}>
              {/* 海报式大封面(带投影) */}
              <View style={st.coverWrap}>
                {song.img ? (
                  <Image source={{ uri: song.img }} style={st.cover} />
                ) : (
                  <View style={[st.cover, st.coverFallback]}><Icon name="music" size={30} color="#ffffff66" /></View>
                )}
              </View>

              <Text style={st.cardTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{song.name}</Text>
              <Text style={st.cardSub} numberOfLines={1}>{song.singer}{song._types?.flac ? ' · 无损' : ''}</Text>

              <View style={st.divider} />

              {/* 歌词窗口:高亮当前句 */}
              {/* v3.35(老板:卡片挤压):去 adjustsFontSizeToFit 逐行缩字(iOS 特性,Android 截断+各行字号不一=挤压观感) */}
              <View style={{ flex: 1, justifyContent: 'center', gap: 7 }}>
                {lines.length ? lines.map((l, i) => (
                  <Text
                    key={`${l.t}-${i}`}
                    style={[st.lyric, i === active && st.lyricOn, i === active && { marginVertical: 2 }]}
                    numberOfLines={2} ellipsizeMode="tail"
                  >
                    {l.text || '♪'}
                  </Text>
                )) : <Text style={[st.lyric, st.lyricOn]}>♪ 纯音乐,请欣赏</Text>}
              </View>
            </View>

            {/* 品牌水印右下(v3.36:绿点换品牌 mark) */}
            <View style={st.brandRow}>
              <Image source={require('../assets/brand/mark.png')} style={st.brandMark} />
              <Text style={st.brandText}>NextMusic</Text>
            </View>
          </View>

          {/* 操作区(截图范围外) */}
          <View style={st.ops}>
            <View style={st.opsRow}>
              <TouchableOpacity style={[st.pill, pill(layout === 'poster')]} onPress={() => setLayout('poster')}>
                <Text style={[st.pillText, layout === 'poster' && st.pillTextOn]}>竖版</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.pill, pill(layout === 'square')]} onPress={() => setLayout('square')}>
                <Text style={[st.pillText, layout === 'square' && st.pillTextOn]}>方形</Text>
              </TouchableOpacity>
              {[3, 5, 7].map(n => (
                <TouchableOpacity key={n} style={[st.pill, pill(lineCount === n)]} onPress={() => setLineCount(n)}>
                  <Text style={[st.pillText, lineCount === n && st.pillTextOn]}>{n} 行</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={[st.opMain, saving && { opacity: 0.6 }]} disabled={saving} onPress={save}>
              <Icon name="download" size={17} color="#0b0f0d" />
              <Text style={st.opMainText}>{saving ? '生成中…' : '保存图片'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: '#000000CC', alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 22, overflow: 'hidden', backgroundColor: '#101018' },
  cardBody: { flex: 1, padding: 22, paddingBottom: 26 },
  coverWrap: { alignSelf: 'center', marginTop: 4, marginBottom: 14 },
  cover: {
    width: 108, height: 108, borderRadius: 16,
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  coverFallback: { backgroundColor: '#ffffff14', alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: '#fff', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  cardSub: { color: '#ffffff99', fontSize: 12, marginTop: 4, marginBottom: 12, textAlign: 'center' },
  divider: { height: 1, backgroundColor: '#1ED76055', marginHorizontal: 14 },
  lyric: { color: '#ffffff73', fontSize: 14, lineHeight: 23, textAlign: 'center' },
  lyricOn: { color: '#fff', fontSize: 16, fontWeight: '800' },
  brandRow: { position: 'absolute', right: 16, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 5 },
  brandMark: { width: 13, height: 13 },
  brandText: { color: '#ffffffb3', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  ops: { marginTop: 16, alignItems: 'center', gap: 10 },
  opsRow: { flexDirection: 'row', gap: 8 },
  pill: { height: 32, borderRadius: 16, paddingHorizontal: 14, borderWidth: 1, borderColor: '#ffffff33', justifyContent: 'center', backgroundColor: '#ffffff0d' },
  pillOn: { backgroundColor: C.brand, borderColor: C.brand },
  pillText: { color: '#ffffffcc', fontSize: 12, fontWeight: '600' },
  pillTextOn: { color: '#0b0f0d', fontWeight: '800' },
  opMain: { height: 42, borderRadius: 21, backgroundColor: '#1ED760', paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', gap: 7 },
  opMainText: { color: '#0b0f0d', fontSize: 13, fontWeight: '800' },
});
