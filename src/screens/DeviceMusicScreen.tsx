// 设备本地音乐：权限申请 → 扫描 → 列表（播放 / 加入歌单 / 下载入口）
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Icon } from '../theme/Icon';
import { C } from '../theme/tokens';
import { SongRow } from '../components/SongRow';
import { MiniPlayer } from '../components/MiniPlayer';
import { usePlayer } from '../state/PlayerProvider';
import { library } from '../state/library';
import {
  ensurePermission, scanByPath, scanBySafFolder, scanSafTree, getSafTree, setSafTree,
  deviceSongs, deviceTrackCount,
  type ScanResult,
} from '../services/devicelibrary';

export function DeviceMusicScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { goBack: () => void };
  const { playSong, current } = usePlayer();
  const [scanning, setScanning] = useState(false);
  const [found, setFound] = useState(0);
  const [count, setCount] = useState(deviceTrackCount());
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick(t => t + 1), []);
  useEffect(() => setCount(deviceTrackCount()), [tick]);

  const scan = async () => {
    setScanning(true); setFound(0);
    try {
      // 优先：已授权的 SAF 目录（scoped storage 下最可靠）
      const tree = getSafTree();
      let r: ScanResult | null = null;
      if (tree) {
        r = await scanSafTree(tree, n => setFound(n));
        if (r.count === 0) r = null; // 授权目录空了，回退重选
      }
      if (!r) {
        // 直接路径模式（旧设备可用）
        await ensurePermission();
        r = await scanByPath(n => setFound(n));
      }
      if (r.count === 0) {
        // scoped storage 拦截 → 引导用户选文件夹（SAF）
        setScanning(false);
        Alert.alert(
          '选择音乐文件夹',
          '系统限制直接读取存储，请在弹出的窗口中选择存放音乐的文件夹（如 Music），授权后自动扫描。',
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
                Alert.alert('扫描完成', `共发现 ${r2.count} 首本地音乐（${(r2.ms / 1000).toFixed(1)}s）`);
              },
            },
          ],
        );
        setScanning(false);
        return;
      }
      refresh();
      Alert.alert('扫描完成', `共发现 ${r.count} 首本地音乐（${(r.ms / 1000).toFixed(1)}s）`);
    } catch (e) {
      Alert.alert('扫描失败', (e as Error).message);
    } finally { setScanning(false); }
  };

  const songs = deviceSongs();

  const addAllToPlaylist = () => {
    if (!songs.length) { Alert.alert('没有本地音乐', '先扫描设备音乐'); return; }
    Alert.alert('加入歌单', `把 ${songs.length} 首本地音乐加入新歌单？`, [
      { text: '取消', style: 'cancel' },
      { text: '创建歌单', onPress: () => { library.create('设备本地音乐', songs, { desc: '扫描自设备存储' }); Alert.alert('完成', '已创建「设备本地音乐」歌单'); } },
    ]);
  };

  const addOne = (i: number) => {
    const pls = library.all();
    const options = pls.map(p => ({ label: `${p.name} (${p.songs.length})`, onPress: () => { library.addSongs(p.id, [songs[i]]); Alert.alert('已加入', p.name); } }));
    options.push({ label: '＋ 新建歌单', onPress: () => { const pl = library.create(`本地歌单 ${new Date().getMonth() + 1}/${new Date().getDate()}`, [songs[i]]); Alert.alert('已创建', pl.name); } });
    Alert.alert('加入歌单', songs[i].name, [{ text: '取消', style: 'cancel' }, ...options]);
  };

  return (
    <View style={st.screen}>
      <View style={[st.header, { paddingTop: insets.top + 20 }]}>
        <TouchableOpacity onPress={() => nav.goBack()} hitSlop={6} style={{ width: 22 }}>
          <Icon name="back" size={22} />
        </TouchableOpacity>
        <Text style={st.title}>本地音乐</Text>
        <View style={{ width: 22 }} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 120 }}>
        <View style={st.scanCard}>
          <View style={{ flex: 1 }}>
            <Text style={st.scanTitle}>{scanning ? `扫描中… 已发现 ${found} 首` : `${count} 首设备音乐`}</Text>
            <Text style={st.scanSub}>扫描设备音乐目录（需授权文件夹）</Text>
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
                <TouchableOpacity hitSlop={8} onPress={() => addOne(i)}>
                  <Icon name="add" size={18} color={C.text2} />
                </TouchableOpacity>
              )}
            />
          ))}
        </View>
        {!scanning && !count ? <Text style={st.empty}>未发现本地音乐{'\n'}点「开始扫描」授权音乐文件夹后自动导入</Text> : null}
      </ScrollView>
      <View style={st.miniDock} pointerEvents="box-none"><MiniPlayer /></View>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { height: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 6 },
  title: { flex: 1, color: C.text, fontSize: 24, lineHeight: 35, fontWeight: '700', textAlign: 'center' },
  scanCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#1A1A1A', borderRadius: 14, padding: 16 },
  scanTitle: { color: C.text, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  scanSub: { color: C.text2, fontSize: 11, lineHeight: 15, marginTop: 4 },
  scanBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.brand, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 9 },
  scanBtnText: { color: C.onBrand, fontSize: 12, fontWeight: '600' },
  addAll: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 38, borderRadius: 12, backgroundColor: '#1A1A1A', marginTop: 12 },
  addAllText: { color: C.brandSoft, fontSize: 12, fontWeight: '500' },
  empty: { color: C.text2, fontSize: 12, lineHeight: 18, textAlign: 'center', paddingVertical: 40 },
  miniDock: { position: 'absolute', left: 0, right: 0, bottom: 12 },
});
