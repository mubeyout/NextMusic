// 下载管理：列表 / 播放 / 删除 / 清空 / 存储统计
import React, { useCallback, useEffect, useState } from 'react';
import { Platform, View, Text, StyleSheet, ScrollView, TouchableOpacity, } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Icon } from '../theme/Icon';
import { C } from '../theme/tokens';
import { SongRow } from '../components/SongRow';
import { PageHeader, EmptyState } from '../components/PageChrome';
import { MiniPlayer } from '../components/MiniPlayer';
import { usePlayer } from '../state/PlayerProvider';
import { fmtBytes } from '../services/downloads';
import { downloads as dlStore, subscribeDownloads, fmtBytes, downloadProgress, downloadFails, clearFails } from '../services/downloads';
import type { SongItem } from '../services/server';
import { dialog, toast } from '../components/Dialog';
import RNBlobUtil from 'react-native-blob-util';

export function DownloadsScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { goBack: () => void };
  const { playSong, current } = usePlayer();
  const [list, setList] = useState(dlStore.all());
  const [, force] = useState(0);

  useEffect(() => subscribeDownloads(() => { setList(dlStore.all()); force(n => n + 1); }), []);
  const fails = downloadFails();
  const lastFails = fails.slice(0, 5);

  const play = useCallback((s: SongItem) => { playSong(s, list.map(r => r.song)); }, [playSong, list]);

  const removeSong = (s: SongItem) => {
    dialog.alert('删除下载', `确定删除「${s.name}」的下载？`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => dlStore.remove(s) },
    ]);
  };

  const clear = () => {
    if (!list.length) return;
    dialog.alert('清空下载', `共 ${list.length} 首 · ${fmtBytes(dlStore.totalBytes())}，确定全部删除？`, [
      { text: '取消', style: 'cancel' },
      { text: '全部删除', style: 'destructive', onPress: () => dlStore.clearAll() },
    ]);
  };

  return (
    <View style={st.screen}>
      <PageHeader
        title="下载管理"
        right={(
          <TouchableOpacity onPress={clear} hitSlop={6}>
      {typeof Platform !== 'undefined' && Platform.OS === 'web' && !/electron/i.test(navigator.userAgent) ? (
        <View style={{ backgroundColor: '#1E2422', borderRadius: 12, padding: 14, marginBottom: 12, gap: 4 }}>
          <Text style={{ color: '#7ee2a8', fontSize: 13, fontWeight: '700' }}>服务器缓存模式</Text>
          <Text style={{ color: '#9aa5a0', fontSize: 11.5, lineHeight: 17 }}>
            Web 版下载的歌曲缓存到服务器存储目录(cache),再次播放无需外部流量。{'\n'}
            缓存配额与 LRU 自动清理:后台「设置 · 存储备份 · 缓存与空间」;{'\n'}
            缓存列表与清空:后台「下载与备份 · 服务器缓存管理」。
          </Text>
          {cacheStat ? <Text style={{ color: '#9aa5a0', fontSize: 11 }}>当前占用 {cacheStat.fileCount} 个文件 · {fmtBytes(cacheStat.totalSize)}</Text> : null}
        </View>
      ) : null}
            <Icon name="close" size={20} color={list.length ? C.text : C.text3} />
          </TouchableOpacity>
        )}
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 120 }}>
        <Text style={st.stat}>{list.length} 首 · {fmtBytes(dlStore.totalBytes())} · 内部存储/Music/NextMusic</Text>
        {lastFails.length ? (
          <View style={st.failCard}>
            <Text style={st.failTitle} numberOfLines={1}>⚠ {fails.length} 首下载失败 · 最近：{lastFails[0].err}</Text>
            <TouchableOpacity hitSlop={6} onPress={() => { clearFails(); }}>
              <Text style={st.failClear}>清除</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {list.map(r => {
          const prog = downloadProgress(r.song);
          return (
            <View key={r.key}>
              <SongRow
                song={r.song}
                playing={current?.songmid === r.song.songmid}
                onPress={() => play(r.song)}
                extra={(
                  <TouchableOpacity hitSlop={8} onPress={() => removeSong(r.song)}>
                    <Icon name="trash" size={18} color={C.text3} />
                  </TouchableOpacity>
                )}
              />
              {prog != null ? (
                <View style={st.progTrack}><View style={[st.progBar, { flex: prog }]} /><View style={{ flex: 1 - prog }} /></View>
              ) : null}
            </View>
          );
        })}
        {!list.length ? <EmptyState icon="download" title="还没有下载" sub="在歌单或播放页点下载即可离线收听" /> : null}
      </ScrollView>
      <View style={st.miniDock} pointerEvents="box-none"><MiniPlayer /></View>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { height: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 6 },
  title: { flex: 1, color: C.text, fontSize: 24, lineHeight: 35, fontWeight: '700' }, // lx166 居左
  stat: { color: C.text2, fontSize: 11, lineHeight: 15, marginBottom: 12 },
  failCard: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.failTint, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10 },
  failTitle: { flex: 1, color: '#FF9B9B', fontSize: 11, lineHeight: 15 },
  failClear: { color: C.text2, fontSize: 11 },
  empty: { color: C.text2, fontSize: 12, lineHeight: 18, textAlign: 'center', paddingVertical: 40 },
  progTrack: { flexDirection: 'row', height: 3, borderRadius: 2, backgroundColor: C.surface2, marginTop: 2, marginBottom: 4 },
  progBar: { backgroundColor: C.brand, borderRadius: 2 },
  miniDock: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
