// LocalLibraryScreen —— 本机曲库浏览页(模块②)
// 三视图:歌手墙/专辑墙(复用 MyLibraryScreen.DiscCard 现有组件)/文件夹原目录视角(含「未分类」独立分组 v3 A3)。
// 进队列/播放:与其他源同构(toPlayable → source='device' 复用本机播放路径)。
// 顶栏 ⋯ 菜单:重新扫描(增量 mtime,v3 A6)/编辑配置/删除。目录失效:空态页+重新选择目录恢复(v3 A5,不删数据)。
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Animated, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Icon } from '../theme/Icon';
import { C } from '../theme/tokens';
import { PageHeader } from '../components/PageChrome';
import { SongRow } from '../components/SongRow';
import { dialog, toast } from '../components/Dialog';
import { usePlayer } from '../state/PlayerProvider';
import { DiscCard } from './MyLibraryScreen';
import {
  localLib, localArtists, localAlbums, localSingerTracks, localAlbumTracks,
  localFolderView, checkLocalLib, rescanLocalLibrary,
  toPlayable, UNKNOWN_ARTIST,
  type LocalLibConfig, type LocalTrack, type ScanProgress,
} from '../services/localLibrary';

type View = 'artists' | 'albums' | 'folders';
const VIEWS: { key: View; label: string }[] = [
  { key: 'artists', label: '歌手' },
  { key: 'albums', label: '专辑' },
  { key: 'folders', label: '文件夹' },
];

/** 歌曲行「文件名识别」小 tag(v3 A3:11px text3 surface2 底 radius 999) */
function FilenameTag() {
  return <Text style={st.fnTag}>文件名识别</Text>;
}

