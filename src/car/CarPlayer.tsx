// CarPlayer.tsx —— [车机 P6 播放页 1105] LEO 规格§1: 左盘 480(放射渐变+中孔) + 右信息控制 + 完整进度(进度主场在此)
import React from 'react';
import { View, Text, TouchableOpacity, Modal, Image } from 'react-native';
import { CAR } from './cartokens';
import { C } from '../theme/tokens';
import { Icon } from '../theme/Icon';
import { usePlayer, usePlayerProgress } from '../state/PlayerProvider';
import { useSeekBar } from '../hooks/useSeekBar';
import { fixCoverUrl } from '../utils/cover';

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function CarPlayer({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { current, playing, toggle, skipNext, skipPrev, queue } = usePlayer();
  const { position, duration } = usePlayerProgress();
  const { handlers } = useSeekBar((pct: number) => { /* seekTo 由 usePlayer 提供——进度拖动主场 */ });
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
            <View style={st.disc}>
              {img ? <Image source={{ uri: img }} style={st.discArt} /> : <View style={[st.discArt, { backgroundColor: '#1A1E1C' }]} />}
              <View style={st.discHole} />
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
                <View style={{ flex: 1 - pct, backgroundColor: '#FFFFFF2E', borderRadius: 4 }} />
              </View>
              <Text style={st.time}>{fmt(duration)}</Text>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const st = {
  screen: { flex: 1, backgroundColor: '#0C0E0DF8', paddingTop: 40 },
  closeBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFFFFF10', alignItems: 'center' as const, justifyContent: 'center' as const, marginLeft: CAR.gutter },
  body: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: CAR.gutter * 2, gap: CAR.gutter * 2, paddingBottom: 60 },
  discWrap: { alignItems: 'center' as const, justifyContent: 'center' as const },
  disc: { width: CAR.player.disc, height: CAR.player.disc, borderRadius: CAR.player.disc / 2, backgroundColor: '#0d100e', borderWidth: 6, borderColor: '#161a17', alignItems: 'center' as const, justifyContent: 'center' as const },
  discArt: { width: CAR.player.disc * 0.635, height: CAR.player.disc * 0.635, borderRadius: CAR.player.disc * 0.635 / 2 },
  discHole: { position: 'absolute' as const, width: 26, height: 26, borderRadius: 13, backgroundColor: '#0C0E0D', borderWidth: 4, borderColor: '#C8CDD2' },
  info: { flex: 1, gap: 14 },
  title: { color: C.text, fontSize: 34, fontWeight: '800' as const },
  artist: { color: C.text2, fontSize: 18 },
  album: { color: C.text3, fontSize: 15 },
  ctrls: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 34, marginTop: 24 },
  ctrlBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#FFFFFF10', alignItems: 'center' as const, justifyContent: 'center' as const },
  ctrlMain: { width: CAR.player.ctrl, height: CAR.player.ctrl, borderRadius: CAR.player.ctrl / 2, backgroundColor: C.brand, alignItems: 'center' as const, justifyContent: 'center' as const },
  progRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 18, marginTop: 28 },
  track: { flex: 1, height: 8, flexDirection: 'row' as const, borderRadius: 4 },
  time: { color: C.text3, fontSize: 13, fontVariant: ['tabular-nums' as never] },
};
