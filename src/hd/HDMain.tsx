// HD(车机/TV)主壳 —— 对齐桌面版:左侧 174dp 侧栏(发现/我的乐库/歌单 三组)
// + 内容区(层叠保状态) + 底部 64dp 桌面式播放条
// 业务层(播放引擎/音源/媒体库)全复用 phone 版,仅 UI 形态不同
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../theme/Icon';
import { C, H, SH, fmtSec } from './hdtokens';
import { HDTouch } from './HDTouch';
import { usePlayer } from '../state/PlayerProvider';
import { useApp } from '../state/AppState';
import { library } from '../state/library';
import { getRecents } from '../state/recent';
import { sync, lxToApp } from '../services/sync';
import { hdNav } from './hdnav';
import { HDHome } from './HDHome';
import { HDSearch } from './HDSearch';
import { HDBoards } from './HDBoards';
import { HDPodcast } from './HDPodcast';
import type { SongItem } from '../services/server';

// 对齐桌面版侧栏:发现 = 为我推荐/播客/探索/榜单
const TABS = [
  { key: 'home', icon: 'home', label: '为我推荐' },
  { key: 'podcast', icon: 'podcast', label: '播客' },
  { key: 'search', icon: 'globe', label: '探索' },
  { key: 'boards', icon: 'ranking', label: '榜单' },
] as const;

export function HDMain() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<number>(0);
  const [pls, setPls] = useState<{ key: string; localId?: string; name: string; count: number; songs: SongItem[] }[]>([]);
  const { connected, token } = useApp();

  // 歌单列表(本地 + 同步),侧栏「歌单」组
  useEffect(() => {
    const local = library.all().map(p => ({ key: p.id, localId: p.id, name: p.name, count: p.songs.length, songs: p.songs as SongItem[] }));
    setPls(local);
    if (connected && token) {
      sync.fetchLists().then(s => {
        if (!s) return;
        setPls([...local, ...(s.userList || []).map(u => ({
          key: u.id, name: u.name,
          count: (u.list || []).length,
          songs: (u.list || []).map(lxToApp),
        }))]);
      }).catch(() => {});
    }
  }, [connected, token]); // eslint-disable-line react-hooks/exhaustive-deps

  const openPl = (pl: { localId?: string; name: string; count: number; songs: SongItem[] }) => {
    hdNav()?.navigate('PlaylistDetail', pl.localId
      ? { localId: pl.localId, title: pl.name, songs: pl.songs }
      : { title: pl.name, songs: pl.songs, meta: `${pl.count} 首 · 同步歌单` });
  };

  const openFavorites = () => {
    if (!connected || !token) { hdNav()?.navigate('AuthLogin'); return; }
    sync.fetchLists().then(s => {
      if (!s) return;
      const songs = (s.loveList || []).map(lxToApp);
      hdNav()?.navigate('PlaylistDetail', { title: '我喜欢的', songs, meta: `${songs.length} 首 · 同步收藏` });
    }).catch(() => {});
  };

  const openHistory = () => {
    const songs = getRecents().slice(0, 100);
    if (songs.length) hdNav()?.navigate('PlaylistDetail', { title: '播放历史', songs, meta: `${songs.length} 首` });
  };

  return (
    <View style={st.screen}>
      {/* ===== 侧栏(桌面版结构) ===== */}
      <View style={st.sidebarWrap}>
        <ScrollView
          style={{ flex: 1, backgroundColor: C.bg }}
          contentContainerStyle={{ paddingTop: Math.min(insets.top, 12), paddingBottom: 10, gap: 2 }}
          showsVerticalScrollIndicator={false}
        >
          {/* 品牌(新品牌玻璃 Mark) */}
          <View style={st.brandRow}>
            <Image source={require('../assets/brand/mark.png')} style={st.logoMark} />
            <View style={{ flex: 1 }}>
              <Text style={st.brandName}>Next<Text style={{ color: C.brand }}>Music</Text></Text>
              <Text style={st.brandSub}>TV · CAR EDITION</Text>
            </View>
          </View>

          {/* 发现 */}
          <Group label="发现" />
          {TABS.map((t, i) => (
            <NavItem key={t.key} icon={t.icon} label={t.label} active={tab === i} first={i === 0}
              onPress={() => setTab(i)} />
          ))}

          {/* 我的乐库 */}
          <Group label="我的乐库" top={8} />
          <NavItem icon="server" label="媒体库" onPress={() => hdNav()?.navigate('MediaLibs')} />
          <NavItem icon="heart" label="我喜欢的" onPress={openFavorites} />
          <NavItem icon="history" label="播放历史" onPress={openHistory} />

          {/* 歌单 */}
          <Group label="歌单" top={8} />
          {pls.slice(0, 5).map(pl => (
            <PlItem key={pl.key} name={pl.name} count={pl.count} onPress={() => openPl(pl)} />
          ))}
          <PlItem name="新建歌单" add onPress={() => hdNav()?.navigate('ImportPlaylist')} />
        </ScrollView>
        <NavItem icon="settings" label="设置" onPress={() => hdNav()?.navigate('Settings')} />
      </View>

      {/* ===== 内容区 + 播放条 ===== */}
      <View style={st.body}>
        <View style={st.tabStack} collapsable={false}>
          <View style={[st.tabHost, tab !== 0 && st.tabOff]}><HDHome onGotoSearch={() => setTab(2)} /></View>
          <View style={[st.tabHost, tab !== 1 && st.tabOff]}><HDPodcast /></View>
          <View style={[st.tabHost, tab !== 2 && st.tabOff]}><HDSearch /></View>
          <View style={[st.tabHost, tab !== 3 && st.tabOff]}><HDBoards /></View>
        </View>
        <HDPlayBar />
      </View>
    </View>
  );
}

