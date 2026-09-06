// HD(车机/TV)主壳 —— 对齐桌面版:左侧 174dp 侧栏(发现/我的乐库/歌单 三组)
// + 内容区(层叠保状态) + 底部 64dp 桌面式播放条
// 业务层(播放引擎/音源/媒体库)全复用 phone 版,仅 UI 形态不同
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, Platform } from 'react-native';
const IS_WEB = Platform.OS === 'web';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../theme/Icon';
import { C, H, SH, fmtSec } from './hdtokens';
import { HDTouch } from './HDTouch';
import { usePlayer } from '../state/PlayerProvider';
import { useApp } from '../state/AppState';
import { library } from '../state/library';
import { dialog, toast } from '../components/Dialog';
import { getRecents } from '../state/recent';
import { sync, lxToApp } from '../services/sync';
import { hdNav, hdInnerRef } from './hdnav';
import { useFav } from './useFav';
import { mergeLocalLove } from '../state/favorites';
import { HDCollect } from './HDCollect';
import { NavigationContainer, DefaultTheme, StackActions, NavigationIndependentTree } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HDHome } from './HDHome';
import { HDSearch } from './HDSearch';
import { HDBoards } from './HDBoards';
import { HDPodcast } from './HDPodcast';
// lx84:内容区嵌套栈内页(侧栏恒固定,内页只在右侧切换;设置族除外走根栈)
import { HDPlayer } from './HDPlayer';
import { HDPlaylistDetailScreen } from './HDPlaylistDetail';
import { HDAuthLoginScreen } from './HDAuthLogin';
import { QueueScreen } from '../screens/QueueScreen';
import { CommentsScreen } from '../screens/CommentsScreen';
import { PlayerSettingsScreen } from '../screens/PlayerSettingsScreen';
import { ImportPlaylistScreen } from '../screens/ImportPlaylistScreen';
import { FxScreen } from '../screens/FxScreen';
import { MediaLibsScreen, ProviderBrowseRoute } from '../screens/MediaLibsScreen';
import { ProviderEditScreen } from '../screens/ProviderEditScreen';
import { ProviderDetailScreen } from '../screens/ProviderDetailScreen';
import { DownloadsScreen } from '../screens/DownloadsScreen';
import { BoardsSquareScreen } from '../screens/BoardsSquareScreen';
import { DeviceMusicScreen } from '../screens/DeviceMusicScreen';
import { SearchScreen } from '../screens/SearchScreen';
import { RoutePage } from '../screens/RouteScreen';
import { SourcesScreen, AccountScreen } from '../screens/SourcesAccountScreens';
import { AuthSignupScreen } from '../screens/AuthSignupScreen';
import type { SongItem } from '../services/server';

// 对齐桌面版侧栏:发现 = 为我推荐/播客/探索/榜单
const TABS = [
  { key: 'home', icon: 'home', label: '为我推荐' },
  { key: 'podcast', icon: 'podcast', label: '播客' },
  { key: 'search', icon: 'globe', label: '探索' },
  { key: 'boards', icon: 'ranking', label: '榜单' },
] as const;

const InnerStack = createNativeStackNavigator();
const hdInnerTheme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: C.bg, card: C.bg, text: C.text, primary: C.brand, border: 'transparent' } };
// 侧栏 tab 点击:切 tab 同时把内容区栈收回首屏(内页开着时点侧栏=回内容首页,桌面司约)
const hdInnerPop = () => {
  try {
    if (hdInnerRef.isReady()) hdInnerRef.dispatch(StackActions.popToTop());
  } catch { /* 栈未就绪忽略 */ }
};
// 侧栏跳转:内容栈先回底再进新页(侧栏=顶级导航,桌面司约——避免返回时落回上一个内页)
const railNav = (s: string, p?: object) => {
  hdInnerPop();
  hdNav()?.navigate(s, p);
};

