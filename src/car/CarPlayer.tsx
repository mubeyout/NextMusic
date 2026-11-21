// CarPlayer.tsx —— [1121#4 老板令] 播放页对齐 Docker web 版(car.css #player):
// 左方形封面卡(r24,静态,弃黑胶)+右信息列(eyebrow/歌名/歌手/接下来卡/timeline/transport 居中/chips)
// 全控件 CarTouch(DPAD 遥控适配: 内描边焦点)
import { CarTouch } from './CarTouch';
import React, { useEffect, useState } from 'react';
import { View, Text, Modal, Image, useWindowDimensions, StyleSheet, Animated, Easing } from 'react-native';
import { CAR_FS } from './cartokens';
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

export function CarPlayer({ visible, onClose, onArtistTap }: { visible: boolean; onClose: () => void; onArtistTap: (singer: string) => void }) {
  const { current, playing, toggle, skipNext, skipPrev, queue, speed, setSpeed, sleepRemain, enableSleep, shuffle, setShuffle, repeat, cycleRepeat, seekTo } = usePlayer();
  // [老板令 1121#5] 黑胶唱片(web 版一致): 播放时匀速旋转,暂停即停
  const spin = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (playing) Animated.loop(Animated.timing(spin, { toValue: 1, duration: 22000, easing: Easing.linear, useNativeDriver: true })).start();
    else spin.stopAnimation();
  }, [playing]);
  const rot = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] as never });
  const nav = useNavigation() as { navigate: (s: string) => void };
  const [qual, setQual] = useState(settings.get().playQuality || 'flac');
  const { position, duration } = usePlayerProgress();
  const { handlers } = useSeekBar((pct: number, phase) => { if (phase === 'release' && duration > 0) void seekTo(pct * duration / 1000); });
  const { width: winW, height: winH } = useWindowDimensions();
  const pct = duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0;
  const img = current ? fixCoverUrl(current.img) : undefined;
  // [web car.css 316] disc = min(100%, 52vh, 460px) → RN: min(winH*0.5, 460, winW*0.36)
  const discSize = Math.round(Math.min(winH * 0.5, 460, winW * 0.36));
  const curIdx = queue.findIndex(q => current && q.songmid === current.songmid);
  const next = queue.length > 1 ? queue[(curIdx + 1) % queue.length] : undefined;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={st.screen}>
        {img ? <Image source={{ uri: img }} style={st.bgImg} blurRadius={70} /> : null}
        <View style={st.bgOverlay} />

        {/* header: 返回(左) */}
        <View style={st.header}>
          <CarTouch style={st.backBtn} onPress={onClose} {...{ hasTVPreferredFocus: true }}>
            <Icon name="back" size={22} color={C.text} />
            <Text style={st.backLabel}>返回</Text>
          </CarTouch>
        </View>

        {/* [老板令 1121#5] 左信息列 + 右黑胶唱片(CAR 差异布局) */}
        <View style={st.grid}>
          {/* 右: 黑胶(圆形盘+封面圆62%+中心孔+旋转) */}
          <View style={st.discWrap}>
            <Animated.View style={[st.disc, { width: discSize, height: discSize, borderRadius: discSize / 2, transform: [{ rotate: rot }] }]}>
              {img
                ? <Image source={{ uri: img }} style={{ width: discSize * 0.62, height: discSize * 0.62, borderRadius: discSize * 0.31 }} resizeMode="cover" />
                : <View style={{ width: discSize * 0.62, height: discSize * 0.62, borderRadius: discSize * 0.31, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}><Icon name="music" size={48} color={C.text3} /></View>}
              <View style={{ width: discSize * 0.13, height: discSize * 0.13, borderRadius: discSize * 0.065, backgroundColor: '#0a0a0c', borderWidth: 3, borderColor: '#555' }} />
            </Animated.View>
            {queue.length > 1 ? <Text style={st.queueHint}>队列 {queue.length} 首</Text> : null}
          </View>

          {/* 左: focus-info */}
          <View style={st.info}>
            <Text style={st.eyebrow}>{current?.source ? current.source.toUpperCase() : 'NEXTMUSIC'}{queue.length ? ` · 队列 ${queue.length} 首` : ''}</Text>
            <Text style={st.title} numberOfLines={2}>{current?.name ?? '未在播放'}</Text>
            <CarTouch style={{ alignSelf: 'flex-start' }} onPress={() => { if (current?.singer) onArtistTap(current.singer); }}>
              <Text style={st.artist} numberOfLines={1}>{current?.singer ?? '从「为我推荐」选一首开始'}</Text>
            </CarTouch>

            {/* stage: 接下来卡(web 歌词区简化版) */}
            {next ? (
              <View style={st.nextCard}>
                <Text style={st.nextLabel}>接下来</Text>
                <Text style={st.nextName} numberOfLines={1}>{next.name}</Text>
                <Text style={st.nextSub} numberOfLines={1}>{next.singer}</Text>
              </View>
            ) : null}

            {/* timeline(web .timeline: 进度+时间标签) */}
            <View style={st.progRow} {...handlers}>
              <Text style={st.time}>{fmt(position)}</Text>
              <View style={st.track}>
                <View style={{ flex: pct, backgroundColor: C.brand, borderRadius: 4 }} />
                <View style={{ flex: 1 - pct, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 4 }} />
              </View>
              <Text style={st.time}>{fmt(duration)}</Text>
            </View>

            {/* transport(web .transport 居中: shuffle/prev/play/next/repeat) */}
            <View style={st.ctrls}>
              <CarTouch style={st.ctrlBtn} onPress={() => setShuffle(!shuffle)}>
                <Icon name="shuffle" size={26} active={shuffle} color={shuffle ? C.brand : C.text} />
              </CarTouch>
              <CarTouch style={st.ctrlBtn} onPress={skipPrev}><Icon name="previous" size={30} color={C.text} /></CarTouch>
              <CarTouch style={st.ctrlMain} onPress={toggle}>
                <Icon name={playing ? 'pause' : 'play'} size={38} active color={C.onBrand} />
              </CarTouch>
              <CarTouch style={st.ctrlBtn} onPress={skipNext}><Icon name="next" size={30} color={C.text} /></CarTouch>
              <CarTouch style={st.ctrlBtn} onPress={cycleRepeat}>
                <Icon name="repeat" size={26} active={repeat !== 'off'} color={repeat !== 'off' ? C.brand : C.text} />
              </CarTouch>
            </View>

            {/* chips: 定时/倍速/音质/投屏 */}
            <View style={st.chipRow}>
              <CarTouch style={st.chip} onPress={() => enableSleep(sleepRemain ? null : 30)}>
                <Icon name="history" size={19} color={sleepRemain ? C.brand : C.text2} />
                <Text style={[st.chipText, sleepRemain ? ({ color: C.brand } as const) : null]} numberOfLines={1}>{sleepRemain ? `${Math.ceil(sleepRemain / 60)} 分钟` : '定时'}</Text>
              </CarTouch>
              <CarTouch style={st.chip} onPress={() => setSpeed(SPEED_CYCLE[(SPEED_CYCLE.indexOf(speed) + 1) % SPEED_CYCLE.length])}>
                <Icon name="wave" size={19} color={C.text2} />
                <Text style={st.chipText} numberOfLines={1}>{speed}×</Text>
              </CarTouch>
              <CarTouch style={st.chip} onPress={() => { const n2 = QUALITY_ORDER[(QUALITY_ORDER.indexOf(qual as typeof QUALITY_ORDER[number]) + 1) % QUALITY_ORDER.length]; settings.set('playQuality', n2); setQual(n2); }}>
                <Icon name="volume" size={19} color={C.text2} />
                <Text style={st.chipText} numberOfLines={1}>{QUALITY_LABEL[qual]}</Text>
              </CarTouch>
              <CarTouch style={st.chip} onPress={() => nav.navigate('Route')}>
                <Icon name="tv" size={19} color={C.text2} />
                <Text style={st.chipText} numberOfLines={1}>投屏</Text>
              </CarTouch>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0a0a0c' },
  bgImg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  bgOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(6,6,10,0.78)' },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 20, paddingHorizontal: 24 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 52, paddingHorizontal: 20, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.10)' },
  backLabel: { color: C.text, fontSize: 17, fontWeight: '600' as never },
  grid: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: Math.max(36, 60), paddingHorizontal: 48, paddingBottom: 32, flexWrap: 'wrap' },
  discWrap: { alignItems: 'center', justifyContent: 'center', gap: 14 },
  disc: { backgroundColor: '#111114', borderWidth: 6, borderColor: '#1c1c22', alignItems: 'center', justifyContent: 'center', elevation: 20, shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 30 },
  queueHint: { color: 'rgba(255,255,255,0.55)', fontSize: 12 },
  info: { flex: 1, minWidth: 300, maxWidth: 620, gap: 12 },
  eyebrow: { color: C.text3, fontSize: 13, letterSpacing: 2, fontWeight: '600' as never },
  title: { color: '#FFFFFF', fontSize: 36, lineHeight: 46, fontWeight: '800' as never },
  artist: { color: 'rgba(255,255,255,0.75)', fontSize: 20, paddingVertical: 4 },
  nextCard: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', padding: 14, gap: 4, marginTop: 6 },
  nextLabel: { color: C.text3, fontSize: 11, letterSpacing: 1.5 },
  nextName: { color: C.text, fontSize: 16, fontWeight: '650' as never },
  nextSub: { color: C.text3, fontSize: 12 },
  progRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 10 },
  track: { flex: 1, height: 8, flexDirection: 'row', borderRadius: 4, overflow: 'hidden' as never },
  time: { color: 'rgba(255,255,255,0.65)', fontSize: 14, fontVariant: ['tabular-nums' as never] },
  ctrls: { flexDirection: 'row', alignItems: 'center', gap: 22, marginTop: 14, justifyContent: 'center' },
  ctrlBtn: { width: 62, height: 62, borderRadius: 31, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  ctrlMain: { width: 82, height: 82, borderRadius: 41, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16, justifyContent: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, paddingHorizontal: 16, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.10)' },
  chipText: { color: C.text, fontSize: 13, fontWeight: '600' as never },
});