function Group({ label, top = 4 }: { label: string; top?: number }) {
  return <Text style={[st.group, { marginTop: top + 5 }]}>{label}</Text>;
}

function NavItem({ icon, label, active, first, onPress }: { icon: string; label: string; active?: boolean; first?: boolean; onPress: () => void }) {
  return (
    <HDTouch style={[st.navItem, active && st.navItemOn]} focusStyle={st.navFocus} hasTVPreferredFocus={first}
      onPress={onPress}>
      <Icon name={icon as never} size={16} color={active ? C.text : C.text2} />
      <Text style={[st.navLabel, active && { fontWeight: '700', color: C.text }]} numberOfLines={1}>{label}</Text>
    </HDTouch>
  );
}

function PlItem({ name, count, add, onPress }: { name: string; count?: number; add?: boolean; onPress: () => void }) {
  // 桌面版同构:单行(图标块 + 名字),计数折进后缀,保证文字与图标严格垂直居中
  return (
    <HDTouch style={st.plItem} focusStyle={st.navFocus} onPress={onPress}>
      {add
        ? <View style={st.plAddChip}><Icon name="add" size={12} color={C.text3} /></View>
        : <View style={st.plChip}><Icon name="music" size={10} color={C.text3} /></View>}
      <Text style={st.plName} numberOfLines={1}>{name}{count != null ? ` · ${count}` : ''}</Text>
    </HDTouch>
  );
}

