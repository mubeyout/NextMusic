import React, { useEffect, useRef, useState } from 'react';
import { Platform, View, StyleSheet, BackHandler, Animated, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { navRef } from './navRef';
import { hdInnerRef } from './hd/hdnav';
import { hdActions } from './hd/HDActions';
import { toast } from './components/Dialog';
import { C } from './theme/tokens';
import { TabBar } from './components/TabBar';
import { MiniPlayer } from './components/MiniPlayer';
import { useApp } from './state/AppState';
import { settings } from './services/settings';

import { BootScreen } from './screens/BootScreen';
import { ServerScreen } from './screens/ServerScreen';
import { AuthScreen } from './screens/AuthScreen';
import { AuthLoginScreen } from './screens/AuthLoginScreen';
import { AuthSignupScreen } from './screens/AuthSignupScreen';
import { HomeScreen } from './screens/HomeScreen';
import { ExploreScreen } from './screens/ExploreScreen';
import { MyScreen } from './screens/MyScreen';
import { PlayerScreen } from './screens/PlayerScreen';
import { QueueScreen } from './screens/QueueScreen';
import { PlayerSettingsScreen } from './screens/PlayerSettingsScreen';
import { CommentsScreen } from './screens/CommentsScreen';
import { PlaylistDetailScreen } from './screens/PlaylistDetailScreen';
import { HDPlaylistDetailScreen } from './hd/HDPlaylistDetail';
import { SettingsScreen } from './screens/SettingsScreen';
import { HDSettingsScreen } from './hd/HDSettings';
import { SourcesScreen, AccountScreen } from './screens/SourcesAccountScreens';
import { BasicSettingsScreen, ThemeScreen, AboutScreen, DownloadsSettingsScreen, BackupSettingsScreen } from './screens/SettingSubScreens';
import { ManualScreen, DeployGuideScreen, FaqScreen, ChangelogScreen } from './screens/HelpScreens';
import { ImportPlaylistScreen } from './screens/ImportPlaylistScreen';
import { FxScreen } from './screens/FxScreen';
import { ProviderEditScreen } from './screens/ProviderEditScreen';
import { MediaLibsScreen, ProviderBrowseRoute } from './screens/MediaLibsScreen';
import { ProviderDetailScreen } from './screens/ProviderDetailScreen';
import { DownloadsScreen } from './screens/DownloadsScreen';
import { BoardsSquareScreen } from './screens/BoardsSquareScreen';
import { DeviceMusicScreen } from './screens/DeviceMusicScreen';
import { SearchScreen } from './screens/SearchScreen';
import { ArtistDetailScreen } from './screens/ArtistDetailScreen';
import { AlbumDetailScreen } from './screens/AlbumDetailScreen';
import { RoutePage } from './screens/RouteScreen';
import { IS_HD } from './services/appversion';
import { HDMain } from './hd/HDMain';
import { HDPlayerSafe } from './hd/HDPlayer';
import { HDBootScreen } from './hd/HDBootScreen';
import { withPhoneScale } from './hd/HDMain';
import { HDAuthLoginScreen } from './hd/HDAuthLogin';

const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: C.bg, card: C.bg, text: C.text, primary: C.brand, border: 'transparent' },
};

const Stack = createNativeStackNavigator();

// Manual tab host to mirror Figma layout exactly: content + MiniPlayer + TabBar
function MainTabs() {
  // 启动页设置（基本设置 → 启动页面）：冷启动初始 tab
  const sp = settings.get().startupPage;
  const [tab, setTab] = useState(sp === 'explore' ? 1 : sp === 'my' ? 2 : 0);
  return (
    <View style={[st.main, { backgroundColor: C.bg }]}>
      {/* tabStack 占流式空间，三个 tab 内容在其内部绝对层叠（防 display:none 闪屏），
          MiniPlayer/TabBar 恢复流式排在下方 —— tab 栏回到底部 */}
      <View style={st.tabStack} collapsable={false}>
        <View style={[st.tabHost, tab !== 0 && st.tabOff]}><HomeScreen visible={tab === 0} /></View>
        <View style={[st.tabHost, tab !== 1 && st.tabOff]}><ExploreScreen /></View>
        <View style={[st.tabHost, tab !== 2 && st.tabOff]}><MyScreen visible={tab === 2} /></View>
      </View>
      <MiniPlayer />
      <TabBarManual tab={tab} setTab={setTab} />
    </View>
  );
}

function TabBarManual({ tab, setTab }: { tab: number; setTab: (i: number) => void }) {
  return (
    <TabBar
      state={{ index: tab, routes: [{ name: 'Home', key: 'h' }, { name: 'Explore', key: 'e' }, { name: 'My', key: 'm' }] }}
      navigation={{ emit: () => ({ defaultPrevented: false }), navigate: (n: string) => setTab(n === 'Home' ? 0 : n === 'Explore' ? 1 : 2) }}
    />
  );
}

