// lx161:歌词卡片分享(phone)——封面模糊底 + 歌名/歌手 + 当前歌词数行 + 品牌 watermark
// view-shot 截图 → base64 → 原生 MediaStore 存相册;对齐 Web 端 lyric-card 能力
import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Dimensions, Image } from 'react-native';
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

export function LyricCardModal({ visible, onClose, song, lyrics, positionSec }: {
  visible: boolean; onClose: () => void;
  song: SongItem; lyrics: LyricLine[] | null; positionSec: number;
}) {
  const cardRef = useRef<React.ElementRef<typeof View>>(null);
  const [saving, setSaving] = useState(false);
  const [lineCount, setLineCount] = useState(5);
  const W = Dimensions.get('window').width;
  const cardW = Math.min(W - 48, 340);
  const cardH = Math.round(cardW * 1.42); // 传单比例

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

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={st.scrim}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={{ alignItems: 'center' }}>
          {/* 卡片本体(截图目标) */}
          <View ref={cardRef} collapsable={false} style={[st.card, { width: cardW, height: cardH }]}>
            {song.img ? (
              <>
                <Image source={{ uri: song.img }} style={StyleSheet.absoluteFill} />
                <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000000AA' }]} />
              </>
            ) : <View style={[StyleSheet.absoluteFill, { backgroundColor: '#151817' }]} />}
            <View style={st.cardBody}>
              <View style={st.songHead}>
                {song.img ? <Image source={{ uri: song.img }} style={st.cover} /> : <View style={[st.cover, st.coverFallback]}><Icon name="music" size={26} color="#ffffff88" /></View>}
                <View style={{ flex: 1 }}>
                  <Text style={st.cardTitle} numberOfLines={1}>{song.name}</Text>
                  <Text style={st.cardSub} numberOfLines={1}>{song.singer}{song._types?.flac ? ' · 无损' : ''}</Text>
                </View>
              </View>
              <View style={{ flex: 1, justifyContent: 'center', gap: 10 }}>
                {lines.length ? lines.map((l, i) => (
                  <Text key={`${l.t}-${i}`} style={[st.lyric, i === active && st.lyricOn]} numberOfLines={1}>
                    {l.text || '♪'}
                  </Text>
                )) : <Text style={[st.lyric, st.lyricOn]}>♪ 纯音乐,请欣赏</Text>}
              </View>
              <View style={st.brandRow}>
                <View style={st.brandDot} />
                <Text style={st.brandText}>NextMusic</Text>
              </View>
            </View>
          </View>

          {/* 操作区(截图范围外) */}
          <View style={st.ops}>
            <TouchableOpacity style={st.opGhost} onPress={() => setLineCount(c => (c >= 7 ? 3 : c + 2))}>
              <Text style={st.opGhostText}>{lineCount} 行歌词 · 调整</Text>
            </TouchableOpacity>
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
  card: { borderRadius: 22, overflow: 'hidden' },
  cardBody: { flex: 1, padding: 22 },
  songHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cover: { width: 52, height: 52, borderRadius: 10 },
  coverFallback: { backgroundColor: '#ffffff14', alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  cardSub: { color: '#ffffff99', fontSize: 12, marginTop: 3 },
  lyric: { color: '#ffffff77', fontSize: 14, lineHeight: 22, textAlign: 'center' },
  lyricOn: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  brandDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#1ED760' },
  brandText: { color: '#ffffffcc', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  ops: { flexDirection: 'row', gap: 10, marginTop: 18, alignItems: 'center' },
  opGhost: { height: 42, borderRadius: 21, paddingHorizontal: 16, borderWidth: 1, borderColor: '#ffffff33', justifyContent: 'center' },
  opGhostText: { color: '#ffffffcc', fontSize: 12, fontWeight: '600' },
  opMain: { height: 42, borderRadius: 21, backgroundColor: '#1ED760', paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 7 },
  opMainText: { color: '#0b0f0d', fontSize: 13, fontWeight: '800' },
});