// 桌面式播放条:左(封面+曲目+收藏) 中(控件+进度) 右(队列/投屏/详情)
function HDPlayBar() {
  const { current, playing, position, duration, toggle, skipNext, skipPrev, queue, shuffle, repeat, setShuffle, cycleRepeat } = usePlayer();
  const pct = duration > 0 ? Math.min(1, position / duration) : 0;

  return (
    <View style={st.playbar}>
      {/* 左 */}
      <View style={st.pbLeft}>
        <HDTouch style={st.pbCoverTouch} focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 9 }} onPress={() => hdNav()?.navigate('Player')}>
          {current?.img
            ? <Image source={{ uri: current.img }} style={st.pbArt} />
            : <View style={[st.pbArt, { backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' }]}><Text style={{ color: C.text3, fontSize: 14 }}>♪</Text></View>}
        </HDTouch>
        <View style={{ minWidth: 0, flex: 1, gap: 1 }}>
          <Text style={st.pbTitle} numberOfLines={1}>{current?.name ?? '未在播放'}</Text>
          <Text style={st.pbSub} numberOfLines={1}>{current ? `${current.singer}${current.albumName ? ` · ${current.albumName}` : ''}` : '从「探索」搜索或点击歌单开始'}</Text>
        </View>
      </View>

      {/* 中:控件 + 进度 */}
      <View style={{ flex: 1, alignItems: 'center', gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <HDTouch style={st.tool} focusStyle={st.toolFocus} onPress={() => setShuffle(!shuffle)}>
            <Icon name="shuffle" size={13} active={shuffle} color={shuffle ? C.brand : C.text2} />
          </HDTouch>
          <HDTouch style={st.tool} focusStyle={st.toolFocus} onPress={skipPrev}>
            <Icon name="previous" size={15} color={C.text} />
          </HDTouch>
          <HDTouch style={st.playBtn} focusStyle={st.playBtnFocus} glow={SH.brand} onPress={toggle}>
            <Icon name={playing ? 'pause' : 'play'} size={15} color={C.onBrand} />
          </HDTouch>
          <HDTouch style={st.tool} focusStyle={st.toolFocus} onPress={skipNext}>
            <Icon name="next" size={15} color={C.text} />
          </HDTouch>
          <HDTouch style={st.tool} focusStyle={st.toolFocus} onPress={cycleRepeat}>
            <Icon name="repeat" size={13} active={repeat !== 'off'} color={repeat !== 'off' ? C.brand : C.text2} />
          </HDTouch>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'stretch', maxWidth: 480 }}>
          <Text style={st.pbTime}>{fmtSec(position)}</Text>
          <View style={st.pbTrack}>
            <View style={{ flex: pct, backgroundColor: C.brand, borderRadius: 2 }} />
            <View style={{ flex: 1 - pct, backgroundColor: C.track, borderRadius: 2 }} />
          </View>
          <Text style={st.pbTime}>{fmtSec(duration)}</Text>
        </View>
      </View>

      {/* 右 */}
      <View style={st.pbRight}>
        <HDTouch style={st.tool} focusStyle={st.toolFocus} onPress={() => hdNav()?.navigate('Queue')}>
          <Icon name="queue" size={14} color={C.text2} />
          {queue.length ? <View style={st.badge}><Text style={st.badgeText}>{queue.length > 99 ? '99' : queue.length}</Text></View> : null}
        </HDTouch>
        <HDTouch style={st.tool} focusStyle={st.toolFocus} onPress={() => hdNav()?.navigate('Route')}>
          <Icon name="devices" size={14} color={C.text2} />
        </HDTouch>
        <HDTouch style={st.tool} focusStyle={st.toolFocus} onPress={() => hdNav()?.navigate('Player')}>
          <Icon name="fullscreen" size={14} color={C.text2} />
        </HDTouch>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, flexDirection: 'row', backgroundColor: C.bg },
  sidebarWrap: { width: H.sidebar, backgroundColor: C.glass, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: C.border },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10 },
  logoMark: { width: 26, height: 28 },
  logoText: { color: C.onBrand, fontSize: 13, fontWeight: '800' },
  brandName: { color: C.text, fontSize: 13, fontWeight: '800' },
  brandSub: { color: C.text3, fontSize: 7, letterSpacing: 2, fontWeight: '600', marginTop: 1 },
  group: { fontSize: 9, color: C.text3, paddingHorizontal: 12, paddingTop: 5, paddingBottom: 3, letterSpacing: 1, fontWeight: '600' },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 8, paddingHorizontal: 10, height: 35, borderRadius: 9 },
  navItemOn: { backgroundColor: C.brandDim },
  navFocus: { borderWidth: 2, borderColor: C.brand, borderRadius: 9 },
  navLabel: { color: C.text2, fontSize: H.font.md, fontWeight: '500', flex: 1 },
  plItem: { flexDirection: 'row', alignItems: 'center', gap: 9, marginHorizontal: 8, paddingHorizontal: 10, height: 35, borderRadius: 9 },
  plChip: { width: 20, height: 20, borderRadius: 6, backgroundColor: C.grad1, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  plAddChip: { width: 20, height: 20, borderRadius: 6, borderWidth: 1, borderStyle: 'dashed', borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  plName: { color: C.text2, fontSize: H.font.sm, flex: 1 },
  body: { flex: 1 },
  tabStack: { flex: 1 },
  tabHost: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  tabOff: { display: 'none' as const, elevation: 0 },
  // 播放条(桌面式 64dp,玻璃磨砂面)
  playbar: {
    height: H.playbar, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 12,
    backgroundColor: C.glass, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border,
  },
  pbLeft: { flexDirection: 'row', alignItems: 'center', gap: 9, width: 225 },
  pbCoverTouch: { borderRadius: 9 },
  pbArt: { width: 40, height: 40, borderRadius: 9 },
  pbTitle: { color: C.text, fontSize: H.font.md, fontWeight: '600' },
  pbSub: { color: C.text2, fontSize: H.font.sm },
  tool: { width: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  toolFocus: { borderWidth: 2, borderColor: C.brand, borderRadius: 7 },
  playBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  playBtnFocus: { borderWidth: 2, borderColor: '#FFFFFF', borderRadius: 16 },
  pbTime: { color: C.text3, fontSize: 8, fontVariant: ['tabular-nums'], minWidth: 26 },
  pbTrack: { flex: 1, height: 3, borderRadius: 2, flexDirection: 'row', overflow: 'hidden' },
  pbRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  badge: { position: 'absolute', right: -3, bottom: -3, minWidth: 12, height: 12, borderRadius: 6, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  badgeText: { color: C.onBrand, fontSize: 7, fontWeight: '700' },
});
