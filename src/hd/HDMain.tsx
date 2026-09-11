// HD(车机/TV)主壳 —— 对齐桌面版:左侧 174dp 侧栏(发现/我的乐库/歌单 三组)
// + 内容区(层叠保状态) + 底部 64dp 桌面式播放条
// 业务层(播放引擎/音源/媒体库)全复用 phone 版,仅 UI 形态不同
import React, { useEffect, useReducer, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, Platform } from 'react-native';
const IS_WEB = Platform.OS === 'web';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../theme/Icon';
import { C, H, SH, fmtSec } from './hdtokens';
import { HDTouch } from './HDTouch';
import { usePlayer } from '../state/PlayerProvider';
import { useApp } from '../state/AppState';
import { library } from '../state/library';
import { playlistSync } from '../state/playlistSync'; // lx163
import { toast } from '../components/Dialog';
import { hdActions } from './HDActions';
import { getRecents } from '../state/recent';
import { sync, lxToApp , subscribeSync , isPlatformList } from '../services/sync';
import { hdNav, hdInnerRef } from './hdnav';
import { useFav } from '../state/useFav';
import { HDCollect } from './HDCollect';
import { NavigationContainer, DefaultTheme, StackActions, NavigationIndependentTree } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HDHome } from './HDHome';
import { HDSearch } from './HDSearch';
import { HDBoards } from './HDBoards';
import { HDDiscover } from './HDDiscover';
import { HDPodcast } from './HDPodcast';
// lx84:内容区嵌套栈内页(侧栏恒固定,内页只在右侧切换;TV 设置族走根栈,v1.2.5 起 web 也内页化)
import { HDPlayer } from './HDPlayer';
import { HDPlaylistDetailScreen } from './HDPlaylistDetail';
import { HDAuthLoginScreen } from './HDAuthLogin';
import { QueueScreen } from '../screens/QueueScreen';
import { CommentsScreen } from '../screens/CommentsScreen';
import { PlayerSettingsScreen } from '../screens/PlayerSettingsScreen';
import { ImportPlaylistScreen } from '../screens/ImportPlaylistScreen';
import { FxScreen } from '../screens/FxScreen';
import { MediaLibsScreen, ProviderBrowseRoute } from '../screens/MediaLibsScreen';
import { ArtistFavScreen } from '../screens/ArtistFavScreen'; // lx161:收藏歌手
import { ArtistDetailScreen } from '../screens/ArtistDetailScreen';
import { AlbumFavScreen } from '../screens/AlbumFavScreen'; // v1.2.9 桌面:收藏专辑入口
import { MyFavoritesScreen } from '../screens/MyFavoritesScreen'; // lx165:我的收藏合并页
import { AlbumDetailScreen } from '../screens/AlbumDetailScreen';
import { ProviderEditScreen } from '../screens/ProviderEditScreen';
import { ProviderDetailScreen } from '../screens/ProviderDetailScreen';
import { DownloadsScreen } from '../screens/DownloadsScreen';
import { BoardsSquareScreen } from '../screens/BoardsSquareScreen';
import { DeviceMusicScreen } from '../screens/DeviceMusicScreen';
import { SearchScreen } from '../screens/SearchScreen';
import { RoutePage } from '../screens/RouteScreen';
import { SourcesScreen, AccountScreen } from '../screens/SourcesAccountScreens';
import { AuthSignupScreen } from '../screens/AuthSignupScreen';
// v1.2.5 桌面:设置族内页化——侧栏恒固定,设置也在内容区加载(老板);TV 仍走根栈全屏(lx84 定夺不变)
import { HDSettingsScreen } from './HDSettings';
import { BasicSettingsScreen, ThemeScreen, AboutScreen, DownloadsSettingsScreen, BackupSettingsScreen } from '../screens/SettingSubScreens';
import { ManualScreen, DeployGuideScreen, FaqScreen, ChangelogScreen } from '../screens/HelpScreens';
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
// lx127:内容区→播放条 焦点桥(不可见 2px,滚到内容底部后 DOWN 直达播放条;老板:D-pad 只有绕侧栏底部才能进)
let pbBridgeHandle: number | null = null;
const pbBridgeSubs = new Set<() => void>();
export function FocusBridge({ active }: { active?: boolean }) {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick(n => n + 1); pbBridgeSubs.add(f); return () => { pbBridgeSubs.delete(f); }; }, []);
  if (!active || pbBridgeHandle == null) return null;
  return (
    <HDTouch style={{ height: 2, marginTop: 4 }} focusStyle={false} onPress={() => {}} nextFocusDown={pbBridgeHandle} />
  );
}

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

