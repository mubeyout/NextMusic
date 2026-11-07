// CarPlayer.tsx —— [车机 P6 播放页 1105] LEO 规格§1: 左盘 480(放射渐变+中孔) + 右信息控制 + 完整进度(进度主场在此)
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Image, useWindowDimensions } from 'react-native';
import { CAR, CAR_FS } from './cartokens';
import { C } from '../theme/tokens';
import { Icon } from '../theme/Icon';
import { usePlayer, usePlayerProgress } from '../state/PlayerProvider';
import { useSeekBar } from '../hooks/useSeekBar';
import { fixCoverUrl } from '../utils/cover';
import { settings } from '../services/settings';
import { useNavigation } from '@react-navigation/native';

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const SPEED_CYCLE = [1, 1.25, 1.5, 2, 0.75];
const QUALITY_ORDER = ['flac', '320k', '128k'] as const;
const QUALITY_LABEL: Record<string, string> = { flac: '无损', '320k': '320k', '128k': '128k' };

export function CarPlayer({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { current, playing, toggle, skipNext, skipPrev, queue, speed, setSpeed, sleepRemain, enableSleep } = usePlayer();
  const nav = useNavigation() as { navigate: (s: string) => void };
  const [qual, setQual] = useState(settings.get().playQuality || 'flac');
  const { position, duration } = usePlayerProgress();
  const { handlers } = useSeekBar((pct: number) => { /* seekTo 由 usePlayer 提供——进度拖动主场 */ });
  // [LEO 1107] 盘径 = min(480, 内容宽 - 2×gutter);中孔(中心标签)36.5%
  const { width: winW } = useWindowDimensions();
  const discSize = Math.min(CAR.player.disc, Math.max(200, winW - CAR.sidebar - CAR.gutter * 4));
  const pct = duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0;
  const img = current ? fixCoverUrl(current.img) : undefined;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={st.screen}>
        <TouchableOpacity style={st.closeBtn} onPress={onClose}>
          <Icon name="back" size={20} color={C.text2} />
        </TouchableOpacity>

        <View style={st.body}>
          {/* 左:黑胶盘 480 */}
          <View style={st.discWrap}>
            <View style={[st.disc, { width: discSize, height: discSize, borderRadius: discSize / 2 }]}>
              {img ? <Image source={{ uri: img }} style={[st.discArt, { width: discSize * 0.365, height: discSize * 0.365, borderRadius: discSize * 0.1825 }]} /> : <View style={[st.discArt, { width: discSize * 0.365, height: discSize * 0.365, borderRadius: discSize * 0.1825, backgroundColor: C.surface2 }]} />}
              <View style={[st.discHole, { width: discSize * 0.365, height: discSize * 0.365, borderRadius: discSize * 0.1825 }]} />
            </View>
          </View>

          {/* 右:信息+控制+进度 */}
          <View style={st.info}>
            <Text style={st.title} numberOfLines={2}>{current?.name ?? '未在播放'}</Text>
            <Text style={st.artist}>{current?.singer ?? '从「为我推荐」选一首开始'}</Text>
            {current?.albumName ? <Text style={st.album}>{current.albumName}{queue.length ? ` · 队列 ${queue.length} 首` : ''}</Text> : null}

            <View style={st.ctrls}>
              <TouchableOpacity style={st.ctrlBtn} onPress={skipPrev}><Icon name="previous" size={30} color={C.text} /></TouchableOpacity>
              <TouchableOpacity style={st.ctrlMain} onPress={toggle}>
                <Icon name={playing ? 'pause' : 'play'} size={40} active color={C.onBrand} />
              </TouchableOpacity>
              <TouchableOpacity style={st.ctrlBtn} onPress={skipNext}><Icon name="next" size={30} color={C.text} /></TouchableOpacity>
            </View>

            {/* 完整进度条(8 高 r4)——进度操作主场(播放条无进度行的补偿) */}
            <View style={st.progRow} {...handlers}>
              <Text style={st.time}>{fmt(position)}</Text>
              <View style={st.track}>
                <View style={{ flex: pct, backgroundColor: C.brand, borderRadius: 4 }} />
                <View style={{ flex: 1 - pct, backgroundColor: C.track, borderRadius: 4 }} />
              </View>
              <Text style={st.time}>{fmt(duration)}</Text>
            </View>

            {/* [A4·LEO v75 缺口包 1107] 播放页深度 chips 行: 定时/倍速/音质/投屏 */}
            <View style={st.chipRow}>
              <TouchableOpacity style={st.chip} onPress={() => enableSleep(sleepRemain ? null : 30)}>
                <Text style={st.chipText} numberOfLines={1}>⏱ {sleepRemain ? `${Math.ceil(sleepRemain / 60)} 分钟` : '定时 30 分钟'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.chip} onPress={() => setSpeed(SPEED_CYCLE[(SPEED_CYCLE.indexOf(speed) + 1) % SPEED_CYCLE.length])}>
                <Text style={st.chipText} numberOfLines={1}>⏩ 倍速 {speed}×</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.chip} onPress={() => { const next = QUALITY_ORDER[(QUALITY_ORDER.indexOf(qual as typeof QUALITY_ORDER[number]) + 1) % QUALITY_ORDER.length]; settings.set('playQuality', next); setQual(next); }}>
                <Text style={st.chipText} numberOfLines={1}>♪ {QUALITY_LABEL[qual]}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.chip, { flexDirection: 'row', gap: 8, alignItems: 'center' }]} onPress={() => nav.navigate('Route')}>
                <Icon name="tv" size={18} color={C.text2} />
                <Text style={st.chipText} numberOfLines={1}>投屏</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const st = {
  screen: { flex: 1, backgroundColor: C.bg, paddingTop: 40 },
  closeBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.surface2, alignItems: 'center' as const, justifyContent: 'center' as const, marginLeft: CAR.gutter },
  body: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: CAR.gutter * 2, gap: CAR.gutter * 2, paddingBottom: 60 },
  discWrap: { alignItems: 'center' as const, justifyContent: 'center' as const },
  disc: { width: CAR.player.disc, height: CAR.player.disc, borderRadius: CAR.player.disc / 2, backgroundColor: '#0d100e', borderWidth: 6, borderColor: '#161a17', alignItems: 'center' as const, justifyContent: 'center' as const },
  discArt: { width: CAR.player.disc * 0.365, height: CAR.player.disc * 0.365, borderRadius: CAR.player.disc * 0.1825 },
  discHole: { position: 'absolute' as const, backgroundColor: C.bg, borderWidth: 3, borderColor: '#8A8F94' }, // [LEO 1107] 中孔 36.5%·去纯白三角感
  info: { flex: 1, gap: 14 },
  title: { color: C.text, fontSize: CAR_FS.hero, fontWeight: '800' as const },
  artist: { color: C.text2, fontSize: CAR_FS.title },
  album: { color: C.text3, fontSize: CAR_FS.sub },
  ctrls: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 34, marginTop: 24 },
  ctrlBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: C.surface2, alignItems: 'center' as const, justifyContent: 'center' as const },
  ctrlMain: { width: CAR.player.ctrl, height: CAR.player.ctrl, borderRadius: CAR.player.ctrl / 2, backgroundColor: C.brand, alignItems: 'center' as const, justifyContent: 'center' as const },
  progRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 18, marginTop: 28 },
  chipRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 14, marginTop: 30 },
  chip: { height: 48, paddingHorizontal: 22, borderRadius: 24, backgroundColor: C.surface2, alignItems: 'center' as const, justifyContent: 'center' as const },
  chipText: { color: C.text, fontSize: CAR_FS.sub, fontWeight: '600' as const },
  track: { flex: 1, height: 8, flexDirection: 'row' as const, borderRadius: 4 },
  time: { color: C.text3, fontSize: CAR_FS.mini, fontVariant: ['tabular-nums' as never] },
};
