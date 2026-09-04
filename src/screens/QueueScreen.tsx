import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
// lx45 坑108：phone 分支误写 <T> 自递归 → 点队列页瞬间爆栈卡死 ANR；改回 TouchableOpacity
import { useNavigation } from '@react-navigation/native';
import LinearGradient from 'react-native-linear-gradient';
import { Icon } from '../theme/Icon';
import { C } from '../theme/tokens';
import { IS_HD } from '../services/appversion';
import { HDTouch } from '../hd/HDTouch';
// 触点抽象:HD 用 HDTouch(D-pad 焦点),phone 保持 TouchableOpacity
function T(props: { style?: unknown; onPress?: () => void; disabled?: boolean; children?: React.ReactNode } & Record<string, unknown>) {
  const { style, onPress, disabled, children, ...rest } = props;
  if (IS_HD) return (
    <HDTouch style={style as never} onPress={onPress} disabled={disabled} focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 12 }} {...(rest as object)}>
      {children}
    </HDTouch>
  );
  return (
    <TouchableOpacity style={style as never} onPress={onPress} disabled={disabled} activeOpacity={0.7} {...(rest as object)}>
      {children}
    </TouchableOpacity>
  );
}
import { SongRow } from '../components/SongRow';
import { usePlayer } from '../state/PlayerProvider';
import { PageHeader, EmptyState } from '../components/PageChrome';
import { dialog, toast } from '../components/Dialog';
import { enqueueDownload } from '../services/downloads';

// Figma 03·播放队列: header + now playing card + list
export function QueueScreen() {
  const nav = useNavigation() as { goBack: () => void };
  const { queue, current, playSong, position, duration, clearQueue } = usePlayer();

  const upcoming = current ? queue.filter(t => t.songmid !== current.songmid) : queue;
  const pct = duration > 0 ? Math.min(1, position / duration) : 0;

  return (
    <LinearGradient colors={[C.bgGradientTop, C.bg, C.bg]} locations={[0, 0.55, 1]} style={[st.screen, { backgroundColor: C.bg }]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}>
        <PageHeader
          title="播放队列"
          onBack={() => nav.goBack()}
          right={(
            <T
              hitSlop={6}
              onPress={() => dialog.menu('队列操作', [
                { label: `下载全部（${queue.length} 首）`, onPress: () => { const n = enqueueDownload(queue); toast(n ? `${n} 首加入下载队列` : '队列内均已下载'); } },
                { label: '清空队列', danger: true, onPress: () => dialog.confirm('清空队列', `移除全部 ${queue.length} 首（不影响当前播放）`, () => { clearQueue(); toast('队列已清空'); }, '清空', '取消') },
              ])}
            >
              <Icon name="more" size={22} />
            </T>
          )}
        />

        {current && (
          <View style={st.nowCard}>
            <View style={st.nowRow}>
              <View style={st.nowArtWrap}>
                {current.img ? <Image source={{ uri: current.img }} style={st.nowArt} /> : <View style={[st.nowArt, { backgroundColor: C.surface2 }]} />}
              </View>
              <View style={st.nowMeta}>
                <Text style={st.nowTitle} numberOfLines={1}>{current.name}</Text>
                <Text style={st.nowArtist} numberOfLines={1}>{current.singer}</Text>
                <View style={st.nowBar}>
                  <View style={[st.nowBarValue, { width: `${Math.round(pct * 100)}%` }]} />
                </View>
              </View>
            </View>
          </View>
        )}

        <View style={st.sectionRow}>
          <Text style={st.sectionTitle}>当前列表</Text>
          <Text style={st.sectionMeta}>{queue.length} 首 · 点击切歌</Text>
        </View>
        {upcoming.length ? (
          <View style={st.list}>
            {upcoming.map((t, i) => (
              <SongRow key={t.uid || i} song={t} onPress={() => playSong(t, queue)} />
            ))}
          </View>
        ) : (
          <EmptyState title={queue.length ? '没有下一首了' : '队列为空'} sub={queue.length ? undefined : '去首页或探索页添加歌曲'} />
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bgDeep },
  nowCard: { borderRadius: 12, backgroundColor: C.elev, padding: 12, marginTop: 8 },
  nowRow: { flexDirection: 'row', gap: 10 },
  nowArtWrap: { width: 60, height: 60, borderRadius: 7, overflow: 'hidden' },
  nowArt: { width: 60, height: 60 },
  nowMeta: { flex: 1, gap: 2 },
  nowTitle: { color: C.text, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  nowArtist: { color: C.text2, fontSize: 11, lineHeight: 16 },
  nowBar: { height: 4, borderRadius: 2, backgroundColor: C.inset, marginTop: 8, overflow: 'hidden' },
  nowBarValue: { height: 4, borderRadius: 2, backgroundColor: C.brand },
  sectionRow: { height: 26, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, marginBottom: 8 },
  sectionTitle: { flex: 1, color: C.text, fontSize: 17, lineHeight: 25, fontWeight: '700' },
  sectionMeta: { color: C.text2, fontSize: 11, lineHeight: 16 },
  list: { gap: 8 },
});
