// 设备本地音乐：权限申请 → 扫描 → 列表（播放 / 加入歌单 / 下载入口）
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Icon } from '../theme/Icon';
import { C } from '../theme/tokens';
import { SongRow } from '../components/SongRow';
import { PageHeader, EmptyState } from '../components/PageChrome';
import { MiniPlayer } from '../components/MiniPlayer';
import { usePlayer } from '../state/PlayerProvider';
import { library } from '../state/library';
import type { SongItem } from '../services/server';
import {
  ensurePermission, scanByMediaStore, scanByPath, scanBySafFolder, scanSafTree, getSafTree,
  deviceSongsDetailed, deviceTrackCount,
  type ScanResult,
} from '../services/devicelibrary';
import { dialog, toast } from '../components/Dialog';

export function DeviceMusicScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { goBack: () => void };
  const { playSong, current } = usePlayer();
  const [scanning, setScanning] = useState(false);
  const [found, setFound] = useState(0);
  const [count, setCount] = useState(deviceTrackCount());
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick(t => t + 1), []);
  const [songs, setSongs] = useState<SongItem[]>([]);
  const reload = useCallback(async () => { setSongs(await deviceSongsDetailed()); }, []);
  useEffect(() => { setCount(deviceTrackCount()); reload(); }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const scan = async () => {
    setScanning(true); setFound(0);
    try {
      await ensurePermission();
      // ① MediaStore 主路径（系统媒体库，元数据齐全）
      let r: ScanResult | null = await scanByMediaStore();
      // ② 已授权 SAF 目录
      if (!r || r.count === 0) {
        const tree = getSafTree();
        if (tree) {
          const r2 = await scanSafTree(tree, n => setFound(n));
          if (r2.count > 0) r = r2;
        }
      }
      // ③ 直接路径（旧设备）
      if (!r || r.count === 0) {
        r = await scanByPath(n => setFound(n));
      }
      if (!r || r.count === 0) {
        // scoped storage 拦截 → 引导用户选文件夹（SAF）
        setScanning(false);
        dialog.alert(
          '未发现本地音乐',
          '可以尝试手动选择音乐文件夹（SAF）扫描，或确认设备上有音频文件。',
          [
            { text: '取消', style: 'cancel' },
            {
              text: '选择文件夹',
              onPress: async () => {
                setScanning(true); setFound(0);
                const r2 = await scanBySafFolder(n => setFound(n));
                setScanning(false);
                if (!r2) return; // 用户取消
                refresh();
                dialog.alert('扫描完成', `共发现 ${r2.count} 首本地音乐（${(r2.ms / 1000).toFixed(1)}s）`);
              },
            },
          ],
        );
        setScanning(false);
        return;
      }
      refresh();
      const modeLabel = r.mode === 'mediastore' ? '系统媒体库' : r.mode === 'saf' ? '授权目录' : '设备目录';
      dialog.alert('扫描完成', `共发现 ${r.count} 首本地音乐（${(r.ms / 1000).toFixed(1)}s，${modeLabel}）`);
    } catch (e) {
      dialog.alert('扫描失败', (e as Error).message);
    } finally { setScanning(false); }
  };


  const addAllToPlaylist = () => {
    if (!songs.length) { dialog.alert('没有本地音乐', '先扫描设备音乐'); return; }
    dialog.alert('加入歌单', `把 ${songs.length} 首本地音乐加入新歌单？`, [
      { text: '取消', style: 'cancel' },
      { text: '创建歌单', onPress: () => { library.create('设备本地音乐', songs, { desc: '扫描自设备存储' }); toast('已创建「设备本地音乐」歌单'); } },
    ]);
  };

  const addOne = (song: SongItem) => {
    const pls = library.all();
    const options = pls.map(p => ({ text: `${p.name} (${p.songs.length})`, onPress: () => { library.addSongs(p.id, [song]); toast(`已加入 ${p.name}`); } }));
    options.push({ text: '＋ 新建歌单', onPress: () => { const pl = library.create(`本地歌单 ${new Date().getMonth() + 1}/${new Date().getDate()}`, [song]); toast(`已创建 ${pl.name}`); } });
    dialog.alert('加入歌单', song.name, [{ text: '取消', style: 'cancel' }, ...options]);
  };

  return (
    <View style={st.screen}>
      <PageHeader title="本地音乐" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 120 }}>
        <View style={st.scanCard}>
          <View style={{ flex: 1 }}>
            <Text style={st.scanTitle}>{scanning ? `扫描中… 已发现 ${found} 首` : `${count} 首设备音乐`}</Text>
            <Text style={st.scanSub}>扫描系统媒体库（含时长/专辑信息）</Text>
          </View>
          <TouchableOpacity style={st.scanBtn} onPress={scan} disabled={scanning}>
            {scanning ? <ActivityIndicator size="small" color={C.onBrand} /> : <Icon name="refresh" size={18} color={C.onBrand} />}
            <Text style={st.scanBtnText}>{scanning ? '扫描中' : count ? '重新扫描' : '开始扫描'}</Text>
          </TouchableOpacity>
        </View>
        {count ? (
          <TouchableOpacity style={st.addAll} onPress={addAllToPlaylist}>
            <Icon name="add" size={16} color={C.onBrand} />
            <Text style={st.addAllText}>全部加入歌单</Text>
          </TouchableOpacity>
        ) : null}
        <View style={{ gap: 4, marginTop: 8 }}>
          {songs.map((s, i) => (
            <SongRow
              key={s.songmid}
              song={s}
              playing={current?.songmid === s.songmid}
              onPress={() => playSong(s, songs)}
              extra={(
                <TouchableOpacity hitSlop={8} onPress={() => addOne(s)}>
                  <Icon name="add" size={18} color={C.text2} />
                </TouchableOpacity>
              )}
            />
          ))}
        </View>
        {!scanning && !count ? <EmptyState icon="music" title="未发现本地音乐" sub="点「开始扫描」导入设备上的音频文件" /> : null}
      </ScrollView>
      <View style={st.miniDock} pointerEvents="box-none"><MiniPlayer /></View>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { height: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 6 },
  title: { flex: 1, color: C.text, fontSize: 24, lineHeight: 35, fontWeight: '700' }, // lx166 居左
  scanCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderRadius: 14, padding: 16 },
  scanTitle: { color: C.text, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  scanSub: { color: C.text2, fontSize: 11, lineHeight: 15, marginTop: 4 },
  scanBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.brand, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 9 },
  scanBtnText: { color: C.onBrand, fontSize: 12, fontWeight: '600' },
  addAll: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 38, borderRadius: 12, backgroundColor: C.surface, marginTop: 12 },
  addAllText: { color: C.brandSoft, fontSize: 12, fontWeight: '500' },
  empty: { color: C.text2, fontSize: 12, lineHeight: 18, textAlign: 'center', paddingVertical: 40 },
  miniDock: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