export function LocalLibraryScreen({ route }: { route: { params: { libId: string } } }) {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { goBack: () => void; navigate: (s: string, p?: object) => void };
  const { playSong, current } = usePlayer();
  const [cfg, setCfg] = useState<LocalLibConfig | null>(() => localLib.get(route.params.libId) || null);
  const [avail, setAvail] = useState<boolean | null>(null); // null=检测中
  const [view, setView] = useState<View>('artists');
  const [drill, setDrill] = useState<{ kind: 'artist' | 'album'; key: string; name: string } | null>(null);
  const [dirPath, setDirPath] = useState('');
  const [tick, setTick] = useState(0);
  const [rescan, setRescan] = useState<ScanProgress | null>(null);
  const bar = useRef(new Animated.Value(0)).current;
  const token = useRef({ cancelled: false });

  const refresh = useCallback(() => {
    setCfg(localLib.get(route.params.libId) || null);
    setTick(t => t + 1);
  }, [route.params.libId]);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  // 失效检测(v3 A5)
  useEffect(() => {
    if (!cfg) return;
    let dead = false;
    checkLocalLib(cfg).then(ok => { if (!dead) setAvail(ok); });
    return () => { dead = true; };
  }, [cfg?.id, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  // 增量重扫(v3 A6)
  const doRescan = () => {
    if (!cfg || rescan) return;
    if (avail === false) { toast('目录不可用，请先重新选择目录'); return; }
    token.current = { cancelled: false };
    setRescan({ found: 0, recognized: 0, phase: 'delta' });
    rescanLocalLibrary(cfg, p => setRescan(p), token.current)
      .then(r => {
        if (r.cancelled) toast(`已取消：保留 ${r.kept} 首`);
        else toast(`扫描完成 · 新增 ${r.added} · 移除 ${r.removed}`); // v3 A6 文案
        refresh();
      })
      .catch(e => dialog.alert('扫描失败', (e as Error).message))
      .finally(() => setRescan(null));
  };
  useEffect(() => {
    if (!rescan) return;
    Animated.loop(Animated.timing(bar, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: false })).start();
    return () => { bar.stopAnimation(); bar.setValue(0); };
  }, [!!rescan, bar]); // eslint-disable-line react-hooks/exhaustive-deps

  const openMenu = () => {
    dialog.menu(cfg?.name || '本机曲库', [
      { label: '重新扫描', onPress: doRescan },
      { label: '编辑配置', onPress: () => nav.navigate('LocalLibEdit', { libId: route.params.libId }) },
      { label: '删除库', danger: true, onPress: () => dialog.confirm('删除本机曲库', `确定删除「${cfg?.name}」吗？仅移除扫描记录，不删除设备上的音乐文件。`, () => { localLib.remove(route.params.libId); nav.goBack(); }) },
    ]);
  };

  // 播放:当前上下文曲目列表整体进队列
  const play = async (tracks: LocalTrack[], idx: number) => {
    const items = await toPlayable(tracks, route.params.libId);
    if (items.length) playSong(items[Math.min(idx, items.length - 1)], items);
    else toast('目录不可用，请重新选择后重试');
  };

  if (!cfg) return (
    <View style={st.screen}>
      <PageHeader title="本机曲库" />
      <Text style={st.missing}>库不存在，可能已被删除</Text>
    </View>
  );

  const artists = localArtists(cfg.id);
  const albums = localAlbums(cfg.id);

  // ---------- 目录失效态(v3 A5):空态页+恢复入口,不自动删数据 ----------
  if (avail === false) {
    return (
      <View style={st.screen}>
        <PageHeader title={cfg.name} />
        <View style={st.emptyWrap}>
          <Icon name="folder-music" size={30} color="#D94D45" />
          <Text style={st.emptyT1}>目录不可用</Text>
          <Text style={st.emptyT2}>重新选择目录后恢复，数据未删除（SD 卡拔出 / 目录被移除时会出现此状态）</Text>
          <TouchableOpacity style={st.retryBtn} onPress={() => nav.navigate('LocalLibEdit', { libId: cfg.id })} activeOpacity={0.8}>
            <Text style={st.retryText}>重新选择目录</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ---------- 详情(歌手/专辑下钻) ----------
  if (drill) {
    const tracks = drill.kind === 'artist' ? localSingerTracks(cfg.id, drill.key) : localAlbumTracks(cfg.id, drill.key);
    return (
      <View style={st.screen}>
        <View style={[st.header, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity onPress={() => setDrill(null)} hitSlop={6} style={{ width: 26 }}>
            <Icon name="back" size={20} />
          </TouchableOpacity>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={st.title} numberOfLines={1}>{drill.name}</Text>
            <Text style={st.subTitle}>{tracks.length} 首</Text>
          </View>
          <TouchableOpacity style={st.playAllBtn} onPress={() => play(tracks, 0)} activeOpacity={0.75}>
            <Icon name="play" size={13} color={C.onBrand} />
            <Text style={st.playAllText}>播放全部</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 120 }}>
          {tracks.map((t, i) => (
            <SongRow
              key={t.id}
              song={{ name: t.name, singer: t.singer || UNKNOWN_ARTIST, source: 'device', songmid: t.uri || t.id, albumId: '', interval: t.durationSec ? `${Math.floor(t.durationSec / 60)}:${Math.round(t.durationSec % 60) < 10 ? '0' : ''}${Math.round(t.durationSec % 60)}` : '', albumName: t.album || undefined }}
              playing={current?.hash === t.id}
              onPress={() => play(tracks, i)}
              extra={t.tagSource === 'filename' ? <FilenameTag /> : undefined}
            />
          ))}
          {!tracks.length ? <Text style={st.emptyInline}>没有歌曲</Text> : null}
        </ScrollView>
      </View>
    );
  }

  // ---------- 主浏览 ----------
  return (
    <View style={st.screen}>
      <PageHeader
        title={cfg.name}
        right={(
          <TouchableOpacity onPress={openMenu} hitSlop={6}>
            <Icon name="more" size={22} />
          </TouchableOpacity>
        )}
      />
      {/* 增量重扫进度(顶栏下细条) */}
      {rescan ? (
        <View style={st.rescanBar}>
          <Text style={st.rescanText} numberOfLines={1}>
            增量扫描 · 已发现 {rescan.found} · 新识别 {rescan.recognized}
          </Text>
          <TouchableOpacity hitSlop={6} onPress={() => { token.current.cancelled = true; }}>
            <Text style={st.cancelText}>取消</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {/* 三视图胶囊 */}
      <View style={st.tabs}>
        {VIEWS.map(v => (
          <TouchableOpacity key={v.key} style={[st.tab, view === v.key && st.tabOn]} onPress={() => setView(v.key)} activeOpacity={0.75}>
            <Text style={[st.tabText, view === v.key && st.tabTextOn]}>{v.label}</Text>
          </TouchableOpacity>
        ))}
        <Text style={st.statsText}>{cfg.trackCount} 首</Text>
      </View>

      {cfg.trackCount === 0 ? (
        <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
          <View style={st.emptyWrap}>
            <Icon name="folder-music" size={30} color={C.text3} />
            <Text style={st.emptyT1}>这个目录还没有音乐</Text>
            <Text style={st.emptyT2}>支持 FLAC / MP3 / WAV / APE / OGG / M4A；换目录或重新扫描试试</Text>
            <TouchableOpacity style={st.retryBtn} onPress={() => nav.navigate('LocalLibEdit', { libId: cfg.id })} activeOpacity={0.8}>
              <Text style={st.retryText}>编辑配置</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : view === 'artists' ? (
        /* 歌手墙:复用现有 DiscCard 组件(MyLibraryScreen 同款圆形歌手卡) */
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 120 }}>
          <View style={st.wallRound}>
            {artists.map(a => (
              <DiscCard
                key={a.key}
                name={a.name}
                round
                count={a.songCount}
                sub={`${a.songCount} 首`}
                unknown={a.name === UNKNOWN_ARTIST}
                onPress={() => setDrill({ kind: 'artist', key: a.key, name: a.name })}
              />
            ))}
          </View>
        </ScrollView>
      ) : view === 'albums' ? (
        /* 专辑墙:DiscCard 方形唱片卡 */
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 120 }}>
          <View style={st.wall}>
            {albums.map(a => (
              <DiscCard
                key={a.key}
                name={a.name}
                count={a.songCount}
                sub={a.byDir ? `${a.artist} · 文件夹分组` : a.artist}
                unknown={!a.byDir && a.name === '本机音乐'}
                onPress={() => setDrill({ kind: 'album', key: a.key, name: a.name })}
              />
            ))}
          </View>
        </ScrollView>
      ) : (
        /* 文件夹视角:原目录树 + 未分类独立分组(v3 A3) */
        <FolderPane
          libId={cfg.id}
          dirPath={dirPath}
          onDir={setDirPath}
          onPlay={play}
          currentHash={current?.hash}
        />
      )}
    </View>
  );
}

/** 文件夹视角:面包屑 + 子目录行 + 未分类分组 + 歌曲行 */
function FolderPane({ libId, dirPath, onDir, onPlay, currentHash }: {
  libId: string; dirPath: string; onDir: (p: string) => void;
  onPlay: (tracks: LocalTrack[], idx: number) => void; currentHash?: string;
}) {
  const fv = localFolderView(libId, dirPath);
  const segs = dirPath ? dirPath.split('/') : [];
  const allSongs = [...fv.songs, ...fv.unknown];

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 140 }}>
      {/* 面包屑 */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.crumbWrap} contentContainerStyle={{ gap: 4, alignItems: 'center' }}>
        <TouchableOpacity hitSlop={4} onPress={() => onDir('')}>
          <Text style={[st.crumbItem, !dirPath && st.crumbCur]}>根目录</Text>
        </TouchableOpacity>
        {segs.map((s, i) => {
          const p = segs.slice(0, i + 1).join('/');
          const last = i === segs.length - 1;
          return (
            <React.Fragment key={p}>
              <Icon name="chevronright" size={11} color={C.text3} />
              <TouchableOpacity hitSlop={4} onPress={() => onDir(p)}>
                <Text style={[st.crumbItem, last && st.crumbCur]} numberOfLines={1}>{s}</Text>
              </TouchableOpacity>
            </React.Fragment>
          );
        })}
      </ScrollView>

      {/* 未分类独立分组(v3 A3:icon file-question,不丢弃不隐藏;仅根级) */}
      {fv.unknown.length ? (
        <View style={st.uncWrap}>
          <TouchableOpacity style={st.uncHead} onPress={() => onPlay(fv.unknown, 0)} activeOpacity={0.75}>
            <Icon name="file-question" size={18} color={C.text3} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.uncTitle}>未分类</Text>
              <Text style={st.uncSub}>{fv.unknown.length} 首 · 缺元数据且文件名无「歌手 - 标题」模式</Text>
            </View>
            <Icon name="play" size={14} color={C.text3} />
          </TouchableOpacity>
        </View>
      ) : null}

      {/* 子目录行 */}
      {fv.dirs.map(d => (
        <TouchableOpacity key={d.path} style={st.dirRow} onPress={() => onDir(d.path)} activeOpacity={0.75}>
          <View style={st.dirIcon}><Icon name="folder" size={16} color={C.brandText} /></View>
          <Text style={st.dirName} numberOfLines={1}>{d.name}</Text>
          <Text style={st.dirCount}>{d.count} 首</Text>
          <Icon name="chevronright" size={15} color={C.text3} />
        </TouchableOpacity>
      ))}

      {/* 歌曲行(点=播放,队列=当前目录) */}
      {allSongs.map((t, i) => (
        <SongRow
          key={t.id}
          song={{ name: t.name, singer: t.singer || UNKNOWN_ARTIST, source: 'device', songmid: t.uri || t.id, albumId: '', interval: t.durationSec ? `${Math.floor(t.durationSec / 60)}:${Math.round(t.durationSec % 60) < 10 ? '0' : ''}${Math.round(t.durationSec % 60)}` : '', albumName: t.album || undefined }}
          playing={currentHash === t.id}
          onPress={() => onPlay(allSongs, i)}
          extra={t.tagSource === 'filename' ? <FilenameTag /> : undefined}
        />
      ))}
      {!fv.dirs.length && !allSongs.length ? <Text style={st.emptyInline}>空目录</Text> : null}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  missing: { color: C.text2, fontSize: 12, textAlign: 'center', paddingVertical: 40 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 10, gap: 8 },
  title: { color: C.text, fontSize: 20, fontWeight: '700' },
  subTitle: { color: C.text3, fontSize: 11, marginTop: 1 },
  playAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.brand, borderRadius: 16, paddingHorizontal: 13, paddingVertical: 8 },
  playAllText: { color: C.onBrand, fontSize: 12, fontWeight: '600' },
  // 胶囊 tab
  tabs: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8 },
  tab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, backgroundColor: C.surface2 },
  tabOn: { backgroundColor: C.brand },
  tabText: { color: C.text2, fontSize: 12, fontWeight: '600' },
  tabTextOn: { color: C.onBrand },
  statsText: { flex: 1, color: C.text3, fontSize: 11, textAlign: 'right' },
  // 重扫条
  rescanBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 6, backgroundColor: C.surface2, marginHorizontal: 16, borderRadius: 10 },
  rescanText: { flex: 1, color: C.text2, fontSize: 11.5 },
  cancelText: { color: C.brandText, fontSize: 12, fontWeight: '600' },
  // 墙
  wall: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  wallRound: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  // 空态/失效
  emptyWrap: { alignItems: 'center', gap: 10, paddingVertical: 64, paddingHorizontal: 32 },
  emptyT1: { color: C.text, fontSize: 16, fontWeight: '700' },
  emptyT2: { color: C.text2, fontSize: 12, lineHeight: 17, textAlign: 'center' },
  retryBtn: { backgroundColor: C.brand, borderRadius: 18, paddingHorizontal: 20, paddingVertical: 10, marginTop: 8 },
  retryText: { color: C.onBrand, fontSize: 13, fontWeight: '600' },
  emptyInline: { color: C.text2, fontSize: 12, textAlign: 'center', paddingVertical: 40 },
  // 文件夹视角
  crumbWrap: { flexGrow: 0, marginBottom: 10 },
  crumbItem: { color: C.text2, fontSize: 12, paddingVertical: 2 },
  crumbCur: { color: C.text, fontWeight: '700' },
  uncWrap: { backgroundColor: C.surface2, borderRadius: 12, padding: 12, marginBottom: 10 },
  uncHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  uncTitle: { color: C.text, fontSize: 13.5, fontWeight: '600' },
  uncSub: { color: C.text3, fontSize: 10.5, lineHeight: 14, marginTop: 1 },
  dirRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.strokeFaint },
  dirIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  dirName: { flex: 1, color: C.text, fontSize: 13.5, fontWeight: '500', minWidth: 0 },
  dirCount: { color: C.text3, fontSize: 11 },
  fnTag: { color: C.text3, fontSize: 11, backgroundColor: C.surface2, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, overflow: 'hidden' },
});

// navigation 注册用包装(native-stack 组件类型兼容)
export function LocalLibraryRoute(props: Record<string, unknown>) {
  const route = (props as { route: { params: { libId: string } } }).route;
  return <LocalLibraryScreen route={route} />;
}