export function RootNavigator() {
  const { mode } = useApp();
  // 服务端 web 播放器不需要启动向导:直进主界面(本地模式);原生端保留三卡引导
  const initial = !mode ? (Platform.OS === 'web' ? 'Main' : 'Boot') : 'Main';

  // [Gate 2026-09-14] 音源接口未登录 401 → 跳登录页(服务器音源登录门,不静默空屏)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    const goLogin = () => {
      const nav = navRef.current as unknown as { getCurrentRoute?: () => { name?: string }; navigate?: (n: string) => void } | null;
      if (nav?.getCurrentRoute?.()?.name !== 'AuthLogin') nav?.navigate?.('AuthLogin');
    };
    window.addEventListener('nm-auth-required', goLogin);
    return () => window.removeEventListener('nm-auth-required', goLogin);
  }, []);

  // Android hardware back fallback: pop the stack instead of letting the OS
  // send the whole task to background (observed on LG V40 / RN 0.87 New Arch).
  useEffect(() => {
    let exitArmed = false;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      // lx84:HD 嵌套内容栈优先出栈(内页在内容区,根栈底就是 Main)
      if (hdInnerRef.isReady() && hdInnerRef.canGoBack()) {
        hdInnerRef.goBack();
        return true;
      }
      if (navRef.current?.canGoBack()) {
        navRef.current.goBack();
        return true;
      }
      // lx144(老板):根页再按返回——二次确认退出,防误触
      if (exitArmed) return false; // 确认后放行系统默认(退出)
      exitArmed = true;
      setTimeout(() => { exitArmed = false; }, 2600);
      if (IS_HD) {
        hdActions.menu('退出应用', [
          { label: '取消', icon: 'close' },
          { label: '退出', icon: 'back', danger: true, onPress: () => BackHandler.exitApp() }, // lx159:退出用 back(箭头离场),不再与取消重复 close
        ]);
      } else {
        toast('再按一次返回键退出');
      }
      return true; // 拦截本次,不退出
    });
    return () => sub.remove();
  }, []);

  // v1.1.9 桌面侧栏常驻:内页 contentStyle 让位左侧 174px 侧栏(native-stack 官方 option,web/原生都识别;原生端 {} 空对象无影响)
// v1.2.7 桌面:phone 桥接屏缩放适配(启动流 Server/Auth 两屏)——与 HDMain.withPhoneScale 同则;
// phone 原生侧原样返回
const withPhoneScale = (Cmp: React.ComponentType<Record<string, unknown>>) => {
  if (Platform.OS !== 'web') return Cmp;
  const W = (props: Record<string, unknown>) => (
    <View style={{ flex: 1, transform: [{ scale: 0.75 }], transformOrigin: 'top left', width: '133.3334%', height: '133.3334%' }}>
      <Cmp {...props} />
    </View>
  );
  W.displayName = 'PhoneScale';
  return W;
};

const SIDEBAR_LOCK_CONTENT: { marginLeft?: number; backgroundColor?: string } = Platform.OS === 'web' ? { marginLeft: 174 } : {};