export function HDMain() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<number>(0);
  const [pls, setPls] = useState<{ key: string; localId?: string; name: string; count: number; songs: SongItem[] }[]>([]);
  const [loveCount, setLoveCount] = useState<number | null>(null); // lx67:侧栏"我喜欢的"数量统计
  const { connected, token } = useApp();

  // 歌单列表(本地+同步)与"我喜欢的"计数——lx91 单次拉取;lx104:缓存秒出+我喜欢的去重+离线收藏合并
  useEffect(() => {
    // lx104:本地「我喜欢的」由专用入口展示,歌单组里去重(老板:快捷收藏合并)
    const local = library.all()
      .filter(p => p.name !== '我喜欢的')
      .map(p => ({ key: p.id, localId: p.id, name: p.name, count: p.songs.length, songs: p.songs as SongItem[] }));
    setPls(local);
    if (!connected || !token) return;
    // 快照缓存先行(大快照拉取慢——懒加载第一层:侧栏不等网)
    const cached = sync.cachedLists();
    if (cached) {
      setLoveCount((cached.loveList || []).length);
      setPls(prev => {
        const has = new Set(prev.map(x => x.key));
        return [...prev, ...(cached.userList || []).filter(u => !has.has(u.id)).map(u => ({
          key: u.id, name: u.name, count: (u.list || []).length, songs: (u.list || []).map(lxToApp),
        }))];
      });
    }
    mergeLocalLove(
      connected && token ? ((snap: Parameters<typeof sync.pushLists>[0]) => sync.pushLists(snap)) : undefined,
      () => sync.fetchLists(),
    );
    sync.fetchLists().then(s => {
      if (!s) return;
      setLoveCount((s.loveList || []).length);
      setPls([...local, ...(s.userList || []).map(u => ({
        key: u.id, name: u.name,
        count: (u.list || []).length,
        songs: (u.list || []).map(lxToApp),
      }))]);
    }).catch(() => {});
  }, [connected, token]); // eslint-disable-line react-hooks/exhaustive-deps

  // lx101:歌单管理(长按)——本机 library 重命名/删除;同步歌单 fetch+push 服务器 userList
  const managePl = (pl: { localId?: string; key: string; name: string; count: number; songs?: SongItem[] }) => {
    dialog.menu(`管理「${pl.name}」`, [
      { label: '重命名歌单', onPress: () => {
        dialog.prompt('重命名歌单', {
          defaultValue: pl.name,
          onSubmit: async (v) => {
            if (!v || v === pl.name) return;
            if (pl.localId) { library.update(pl.localId, { name: v }); toast('已重命名'); }
            else if (connected && token) {
              const ok = await sync.renameUserList(pl.key, v);
              toast(ok ? '已重命名' : '服务器操作失败');
            }
          },
        });
      } },
      { label: '删除歌单', danger: true, onPress: () => {
        dialog.confirm('删除歌单', `确定删除「${pl.name}」？${pl.count} 首将从此歌单移除`, async () => {
          if (pl.localId) { library.remove(pl.localId); toast('已删除'); }
          else if (connected && token) {
            const ok = await sync.removeUserList(pl.key);
            toast(ok ? '已删除' : '服务器操作失败');
          }
        });
      } },
    ]);
  };

  const openPl = (pl: { localId?: string; key: string; name: string; count: number; songs: SongItem[] }) => {
    railNav('PlaylistDetail', pl.localId
      ? { localId: pl.localId, title: pl.name, songs: pl.songs }
      : { title: pl.name, songs: pl.songs, meta: `${pl.count} 首 · 同步歌单`, plKey: pl.key });
  };

  // lx67:登录后拉"我喜欢的"数量(侧栏展示)——lx91 并入上方歌单 effect,此处留空

  const openFavorites = () => {
    if (!connected || !token) { hdNav()?.navigate('AuthLogin'); return; }
    sync.fetchLists().then(s => {
      if (!s) return;
      const songs = (s.loveList || []).map(lxToApp);
      railNav('PlaylistDetail', { title: '我喜欢的', songs, meta: `${songs.length} 首 · 同步收藏`, love: true });
    }).catch(() => {});
  };

  const openHistory = () => {
    const songs = getRecents().slice(0, 100);
    if (songs.length) railNav('PlaylistDetail', { title: '播放历史', songs, meta: `${songs.length} 首` });
  };

  return (
    <View style={st.screen}>
      {/* ===== 侧栏(桌面版结构) ===== */}
      <View style={IS_WEB ? st.sidebarWrapWeb : st.sidebarWrap}>
        <ScrollView
          style={{ flex: 1, backgroundColor: C.bg }}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 10, gap: 2 }}
          showsVerticalScrollIndicator={false}
        >
          {IS_WEB ? null : (
            <View style={st.brandRow}>
              <Image source={require('../assets/brand/mark.png')} style={st.logoMark} />
              <View style={{ flex: 1 }}>
                <Text style={st.brandName}>Next<Text style={{ color: C.brand }}>Music</Text></Text>
              </View>
            </View>
          )}

          {/* 发现 */}
          <Group label="发现" />
          {TABS.map((t, i) => (
            <NavItem key={t.key} icon={t.icon} label={t.label} active={tab === i} first={i === 0}
              onPress={() => { setTab(i); hdInnerPop(); }} />
          ))}

          {/* 我的乐库 */}
          <Group label="我的乐库" top={8} />
          <NavItem icon="server" label="媒体库" onPress={() => railNav('MediaLibs')} />
          <HDTouch style={st.navItem} focusStyle={st.navFocus} onPress={openFavorites}>
            <Icon name="heart" size={16} color={C.text2} />
            <Text style={st.navLabel} numberOfLines={1}>我喜欢的{loveCount != null ? ` · ${loveCount}` : ''}</Text>
          </HDTouch>
          <NavItem icon="history" label="播放历史" onPress={openHistory} />

          {/* 歌单 */}
          <Group label="歌单" top={8} />
          {pls.slice(0, 5).map(pl => (
            <PlItem key={pl.key} name={pl.name} count={pl.count} onPress={() => openPl(pl)} onLongPress={() => managePl(pl)} />
          ))}
          <PlItem name="新建歌单" add onPress={() => dialog.menu('新建歌单', [
              { label: '空白歌单', onPress: () => {
                dialog.prompt('新建歌单', { defaultValue: '', onSubmit: (v) => { const n = (v || '').trim(); if (n) { library.create(n); toast('已创建'); } } });
              } },
              { label: '导入平台歌单', onPress: () => railNav('ImportPlaylist') },
            ])} />
        </ScrollView>
        {/* lx85:设置项不贴底——留出焦点环完整显示空间(老板:太靠底被裁切) */}
        {IS_WEB ? null : (
          <View style={st.settingsDock}>
            <NavItem icon="settings" label="设置" onPress={() => hdNav()?.navigate('Settings')} />
          </View>
        )}
      </View>

      {/* ===== 内容区(lx84:嵌套栈——内页只在此切换,侧栏恒固定) ===== */}
      <View style={st.body}>
        <NavigationIndependentTree>
        <NavigationContainer ref={hdInnerRef} theme={hdInnerTheme}>
          {/* 坞108:TV 转场必须直切;坞57:fade 有变亮中间态 */}
          <InnerStack.Navigator screenOptions={{ headerShown: false, animation: 'none', contentStyle: { backgroundColor: C.bg }, freezeOnBlur: true }}>
            <InnerStack.Screen name="Tabs">{() => <TabsHost tab={tab} setTab={setTab} />}</InnerStack.Screen>
            <InnerStack.Screen name="Player" component={HDPlayer} />
            <InnerStack.Screen name="Queue" component={QueueScreen} />
            <InnerStack.Screen name="Route" component={RoutePage} options={{ presentation: 'transparentModal' }} />
            <InnerStack.Screen name="Comments" component={CommentsScreen} />
            <InnerStack.Screen name="PlaylistDetail" component={HDPlaylistDetailScreen} />
            <InnerStack.Screen name="Search" component={SearchScreen} />
            <InnerStack.Screen name="PlayerSettings" component={PlayerSettingsScreen} />
            <InnerStack.Screen name="ImportPlaylist" component={ImportPlaylistScreen} />
            <InnerStack.Screen name="Fx" component={FxScreen} />
            <InnerStack.Screen name="MediaLibs" component={MediaLibsScreen} />
            <InnerStack.Screen name="ProviderEdit" component={ProviderEditScreen} />
            <InnerStack.Screen name="ProviderBrowse" component={ProviderBrowseRoute} />
            <InnerStack.Screen name="ProviderDetail" component={ProviderDetailScreen} />
            <InnerStack.Screen name="Downloads" component={DownloadsScreen} />
            <InnerStack.Screen name="BoardsSquare" component={BoardsSquareScreen} />
            <InnerStack.Screen name="DeviceMusic" component={DeviceMusicScreen} />
            <InnerStack.Screen name="Sources" component={SourcesScreen} />
            <InnerStack.Screen name="Account" component={AccountScreen} />
            <InnerStack.Screen name="AuthLogin" component={HDAuthLoginScreen} />
            <InnerStack.Screen name="AuthSignup" component={AuthSignupScreen} />
          </InnerStack.Navigator>
        </NavigationContainer>
        </NavigationIndependentTree>
      </View>
    </View>
  );
}

