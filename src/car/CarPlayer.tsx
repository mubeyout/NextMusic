// CarPlayer.tsx —— [车机 P6 播放页 1110 老板令重排]: 封面模糊虚化背景+左信息控制(驾驶位)/右唱片;chips 真icon;内容大占比
import { CarTouch } from './CarTouch';
import React, { useState } from 'react';
import { View, Text, Modal, Image, useWindowDimensions, StyleSheet } from 'react-native';
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
  const { current, playing, toggle, skipNext, skipPrev, queue, speed, setSpeed, sleepRemain, enableSleep, shuffle, setShuffle, repeat, cycleRepeat } = usePlayer();
  const nav = useNavigation() as { navigate: (s: string) => void };
  const [qual, setQual] = useState(settings.get().playQuality || 'flac');
  const { position, duration } = usePlayerProgress();
  const { handlers } = useSeekBar((pct: number) => { /* seekTo 主场 */ });
  const { width: winW, height: winH } = useWindowDimensions();
  const pct = duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0;
  const img = current ? fixCoverUrl(current.img) : undefined;
  // [老板 1110] 唱片右置、加大: 取内容区高度与宽的较大约束(去底部 chips 让位)
  const bodyH = winH - 80;
  const discSize = Math.max(240, Math.min(CAR.player.disc, bodyH - 48, Math.round((winW - CAR.sidebar) * 0.38)));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={st.screen}>
        {/* [老板 1110] 封面模糊虚化背景 + 暗化渐层 */}
        {img ? <Image source={{ uri: img }} style={st.bgImg} blurRadius={60} /> : null}
        <View style={st.bgOverlay} />

        <CarTouch style={st.closeBtn} onPress={onClose}>
          <Icon name="back" size={22} color={C.text} />
        </CarTouch>

        <View style={st.body}>
          {/* 左:信息+控制(驾驶位操作区) */}
          <View style={st.info}>
            <Text style={st.title} numberOfLines={2}>{current?.name ?? '未在播放'}</Text>
            <Text style={st.artist} numberOfLines={1}>{current?.singer ?? '从「为我推荐」选一首开始'}</Text>

            <View style={st.ctrls}>
              <CarTouch style={st.ctrlBtn} onPress={() => setShuffle(!shuffle)}>
                <Icon name="shuffle" size={28} active={shuffle} color={shuffle ? C.brand : C.text} />
              </CarTouch>
              <CarTouch style={st.ctrlBtn} onPress={skipPrev}><Icon name="previous" size={34} color={C.text} /></CarTouch>
              <CarTouch style={st.ctrlMain} onPress={toggle}>
                <Icon name={playing ? 'pause' : 'play'} size={44} active color={C.onBrand} />
              </CarTouch>
              <CarTouch style={st.ctrlBtn} onPress={skipNext}><Icon name="next" size={34} color={C.text} /></CarTouch>
              <CarTouch style={st.ctrlBtn} onPress={cycleRepeat}>
                <Icon name="repeat" size={28} active={repeat !== 'off'} color={repeat !== 'off' ? C.brand : C.text} />
              </CarTouch>
            </View>

            {/* 完整进度条 */}
            <View style={st.progRow} {...handlers}>
              <Text style={st.time}>{fmt(position)}</Text>
              <View style={st.track}>
                <View style={{ flex: pct, backgroundColor: C.brand, borderRadius: 4 }} />
                <View style={{ flex: 1 - pct, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 4 }} />
              </View>
              <Text style={st.time}>{fmt(duration)}</Text>
            </View>

            {/* chips 行: 真icon(history=定时/volume=音质/tv=投屏/wave=倍速) */}
            <View style={st.chipRow}>
              <CarTouch style={st.chip} onPress={() => enableSleep(sleepRemain ? null : 30)}>
                <Icon name="history" size={22} color={sleepRemain ? C.brand : C.text2} />
                <Text style={[st.chipText, sleepRemain ? ({ color: C.brand } as const) : null]} numberOfLines={1}>{sleepRemain ? `${Math.ceil(sleepRemain / 60)} 分钟` : '定时'}</Text>
              </CarTouch>
              <CarTouch style={st.chip} onPress={() => setSpeed(SPEED_CYCLE[(SPEED_CYCLE.indexOf(speed) + 1) % SPEED_CYCLE.length])}>
                <Icon name="wave" size={22} color={C.text2} />
                <Text style={st.chipText} numberOfLines={1}>{speed}×</Text>
              </CarTouch>
              <CarTouch style={st.chip} onPress={() => { const next = QUALITY_ORDER[(QUALITY_ORDER.indexOf(qual as typeof QUALITY_ORDER[number]) + 1) % QUALITY_ORDER.length]; settings.set('playQuality', next); setQual(next); }}>
                <Icon name="volume" size={22} color={C.text2} />
                <Text style={st.chipText} numberOfLines={1}>{QUALITY_LABEL[qual]}</Text>
              </CarTouch>
              <CarTouch style={st.chip} onPress={() => nav.navigate('Route')}>
                <Icon name="tv" size={22} color={C.text2} />
                <Text style={st.chipText} numberOfLines={1}>投屏</Text>
              </CarTouch>
            </View>
          </View>

          {/* 右:唱片(封面加载,大面积) */}
          <View style={st.discWrap}>
            <View style={[st.disc, { width: discSize, height: discSize, borderRadius: discSize / 2 }]}>
              {img ? <Image source={{ uri: img }} style={[st.discArt, { width: discSize * 0.52, height: discSize * 0.52, borderRadius: discSize * 0.26 }]} /> : <View style={[st.discArt, { width: discSize * 0.52, height: discSize * 0.52, borderRadius: discSize * 0.26, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }]}><Icon name="music" size={48} color={C.text3} /></View>}
              <View style={[st.discHole, { width: discSize * 0.14, height: discSize * 0.14, borderRadius: discSize * 0.07 }]} />
            </View>
            {queue.length > 1 ? <Text style={st.queueHint}>队列 {queue.length} 首</Text> : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0a0a0c' },
  bgImg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  bgOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(6,6,10,0.72)' },
  closeBtn: { position: 'absolute', left: CAR.gutter, top: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: CAR.gutter * 2, gap: CAR.gutter * 2, paddingTop: 40, paddingBottom: 24 },
  info: { flex: 1, gap: 18 },
  title: { color: C.text, fontSize: CAR_FS.hero + 4, lineHeight: 40, fontWeight: '800' },
  artist: { color: 'rgba(255,255,255,0.72)', fontSize: CAR_FS.title + 2 },
  ctrls: { flexDirection: 'row', alignItems: 'center', gap: 30, marginTop: 16 },
  ctrlBtn: { width: 84, height: 84, borderRadius: 42, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  ctrlMain: { width: 110, height: 110, borderRadius: 55, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  progRow: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 20 },
  track: { flex: 1, height: 10, flexDirection: 'row', borderRadius: 5 },
  time: { color: 'rgba(255,255,255,0.65)', fontSize: CAR_FS.sub, fontVariant: ['tabular-nums' as never] },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 24 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 56, paddingHorizontal: 26, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.12)' },
  chipText: { color: C.text, fontSize: CAR_FS.sub, fontWeight: '600' },
  discWrap: { alignItems: 'center', justifyContent: 'center', gap: 14 },
  disc: { backgroundColor: '#111', borderWidth: 6, borderColor: '#1c1c22', alignItems: 'center', justifyContent: 'center', elevation: 24, shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 30 },
  discArt: { position: 'absolute' as never },
  discHole: { backgroundColor: '#0a0a0c', borderWidth: 4, borderColor: '#666' },
  queueHint: { color: 'rgba(255,255,255,0.55)', fontSize: CAR_FS.mini },
});
