// 下载管理：列表 / 播放 / 删除 / 清空 / 存储统计
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Icon } from '../theme/Icon';
import { C } from '../theme/tokens';
import { SongRow } from '../components/SongRow';
import { MiniPlayer } from '../components/MiniPlayer';
import { usePlayer } from '../state/PlayerProvider';
import { downloads as dlStore, subscribeDownloads, fmtBytes, downloadProgress } from '../services/downloads';
import type { SongItem } from '../services/server';

export function DownloadsScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { goBack: () => void };
  const { playSong, current } = usePlayer();
  const [list, setList] = useState(dlStore.all());
  const [, force] = useState(0);

  useEffect(() => subscribeDownloads(() => { setList(dlStore.all()); force(n => n + 1); }), []);

  const play = useCallback((s: SongItem) => { playSong(s, list.map(r => r.song)); }, [playSong, list]);

  const removeSong = (s: SongItem) => {
    Alert.alert('删除下载', `确定删除「${s.name}」的下载？`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => dlStore.remove(s) },
    ]);
  };

  const clear = () => {
    if (!list.length) return;
    Alert.alert('清空下载', `共 ${list.length} 首 · ${fmtBytes(dlStore.totalBytes())}，确定全部删除？`, [
      { text: '取消', style: 'cancel' },
      { text: '全部删除', style: 'destructive', onPress: () => dlStore.clearAll() },
    ]);
  };

  return (
    <View style={st.screen}>
      <View style={[st.header, { paddingTop: insets.top + 20 }]}>
        <TouchableOpacity onPress={() => nav.goBack()} hitSlop={6} style={{ width: 22 }}>
          <Icon name="back" size={22} />
        </TouchableOpacity>
        <Text style={st.title}>下载管理</Text>
        <TouchableOpacity onPress={clear} hitSlop={6} style={{ width: 22, alignItems: 'flex-end' }}>
          <Icon name="close" size={20} color={list.length ? C.text : C.text3} />
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 120 }}>
        <Text style={st.stat}>{list.length} 首 · {fmtBytes(dlStore.totalBytes())} · 应用内部存储</Text>
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
                    <Icon name="close" size={18} color={C.text3} />
                  </TouchableOpacity>
                )}
              />
              {prog != null ? (
                <View style={st.progTrack}><View style={[st.progBar, { flex: prog }]} /><View style={{ flex: 1 - prog }} /></View>
              ) : null}
            </View>
          );
        })}
        {!list.length ? <Text style={st.empty}>还没有下载{'\n'}在歌单或播放页点下载即可离线收听</Text> : null}
      </ScrollView>
      <View style={st.miniDock} pointerEvents="box-none"><MiniPlayer /></View>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { height: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 6 },
  title: { flex: 1, color: C.text, fontSize: 24, lineHeight: 35, fontWeight: '700', textAlign: 'center' },
  stat: { color: C.text2, fontSize: 11, lineHeight: 15, marginBottom: 12 },
  empty: { color: C.text2, fontSize: 12, lineHeight: 18, textAlign: 'center', paddingVertical: 40 },
  progTrack: { flexDirection: 'row', height: 3, borderRadius: 2, backgroundColor: '#232323', marginTop: 2, marginBottom: 4 },
  progBar: { backgroundColor: C.brand, borderRadius: 2 },
  miniDock: { position: 'absolute', left: 0, right: 0, bottom: 12 },
});