// v1.2.7 桌面(老板:全面核查统一,更适配桌面规范):phone 桥接屏缩放适配层——
// HD 屏 token=桌面px×0.75,phone 屏是原生 px;v1.2.6 缩放源修正后并排密度差一截(设置子页字体特大)。
// 全部桥接 phone 屏(队列/评论/Fx/媒体库族/下载/榜单广场/搜索/设置族/账号族)包 0.75 缩放,与 HD 屏密度统一;
// TV/原生侧原样返回组件,零 diff。Route(投屏弹层)除外——absolute 弹层定位不适用 transform 缩放
export const withPhoneScale = (Cmp: React.ComponentType<Record<string, unknown>>) => {
  if (!IS_WEB) return Cmp;
  // web: CSS zoom 替代 transform scale——zoom 参与布局,ScrollView 尺寸/滚轮坐标自动适配
  // (transform 0.75 下 RNW ScrollView 计算布局尺寸按未缩放值,底部内容不可达=裁切,老板实测)
  const W = (props: Record<string, unknown>) => (
    <div style={{ width: '100%', height: '100%', zoom: 0.75, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Cmp {...props} />
    </div>
  );
  W.displayName = 'PhoneScale';
  return W;
};

// v1.2.5 桌面平台探测(win/linux 品牌行顶入轨道,mac 轨道留给红绿灯)
const NM_PLAT = IS_WEB ? String((globalThis as unknown as { nmDesktop?: { platform?: string } }).nmDesktop?.platform || '') : '';
const NM_MAC = NM_PLAT === 'darwin';
const HAS_DESKTOP_BRIDGE = !!NM_PLAT; // 空串=纯浏览器(服务端部署),Electron web=平台字符串

export function HDMain() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<number>(0);
  const [pls, setPls] = useState<{ key: string; localId?: string; name: string; count: number; songs: SongItem[] }[]>([]);
  const [loveCount, setLoveCount] = useState<number | null>(null); // lx67:侧栏"我喜欢的"数量统计
  const { connected, token } = useApp();

  // 歌单列表(本地+同步)与"我喜欢的"计数——lx91 单次拉取;lx104:缓存秒出+我喜欢的去重+离线收藏合并
  const [syncTick, setSyncTick] = useState(0);
  useEffect(() => subscribeSync(() => setSyncTick(t => t + 1)), []); // lx117:服务器快照变更重拉(删除/移除后侧栏不再复活)
  // lx162(老板):本地歌单删/改名后侧栏立即消失——library 变更信号进列表 effect 依赖
  const [, libTick] = useReducer((x: number) => x + 1, 0);
  useEffect(() => library.subscribe(() => libTick()), []);
  // lx163f(TV 卡顿):本地变更(libTick)只重算本地段,不再触发 MB 级缓存读+网络拉取;
  // 服务器信号(connected/token/syncTick)才走完整链路。之前每次收藏/歌单操作都全量拉→弱芯片 D-pad 卡顿
  const mainTrig = useRef({ connected: null as boolean | null, token: null as string | null, syncTick: -1 });
  useEffect(() => {
    const serverDirty = mainTrig.current.connected !== connected || mainTrig.current.token !== token || mainTrig.current.syncTick !== syncTick;
    mainTrig.current = { connected, token, syncTick };
    // lx104:本地「我喜欢的」由专用入口展示,歌单组里去重(老板:快捷收藏合并)
    const local = library.all()
      .filter(p => p.name !== '我喜欢的')
      .map(p => ({ key: p.id, localId: p.id, name: p.name, count: p.songs.length, songs: p.songs as SongItem[] }));
    const localNames = new Set(local.map(x => x.name));
    // 本地段重算:保留 prev 里的服务器段(名字去重),本地副本优先
    setPls(prev => [...local, ...prev.filter(x => !x.localId && !localNames.has(x.name))]);
    if (!serverDirty || !connected || !token) return;
    // ↓ 仅服务器信号变化才走:缓存先行 + 网络拉取
    const cached = sync.cachedLists();
    if (cached) {
      setLoveCount((cached.loveList || []).length);
      setPls(prev => {
        const has = new Set(prev.map(x => x.key));
        return [...prev.filter(x => x.localId), ...(cached.userList || []).filter(u => !has.has(u.id)).map(u => ({
          key: u.id, name: u.name, count: (u.list || []).length, songs: (u.list || []).map(lxToApp),
        }))];
      });
    }
    // lx122:mergeLocalLove 已移除——其 additions 推原始 SongItem(无 id 字段)入 loveList,
    // 服务器收下后 remoteIds 永远匹配不上→每轮再推→指数复制(实锤:1188 条中 1187 条无 id)
    sync.fetchLists().then(s => {
      if (!s) return;
      setLoveCount((s.loveList || []).length);
      const serverPls = (s.userList || []).map(u => ({
        key: u.id, name: u.name,
        count: (u.list || []).length,
        songs: (u.list || []).map(lxToApp),
      }));
      setPls([...local, ...serverPls.filter(u => !localNames.has(u.name))]);
    }).catch(() => {});
  }, [connected, token, syncTick, libTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // lx101:歌单管理(长按)——本机 library 重命名/删除;同步歌单 fetch+push 服务器 userList
  const managePl = (pl: { localId?: string; key: string; name: string; count: number; songs?: SongItem[] }) => {
    if (!pl.localId && isPlatformList(pl.key)) {
      hdActions.menu(`管理「${pl.name}」`, [
        { label: '重命名歌单', icon: 'edit', onPress: () => {
          hdActions.prompt('重命名歌单', { defaultValue: pl.name, onSubmit: async (v: string) => {
            if (!v || v === pl.name) return;
            toast((await sync.renameUserList(pl.key, v)) ? '已重命名' : '服务器操作失败');
          } });
        } },
        { label: '删除歌单', icon: 'trash', danger: true, onPress: async () => {
          toast((await sync.removeUserList(pl.key)) ? '已删除' : '服务器操作失败');
        } },
        { label: '复制为可编辑本地副本', icon: 'add', onPress: () => { library.create(pl.name, pl.songs || []); toast(`已创建本地副本「${pl.name}」`); } },
      ]);
      return;
    }
    hdActions.menu(`管理「${pl.name}」`, [
      { label: '重命名歌单', icon: 'edit', onPress: () => {
        hdActions.prompt('重命名歌单', {
          defaultValue: pl.name,
          onSubmit: async (v) => {
            if (!v || v === pl.name) return;
            if (pl.localId) { void playlistSync.rename(pl.localId, v).then(() => toast('已重命名')); } // lx163:镜像服务器
            else if (connected && token) {
              const ok = await sync.renameUserList(pl.key, v);
              toast(ok ? '已重命名' : '服务器操作失败');
            }
          },
        });
      } },
      { label: '删除歌单', icon: 'trash', danger: true, onPress: async () => {
        if (pl.localId) { void playlistSync.remove(pl.localId).then(() => toast('已删除')); } // lx163:镜像服务器
        else if (connected && token) toast((await sync.removeUserList(pl.key)) ? '已删除' : '服务器操作失败');
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
        {IS_WEB ? (
          /* v1.2.5 桌面(老板:brand 在导航占太高):品牌行独立于滚动区——
           * win/linux 负 margin 顶入 36px 顶部轨道(轨道透明,整行仍是拖拽面,品牌不可点无副作用);
           * mac 轨道留给红绿灯,品牌行紧在轨道下方 */
          <View style={(NM_MAC || !HAS_DESKTOP_BRIDGE) ? st.brandRowMac : st.brandRowRail}>
            <Image source={require('../assets/brand/mark.png')} style={NM_MAC ? st.logoMarkMac : st.logoMarkRail} />
            <View style={{ flex: 1 }}>
              <Text style={st.brandNameWeb}>Next<Text style={{ color: C.brand }}>Music</Text></Text>
            </View>
          </View>
        ) : null}
        <ScrollView
          style={{ flex: 1, backgroundColor: C.bg }}
          contentContainerStyle={{ paddingTop: IS_WEB ? 4 : 8, paddingBottom: 10, gap: 2 }}
          showsVerticalScrollIndicator={false}
        >
          {!IS_WEB ? (
            <View style={st.brandRow}>
              <Image source={require('../assets/brand/mark.png')} style={st.logoMark} />
              <View style={{ flex: 1 }}>
                <Text style={st.brandName}>Next<Text style={{ color: C.brand }}>Music</Text></Text>
              </View>
            </View>
          ) : null}

          {/* 发现 */}
          <Group label="发现" />
          {TABS.map((t, i) => (
            <NavItem key={t.key} icon={t.icon} label={t.label} active={tab === i} first={i === 0}
              onPress={() => { setTab(i); hdInnerPop(); }} />
          ))}

          {/* 歌单广场(v2 对齐):发现族入口 */}
          <NavItem icon="explore" label="歌单广场" onPress={() => railNav('Discover')} />

          {/* 我的乐库 */}
          <Group label="我的乐库" top={8} />
          <NavItem icon="server" label="媒体库" onPress={() => railNav('MediaLibs')} />
          {/* lx165(老板):我喜欢的+收藏歌手+收藏专辑 三入口并一——内页三 tab,行内 ♥ 即管理 */}
          <HDTouch style={st.navItem} focusStyle={st.navFocus} hoverBg={IS_WEB ? C.hover : false} onPress={() => railNav('MyFavorites')}>
            <Icon name="heart" size={16} color={C.text2} />
            <Text style={st.navLabel} numberOfLines={1}>我的收藏{loveCount != null ? ` · ${loveCount}` : ''}</Text>
          </HDTouch>
          <NavItem icon="history" label="播放历史" onPress={openHistory} />

          {/* 歌单 */}
          <Group label="歌单" top={8} />
          {pls.slice(0, 5).map(pl => (
            <PlItem key={pl.key} name={pl.name} count={pl.count} onPress={() => openPl(pl)} onLongPress={() => managePl(pl)} />
          ))}
          <PlItem name="新建歌单" add onPress={() => hdActions.menu('新建歌单', [
              { label: '空白歌单', icon: 'add', onPress: () => {
                hdActions.prompt('新建歌单', { defaultValue: '', onSubmit: (v) => { const n = (v || '').trim(); if (n) { library.create(n); toast('已创建'); } } });
              } },
              { label: '导入平台歌单', icon: 'download', onPress: () => railNav('ImportPlaylist') },
            ])} />
        </ScrollView>
        {/* lx85:设置项不贴底——留出焦点环完整显示空间(老板:太靠底被裁切) */}
        {/* v1.2.5:web 设置也走 railNav(内页化,侧栏恒固定);TV 保持原 navigate——零行为差异 */}
        <View style={st.settingsDock}>
          <NavItem icon="settings" label="设置" onPress={() => (IS_WEB ? railNav('Settings') : hdNav()?.navigate('Settings'))} />
          {IS_WEB ? (
            <NavItem icon="server" label="后台管理" onPress={() => { window.open('/admin/', '_blank'); }} />
          ) : null}
        </View>
      </View>

      {/* ===== 内容区(lx84:嵌套栈——内页只在此切换,侧栏恒固定) ===== */}
      <View style={st.body}>
        <NavigationIndependentTree>
        <NavigationContainer ref={hdInnerRef} theme={hdInnerTheme}>
          {/* 坞108:TV 转场必须直切;坞57:fade 有变亮中间态 */}
          <InnerStack.Navigator screenOptions={{ headerShown: false, animation: 'none', contentStyle: { backgroundColor: C.bg }, freezeOnBlur: true }}>
            <InnerStack.Screen name="Tabs">{() => <TabsHost tab={tab} setTab={setTab} />}</InnerStack.Screen>
            <InnerStack.Screen name="Player" component={HDPlayer} />
            <InnerStack.Screen name="Queue" component={withPhoneScale(QueueScreen)} />
            <InnerStack.Screen name="Route" component={RoutePage} options={{ presentation: 'transparentModal' }} />
            <InnerStack.Screen name="Comments" component={withPhoneScale(CommentsScreen)} />
            <InnerStack.Screen name="PlaylistDetail" component={HDPlaylistDetailScreen} />
            <InnerStack.Screen name="Search" component={withPhoneScale(SearchScreen)} />
            <InnerStack.Screen name="PlayerSettings" component={withPhoneScale(PlayerSettingsScreen)} />
            <InnerStack.Screen name="ImportPlaylist" component={withPhoneScale(ImportPlaylistScreen)} />
            <InnerStack.Screen name="Fx" component={withPhoneScale(FxScreen)} />
            <InnerStack.Screen name="MediaLibs" component={withPhoneScale(MediaLibsScreen)} />
            <InnerStack.Screen name="ArtistFavs" component={withPhoneScale(ArtistFavScreen)} />
            <InnerStack.Screen name="AlbumFavs" component={withPhoneScale(AlbumFavScreen)} />
            <InnerStack.Screen name="MyFavorites" component={withPhoneScale(MyFavoritesScreen)} />
            <InnerStack.Screen name="ArtistDetail" component={withPhoneScale(ArtistDetailScreen)} />
            <InnerStack.Screen name="AlbumDetail" component={withPhoneScale(AlbumDetailScreen)} />
            <InnerStack.Screen name="ProviderEdit" component={withPhoneScale(ProviderEditScreen)} />
            <InnerStack.Screen name="ProviderBrowse" component={withPhoneScale(ProviderBrowseRoute)} />
            <InnerStack.Screen name="ProviderDetail" component={withPhoneScale(ProviderDetailScreen)} />
            <InnerStack.Screen name="Downloads" component={withPhoneScale(DownloadsScreen)} />
            <InnerStack.Screen name="BoardsSquare" component={withPhoneScale(BoardsSquareScreen)} />
            <InnerStack.Screen name="Discover" component={HDDiscover} />
            <InnerStack.Screen name="DeviceMusic" component={withPhoneScale(DeviceMusicScreen)} />
            <InnerStack.Screen name="Sources" component={withPhoneScale(SourcesScreen)} />
            <InnerStack.Screen name="Account" component={withPhoneScale(AccountScreen)} />
            {/* v1.2.5 桌面:设置族内页化(老板:设置也作为内页加载,左边导航固定);TV 不注册,仍走根栈全屏 */}
            {IS_WEB ? (
              <>
                <InnerStack.Screen name="Settings" component={HDSettingsScreen} />
                <InnerStack.Screen name="BasicSettings" component={withPhoneScale(BasicSettingsScreen)} />
                <InnerStack.Screen name="Theme" component={withPhoneScale(ThemeScreen)} />
                <InnerStack.Screen name="About" component={withPhoneScale(AboutScreen)} />
                <InnerStack.Screen name="Manual" component={withPhoneScale(ManualScreen)} />
                <InnerStack.Screen name="DeployGuide" component={withPhoneScale(DeployGuideScreen)} />
                <InnerStack.Screen name="Faq" component={withPhoneScale(FaqScreen)} />
                <InnerStack.Screen name="Changelog" component={withPhoneScale(ChangelogScreen)} />
                <InnerStack.Screen name="BackupSettings" component={withPhoneScale(BackupSettingsScreen)} />
                <InnerStack.Screen name="DownloadsSettings" component={withPhoneScale(DownloadsSettingsScreen)} />
              </>
            ) : null}
            <InnerStack.Screen name="AuthLogin" component={HDAuthLoginScreen} />
            <InnerStack.Screen name="AuthSignup" component={withPhoneScale(AuthSignupScreen)} />
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
  const [pbCollect, setPbCollect] = useState<import('../services/server').SongItem | null>(null); // lx148:播放条收藏面板(全屏层)
  useEffect(() => { setVisited(v => (v.includes(tab) ? v : [...v, tab])); }, [tab]);
  return (
    <View style={{ flex: 1 }}>
      <View style={st.tabStack} collapsable={false}>
        <View style={[st.tabHost, tab !== 0 && st.tabOff]}>{visited.includes(0) ? <HDHome onGotoSearch={() => setTab(2)} /> : null}</View>
        <View style={[st.tabHost, tab !== 1 && st.tabOff]}>{visited.includes(1) ? <HDPodcast /> : null}</View>
        <View style={[st.tabHost, tab !== 2 && st.tabOff]}>{visited.includes(2) ? <HDSearch /> : null}</View>
        <View style={[st.tabHost, tab !== 3 && st.tabOff]}>{visited.includes(3) ? <HDBoards /> : null}</View>
      </View>
      <HDPlayBar onCollect={setPbCollect} />
      {pbCollect ? <View style={{ position: 'absolute', top: 0, bottom: 0, left: -H.sidebar, right: 0, zIndex: 999 }}><HDCollect song={pbCollect} onClose={() => setPbCollect(null)} /></View> : null}
    </View>
  );
}

function Group({ label, top = 4 }: { label: string; top?: number }) {
  return <Text style={[st.group, { marginTop: top + 5 }, IS_WEB && { paddingHorizontal: 18 }]}>{label}</Text>;
}

function NavItem({ icon, label, active, first, onPress }: { icon: string; label: string; active?: boolean; first?: boolean; onPress: () => void }) {
  return (
    <HDTouch style={[st.navItem, active && st.navItemOn]} focusStyle={st.navFocus} hoverBg={IS_WEB && !active ? C.hover : false} hasTVPreferredFocus={first}
      onPress={onPress}>
      <Icon name={icon as never} size={16} color={active ? C.text : C.text2} />
      <Text style={[st.navLabel, active && { fontWeight: '700', color: C.text }]} numberOfLines={1}>{label}</Text>
    </HDTouch>
  );
}

function PlItem({ name, count, add, onPress, onLongPress }: { name: string; count?: number; add?: boolean; onPress: () => void; onLongPress?: () => void }) {
  // 桌面版同构:单行(图标块 + 名字),计数折进后缀,保证文字与图标严格垂直居中
  return (
    <HDTouch style={st.plItem} focusStyle={st.navFocus} hoverBg={IS_WEB ? C.hover : false} onPress={onPress} onLongPress={onLongPress}>
      {add
        ? <View style={st.plAddChip}><Icon name="add" size={12} color={C.text3} /></View>
        : <View style={st.plChip}><Icon name="music" size={10} color={C.text3} /></View>}
      <Text style={st.plName} numberOfLines={1}>{name}{count != null ? ` · ${count}` : ''}</Text>
    </HDTouch>
  );
}

// 桌面式播放条:左(封面+曲目+收藏) 中(控件+进度) 右(队列/投屏/详情)
function HDPlayBar({ onCollect }: { onCollect?: (s: import('../services/server').SongItem) => void }) {
  const { current, playing, position, duration, toggle, skipNext, skipPrev, queue, shuffle, repeat, setShuffle, cycleRepeat } = usePlayer();
  const { faved } = useFav(current); // lx103:收藏态展示(操作走选歌单面板)
  const pct = duration > 0 ? Math.min(1, position / duration) : 0;

  return (
    <View style={st.playbar}>
      {/* 左 */}
      <View style={st.pbLeft}>
        <HDTouch style={st.pbCoverTouch} focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 9 }} hoverBg={IS_WEB ? C.hover : false} onPress={() => hdNav()?.navigate('Player')}>
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
          <HDTouch style={st.tool} focusStyle={st.toolFocus} hoverBg={IS_WEB ? C.hover : false} onPress={() => setShuffle(!shuffle)}>
            <Icon name="shuffle" size={13} active={shuffle} color={shuffle ? C.brand : C.text2} />
          </HDTouch>
          <HDTouch style={st.tool} focusStyle={st.toolFocus} hoverBg={IS_WEB ? C.hover : false} onPress={skipPrev}>
            <Icon name="previous" size={15} color={C.text} />
          </HDTouch>
          <HDTouch style={st.playBtn} focusStyle={st.playBtnFocus} glow={SH.brand} onPress={toggle}
            onLayout={e => { const h = (e.nativeEvent as unknown as { target: number }).target; if (h && h !== pbBridgeHandle) { pbBridgeHandle = h; pbBridgeSubs.forEach(f => f()); } }}>
            <Icon name={playing ? 'pause' : 'play'} size={15} color={C.onBrand} />
          </HDTouch>
          <HDTouch style={st.tool} focusStyle={st.toolFocus} hoverBg={IS_WEB ? C.hover : false} onPress={skipNext}>
            <Icon name="next" size={15} color={C.text} />
          </HDTouch>
          <HDTouch style={st.tool} focusStyle={st.toolFocus} hoverBg={IS_WEB ? C.hover : false} onPress={cycleRepeat}>
            <Icon name="repeat" size={13} active={repeat !== 'off'} color={repeat !== 'off' ? C.brand : C.text2} />
            {repeat === 'one' ? <Text style={st.toolRepOne}>1</Text> : null}
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
        <HDTouch style={st.tool} focusStyle={st.toolFocus} hoverBg={IS_WEB ? C.hover : false} onPress={() => current && onCollect?.(current)}>
          <Icon name="heart" size={14} color={faved ? C.brand : C.text2} />
        </HDTouch>
        <HDTouch style={st.tool} focusStyle={st.toolFocus} hoverBg={IS_WEB ? C.hover : false} onPress={() => hdNav()?.navigate('Queue')}>
          <Icon name="queue" size={14} color={C.text2} />
          {queue.length ? <View style={st.badge}><Text style={st.badgeText}>{queue.length > 99 ? '99' : queue.length}</Text></View> : null}
        </HDTouch>
        <HDTouch style={st.tool} focusStyle={st.toolFocus} hoverBg={IS_WEB ? C.hover : false} onPress={() => hdNav()?.navigate('Route')}>
          <Icon name="devices" size={14} color={C.text2} />
        </HDTouch>
        <HDTouch style={st.tool} focusStyle={st.toolFocus} hoverBg={IS_WEB ? C.hover : false} onPress={() => hdNav()?.navigate('Player')}>
          <Icon name="fullscreen" size={14} color={C.text2} />
        </HDTouch>
      </View>
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
  // v1.2.5 桌面品牌行(老板:brand 在导航占太高)——win/linux 顶入 36px 轨道,mac 在轨道下方紧凑行;
  // 自带底色:负 margin 顶出 Main 卡的区域透出的是 body 底色,浅色主题下会拼出深条
  brandRowRail: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 36, marginTop: -36, marginHorizontal: 8, paddingHorizontal: 10, marginBottom: 2, backgroundColor: C.bg },
  brandRowMac: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 40, marginHorizontal: 8, paddingHorizontal: 10, backgroundColor: C.bg },
  logoMarkRail: { width: 16, height: 17.5 }, // 槽位=nav icon 16px,文字起点与导航严格对齐(老板:logo 后没对齐)
  logoMarkMac: { width: 18, height: 19.75 }, // mac 轨道区稍大,仍对齐 nav 槽
  brandNameWeb: { color: C.text, fontSize: 13.5, fontWeight: '800', letterSpacing: 0.2 },
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
  toolRepOne: { position: 'absolute', right: -1, top: -1, color: C.brand, fontSize: 8, fontWeight: '800' },
  playBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  playBtnFocus: { borderWidth: 2, borderColor: '#FFFFFF', borderRadius: 16 },
  pbTime: { color: C.text3, fontSize: 8, fontVariant: ['tabular-nums'], minWidth: 26 },
  pbTrack: { flex: 1, height: 3, borderRadius: 2, flexDirection: 'row' },
  pbRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  badge: { position: 'absolute', right: -3, bottom: -3, minWidth: 12, height: 12, borderRadius: 6, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  badgeText: { color: C.onBrand, fontSize: 7, fontWeight: '700' },
});