// 内容区首屏:四 tab 层叠(保状态) + 底部播放条
// lx91:懒挂载——首访才渲染(冷启动只挂 Home,不再四 tab 同时开火 8+ 网络请求);访问后保持存活
function TabsHost({ tab, setTab }: { tab: number; setTab: (i: number) => void }) {
  const [visited, setVisited] = useState<number[]>([0]);
  useEffect(() => { setVisited(v => (v.includes(tab) ? v : [...v, tab])); }, [tab]);
  return (
    <View style={{ flex: 1 }}>
      <View style={st.tabStack} collapsable={false}>
        <View style={[st.tabHost, tab !== 0 && st.tabOff]}>{visited.includes(0) ? <HDHome onGotoSearch={() => setTab(2)} /> : null}</View>
        <View style={[st.tabHost, tab !== 1 && st.tabOff]}>{visited.includes(1) ? <HDPodcast /> : null}</View>
        <View style={[st.tabHost, tab !== 2 && st.tabOff]}>{visited.includes(2) ? <HDSearch /> : null}</View>
        <View style={[st.tabHost, tab !== 3 && st.tabOff]}>{visited.includes(3) ? <HDBoards /> : null}</View>
      </View>
      <HDPlayBar />
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

function PlItem({ name, count, add, onPress, onLongPress }: { name: string; count?: number; add?: boolean; onPress: () => void; onLongPress?: () => void }) {
  // 桌面版同构:单行(图标块 + 名字),计数折进后缀,保证文字与图标严格垂直居中
  return (
    <HDTouch style={st.plItem} focusStyle={st.navFocus} onPress={onPress} onLongPress={onLongPress}>
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
  const { faved } = useFav(current); // lx103:收藏态展示(操作走选歌单面板)
  const [collectOpen, setCollectOpen] = useState(false);
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

      {/* 中:控件 + 进度(两行同宽对齐——v1.1.6 修错位) */}
      <View style={st.pbCenter}>
        <View style={st.pbCtrls}>
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
        <View style={st.pbProgRow}>
          <Text style={st.pbTime}>{fmtSec(position)}</Text>
          <View style={st.pbTrack}>
            <View style={{ flex: pct, backgroundColor: C.brand, borderRadius: 2 }} />
            <View style={{ flex: 1 - pct, backgroundColor: C.track, borderRadius: 2 }} />
          </View>
          <Text style={st.pbTime}>{fmtSec(duration)}</Text>
        </View>
      </View>

      {/* 右:收藏(点按弹选歌单面板,对齐手机端) */}
      <View style={st.pbRight}>
        <HDTouch style={st.tool} focusStyle={st.toolFocus} onPress={() => current && setCollectOpen(true)}>
          <Icon name="heart" size={14} color={faved ? C.brand : C.text2} />
        </HDTouch>
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
      {collectOpen && current ? <HDCollect song={current} onClose={() => setCollectOpen(false)} /> : null}
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, flexDirection: 'row', backgroundColor: C.bg },
  sidebarWrap: { width: H.sidebar, backgroundColor: C.glass, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: C.border },
  // v1.1.9 web:侧栏常驻最顶层(内页卡片 marginLeft 让位,zIndex 保证转场时侧栏不被卡片盖住)
  sidebarWrapWeb: { position: 'relative', zIndex: 50, backgroundColor: C.bg, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: C.border },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 6, paddingBottom: 12 },
  logoMark: { width: 38, height: 41 },
  logoText: { color: C.onBrand, fontSize: 13, fontWeight: '800' },
  brandName: { color: C.text, fontSize: 15, fontWeight: '800' },
  settingsDock: { paddingHorizontal: 0, paddingVertical: 6 },
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
  // 中列:控件行与进度行同容器同宽对齐(v1.1.6 修错位——原 alignSelf:stretch+maxWidth 导致两行错切)
  pbCenter: { flex: 1, alignItems: 'center', gap: 4 },
  pbCtrls: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  pbProgRow: { flexDirection: 'row', alignItems: 'center', gap: 7, width: '100%', maxWidth: 460, justifyContent: 'center' },
  pbCoverTouch: { borderRadius: 9 },
  pbArt: { width: 40, height: 40, borderRadius: 9 },
  pbTitle: { color: C.text, fontSize: H.font.md, fontWeight: '600' },
  pbSub: { color: C.text2, fontSize: H.font.sm },
  tool: { width: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  toolFocus: { borderWidth: 2, borderColor: C.brand, borderRadius: 7 },
  playBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  playBtnFocus: { borderWidth: 2, borderColor: '#FFFFFF', borderRadius: 16 },
  pbTime: { color: C.text3, fontSize: 8, fontVariant: ['tabular-nums'], minWidth: 26 },
  pbTrack: { flex: 1, height: 3, borderRadius: 2, flexDirection: 'row' },
  pbRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  badge: { position: 'absolute', right: -3, bottom: -3, minWidth: 12, height: 12, borderRadius: 6, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  badgeText: { color: C.onBrand, fontSize: 7, fontWeight: '700' },
});