// v1.2.15(老板 09-14"进出页面还闪")转场终版：容器恒直切(lx57 一加实测 fade 两页半透明叠加"变亮一下"31→66→35、slide 露底窗口闪白，容器级转场两种预设都不可救)；
// 动效改内容层——新页 18px 滑入+淡入 220ms cubic-out，不透明底上零中间态=物理无闪(MiniPlayer lx168① 同款已验证模式)。
// 仅 phone 原生；TV/HD 直切家族不动(坑108)；web 桌面自有动效体系。返回(pop)仍直切——快且无闪。
const PAGE_ENTER_MS = 220, PAGE_ENTER_DX = 18;
const enterMemo = new Map<unknown, unknown>();
function withEnter<P extends object>(Cmp: React.ComponentType<P>): React.ComponentType<P> {
  if (IS_HD || Platform.OS === 'web') return Cmp;
  const hit = enterMemo.get(Cmp) as React.ComponentType<P> | undefined;
  if (hit) return hit;
  const W = (props: P) => {
    const x = useRef(new Animated.Value(PAGE_ENTER_DX)).current;
    const o = useRef(new Animated.Value(0)).current;
    useEffect(() => {
      Animated.parallel([
        Animated.timing(x, { toValue: 0, duration: PAGE_ENTER_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(o, { toValue: 1, duration: PAGE_ENTER_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    }, [x, o]);
    return (
      <Animated.View style={{ flex: 1, opacity: o, transform: [{ translateX: x }] }}>
        <Cmp {...props} />
        {/* 常驻 mini 条(老板 2026-09-18:内页也显示,不再只在主 tab;Player 页不包避免双条) */}
        <MiniPlayer standalone />
      </Animated.View>
    );
  };
  W.displayName = `Enter(${Cmp.displayName || Cmp.name || 'Screen'})`;
  enterMemo.set(Cmp, W);
  return W;
}
return (
    <NavigationContainer ref={navRef} theme={navTheme}>
      {/* 坑108:slide_from_right 在 TV(米电视)上转场后原生焦点链断裂——D-pad 全死但 touch 正常;HD 恒直切 */}
      {/* lx57:fade 两页半透明叠加固有"变亮一下"(一加实测 31→66→35);slide 滑动露底窗口闪白——容器转场两种预设都不可救,恒 none 直切零中间态 */}
      {/* v1.2.15(老板 09-14"进出还闪一下"):lx168 的 fade 160ms 即本轮闪感回归点,容器回到直切;动效改内容层 withEnter 入场动画 */}
      <Stack.Navigator initialRouteName={initial} screenOptions={{ headerShown: false, animation: 'none', contentStyle: { backgroundColor: C.bg }, freezeOnBlur: true }}>
        <Stack.Screen name="Boot" component={IS_HD ? HDBootScreen : BootScreen} />
        <Stack.Screen name="Server" component={withPhoneScale(ServerScreen)} />
        <Stack.Screen name="Auth" component={withPhoneScale(AuthScreen)} />
        <Stack.Screen name="AuthLogin" component={IS_HD ? HDAuthLoginScreen : withEnter(AuthLoginScreen)} />
        <Stack.Screen name="AuthSignup" component={withEnter(AuthSignupScreen)} />
        <Stack.Screen name="Main" component={IS_HD ? HDMain : MainTabs} />
        <Stack.Screen name="Player" component={IS_HD ? HDPlayerSafe : PlayerScreen} options={{ contentStyle: SIDEBAR_LOCK_CONTENT, animation: 'none' }} />
        <Stack.Screen name="Queue" component={withEnter(QueueScreen)} options={{ contentStyle: SIDEBAR_LOCK_CONTENT, animation: 'none' }} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="PlayerSettings" component={withEnter(PlayerSettingsScreen)} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="Comments" component={withEnter(CommentsScreen)} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="PlaylistDetail" component={IS_HD ? HDPlaylistDetailScreen : withEnter(PlaylistDetailScreen)} />
        <Stack.Screen name="Search" component={withEnter(SearchScreen)} options={{ contentStyle: SIDEBAR_LOCK_CONTENT, animation: 'none' }} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="ArtistDetail" component={withEnter(ArtistDetailScreen)} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="AlbumDetail" component={withEnter(AlbumDetailScreen)} />
        {/* Route(播放设备)页:HD 已删投屏不再注册(老板 09-14);phone 由 MiniPlayer 入口进入 */}
        {!IS_HD ? <Stack.Screen name="Route" component={RoutePage} options={{ contentStyle: SIDEBAR_LOCK_CONTENT, animation: 'fade', presentation: 'transparentModal' }} /> : null}
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="Settings" component={IS_HD ? HDSettingsScreen : withEnter(SettingsScreen)} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="Sources" component={withEnter(SourcesScreen)} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="Account" component={withEnter(AccountScreen)} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="BasicSettings" component={withEnter(BasicSettingsScreen)} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="Theme" component={withEnter(ThemeScreen)} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="DownloadsSettings" component={withEnter(DownloadsSettingsScreen)} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="BackupSettings" component={withEnter(BackupSettingsScreen)} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="About" component={withEnter(AboutScreen)} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="Manual" component={withEnter(ManualScreen)} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="DeployGuide" component={withEnter(DeployGuideScreen)} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="Faq" component={withEnter(FaqScreen)} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="Changelog" component={withEnter(ChangelogScreen)} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="ImportPlaylist" component={withEnter(ImportPlaylistScreen)} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="Fx" component={withEnter(FxScreen)} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="MediaLibs" component={withEnter(MediaLibsScreen)} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="ProviderEdit" component={withEnter(ProviderEditScreen)} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="ProviderBrowse" component={withEnter(ProviderBrowseRoute)} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="ProviderDetail" component={withEnter(ProviderDetailScreen)} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="Downloads" component={withEnter(DownloadsScreen)} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="BoardsSquare" component={withEnter(BoardsSquareScreen)} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="DeviceMusic" component={withEnter(DeviceMusicScreen)} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const st = StyleSheet.create({
  main: { flex: 1 },
  tabStack: { flex: 1 },
  // 三个 tab 内容层叠：绝对定位互不挤压，隐藏层 opacity 0 保留状态（免 display:none 重排闪屏）
  tabHost: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  tabOff: { opacity: 0, pointerEvents: 'none', elevation: 0 },
});
