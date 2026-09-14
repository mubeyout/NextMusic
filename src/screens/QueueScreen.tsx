import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
// lx45 坑108：phone 分支误写 <T> 自递归 → 点队列页瞬间爆栈卡死 ANR；改回 TouchableOpacity
import { useNavigation } from '@react-navigation/native';
import LinearGradient from 'react-native-linear-gradient';
import { Icon } from '../theme/Icon';
import { C } from '../theme/tokens';
import { IS_HD } from '../services/appversion';
import { Platform } from 'react-native';
const IS_WEB = Platform.OS === 'web'; // v3.33:队列行菜单定位弹出(web)分支
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
import { ActionSheet } from '../components/ActionSheet';
import { CollectSheet } from '../components/CollectSheet';
import { hdActions } from '../hd/HDActions';
import { usePlayer, type QueueTrack } from '../state/PlayerProvider';
import { PageHeader, EmptyState } from '../components/PageChrome';
import { dialog, toast } from '../components/Dialog';
import { enqueueDownload, downloads as dlStore } from '../services/downloads';
import type { SongItem } from '../services/server';

// Figma 03·播放队列: header + now playing card + list
export function QueueScreen() {
  const [limit, setLimit] = useState(40);
  const [actSong, setActSong] = useState<QueueTrack | null>(null); // lx163:队列行 ⋯ 菜单(v3.28:SongItem→QueueTrack,uid 合法)
  const [collect, setCollect] = useState(false);
  // v3.33(老板:队列操作箱优化):批量选择模式
  const [selMode, setSelMode] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const keyOf = (t: QueueTrack) => String(t.uid ?? t.songmid);
  const exitSel = () => { setSelMode(false); setSel(new Set()); };
  const toggleSel = (t: QueueTrack) => setSel(prev => { const n = new Set(prev); if (n.has(keyOf(t))) n.delete(keyOf(t)); else n.add(keyOf(t)); return n; });
  const nav = useNavigation() as { goBack: () => void };
  const { queue, current, playSong, position, duration, clearQueue, reorderQueue } = usePlayer();

  const upcoming = current ? queue.filter(t => t.songmid !== current.songmid) : queue;
  const pct = duration > 0 ? Math.min(1, position / duration) : 0;

  // v3.33(老板:队列操作箱优化):行菜单三端分发——web/桌面=定位菜单(点击处弹出,桌面惯例);
  // TV=hdActions 页内面板(D-pad);手机=底部 ActionSheet(移动惯例)
  const rowMenu = (t: QueueTrack) => [
    dlStore.isDownloaded(t)
      ? { label: '已下载 ✓', onPress: () => {} }
      : { label: '下载', onPress: () => { enqueueDownload([t]); toast('已加入下载队列'); } },
    { label: '收藏到歌单', onPress: () => { setActSong(t); setCollect(true); } },
    { label: '上移一位', onPress: () => { const i = queue.findIndex(q => q.uid === t.uid); if (i > 0) reorderQueue(i, i - 1); } },
    { label: '下移一位', onPress: () => { const i = queue.findIndex(q => q.uid === t.uid); if (i >= 0 && i < queue.length - 1) reorderQueue(i, i + 1); } },
    { label: '从队列移除', danger: true as const, onPress: () => { const i = queue.findIndex(q => q.uid === t.uid); if (i >= 0) reorderQueue(i, -2); } },
  ];
  const onRowMore = (t: QueueTrack, pos?: { x: number; y: number }) => {
    const items = rowMenu(t);
    if (IS_WEB && pos) {
      (globalThis as never as { __nmCtxMenu?: (x: number, y: number, items: unknown[]) => void }).__nmCtxMenu?.(pos.x, pos.y, items as never);
      return;
    }
    if (IS_HD) { hdActions.menu(`${t.name} · ${t.singer}`, items as never); return; }
    setActSong(t); // 手机:底部 ActionSheet(items 复用现有 <ActionSheet> 渲染)
  };

  // v3.24(老板:背景割裂):web/HD 下手机端绿色渐变背景与全站 #121212 割裂——统一纯 C.bg
  return (
    <LinearGradient colors={IS_HD ? [C.bg, C.bg, C.bg] : [C.bgGradientTop, C.bg, C.bg]} locations={[0, 0.55, 1]} style={[st.screen, { backgroundColor: C.bg }]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
        onScroll={e => {
          const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
          if (layoutMeasurement.height + contentOffset.y > contentSize.height - 500) setLimit(n => (n < upcoming.length ? n + 40 : n));
        }}
        scrollEventThrottle={200}>
        <PageHeader
          title="播放队列"
          onBack={() => nav.goBack()}
          right={selMode ? (
            <T hitSlop={6} onPress={exitSel} style={st.doneBtn}>
              <Text style={st.doneText}>完成</Text>
            </T>
          ) : (
            <T
              hitSlop={6}
              onPress={() => (IS_HD ? hdActions : dialog).menu('队列操作', [
                { label: `批量操作（${upcoming.length} 首可选）`, icon: 'check', onPress: () => setSelMode(true) },
                { label: `下载全部（${queue.length} 首）`, icon: 'download', onPress: () => { const n = enqueueDownload(queue); toast(n ? `${n} 首加入下载队列` : '队列内均已下载'); } },
                { label: '清空队列', icon: 'trash', danger: true, onPress: () => (IS_HD ? hdActions : dialog).confirm('清空队列', `移除全部 ${queue.length} 首（不影响当前播放）`, () => { clearQueue(); toast('队列已清空'); }, '清空', '取消') },
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

        {selMode && (
          <View style={st.batchBar}>
            <Text style={st.batchCount}>已选 {sel.size} 首</Text>
            <View style={{ flex: 1 }} />
            <T style={st.batchBtn} onPress={() => setSel(sel.size >= upcoming.length ? new Set() : new Set(upcoming.map(keyOf)))}>
              <Text style={st.batchBtnText}>{sel.size >= upcoming.length && upcoming.length > 0 ? '全不选' : '全选'}</Text>
            </T>
            <T style={[st.batchBtn, st.batchBtnPri]} onPress={() => {
              const tracks = upcoming.filter(t => sel.has(keyOf(t)));
              if (!tracks.length) { toast('先选中歌曲'); return; }
              const n = enqueueDownload(tracks);
              toast(n ? `${n} 首加入下载队列` : '所选均已下载');
              exitSel();
            }}>
              <Text style={[st.batchBtnText, st.batchBtnPriText]}>下载</Text>
            </T>
            <T style={st.batchBtn} onPress={() => {
              if (!sel.size) { toast('先选中歌曲'); return; }
              // 降序逐个移除(reorderQueue 单索引语义;正在播放曲目由其自身保护)
              const idxs = queue.map((t, i) => (sel.has(keyOf(t)) ? i : -1)).filter(i => i >= 0).sort((a, b) => b - a);
              idxs.forEach(i => reorderQueue(i, -2));
              toast(`已移除 ${idxs.length} 首`);
              exitSel();
            }}>
              <Text style={[st.batchBtnText, { color: '#FF6B6B' }]}>移除</Text>
            </T>
          </View>
        )}
        <View style={st.sectionRow}>
          <Text style={st.sectionTitle}>{selMode ? '选择要操作的歌曲' : '当前列表'}</Text>
          <Text style={st.sectionMeta}>{queue.length} 首 · 点击切歌</Text>
        </View>
        {upcoming.length ? (
          <View style={st.list}>
            {upcoming.slice(0, limit).map((t, i) => selMode ? (
              <SongRow
                key={t.uid || i}
                song={t}
                playing={current?.songmid === t.songmid}
                onPress={() => toggleSel(t)}
                leading={<View style={[st.chk, sel.has(keyOf(t)) && st.chkOn]}>{sel.has(keyOf(t)) ? <Icon name="check" size={14} color="#fff" /> : null}</View>}
              />
            ) : (
              <SongRow key={t.uid || i} song={t} onPress={() => playSong(t, queue)} onMore={(pos) => onRowMore(t, pos)} />
            ))}
          </View>
        ) : (
          <EmptyState title={queue.length ? '没有下一首了' : '队列为空'} sub={queue.length ? undefined : '去首页或探索页添加歌曲'} />
        )}
        {limit < upcoming.length ? <Text style={{ color: '#999', fontSize: 11, textAlign: 'center', paddingVertical: 8 }}>滚动加载更多({limit}/{upcoming.length})</Text> : null}
      </ScrollView>
      {/* lx163:队列行操作菜单(收藏到歌单/下载)——⋯ 从死图标变真按钮 */}
      <ActionSheet
        visible={!!actSong} onClose={() => setActSong(null)}
        title={actSong ? `${actSong.name} · ${actSong.singer}` : ''}
        items={actSong ? [
          dlStore.isDownloaded(actSong)
            ? { label: '已下载 ✓', onPress: () => {} }
            : { label: '下载', onPress: () => { enqueueDownload([actSong]); } },
          { label: '收藏到歌单', onPress: () => setCollect(true) },
          { label: '上移一位', onPress: () => { const i = queue.findIndex(t => t.uid === actSong.uid); if (i > 0) reorderQueue(i, i - 1); } },
          { label: '下移一位', onPress: () => { const i = queue.findIndex(t => t.uid === actSong.uid); if (i >= 0 && i < queue.length - 1) reorderQueue(i, i + 1); } },
          { label: '从队列移除', danger: true as const, onPress: () => { const i = queue.findIndex(t => t.uid === actSong.uid); if (i >= 0) reorderQueue(i, -2); } },
        ] : []}
      />
      <CollectSheet song={actSong} visible={collect} onClose={() => { setCollect(false); setActSong(null); }} />
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
  // v3.33:批量操作工具栏
  batchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginTop: 10 },
  batchCount: { color: C.text, fontSize: 13, fontWeight: '700' },
  batchBtn: { height: 32, paddingHorizontal: 14, borderRadius: 16, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  batchBtnPri: { backgroundColor: C.brand },
  batchBtnText: { color: C.text, fontSize: 12, fontWeight: '600' },
  batchBtnPriText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  chk: { width: 46, height: 46, borderRadius: 8, borderWidth: 2, borderColor: C.stroke, alignItems: 'center', justifyContent: 'center' },
  chkOn: { backgroundColor: C.brand, borderColor: C.brand },
  doneBtn: { height: 30, paddingHorizontal: 14, borderRadius: 15, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  doneText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
