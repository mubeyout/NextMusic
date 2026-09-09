import React, { useEffect, useState } from 'react';
import { Platform, View, StyleSheet, BackHandler } from 'react-native';
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
import { HDPlayer } from './hd/HDPlayer';
import { HDBootScreen } from './hd/HDBootScreen';
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
  const initial = !mode ? 'Boot' : 'Main';

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
return (
    <NavigationContainer ref={navRef} theme={navTheme}>
      {/* 坑108:slide_from_right 在 TV(米电视)上转场后原生焦点链断裂——D-pad 全死但 touch 正常;HD 恒用 fade */}
      {/* lx57:转场最终方案 none(直切)——lx49 fade 后一加实测仍有"变亮一下"(两页半透明叠加的固有特性,31→66→35);直切零中间态,物理上无闪。速度感也更快 */}
      <Stack.Navigator initialRouteName={initial} screenOptions={{ headerShown: false, animation: 'none', contentStyle: { backgroundColor: C.bg }, freezeOnBlur: true }}>
        <Stack.Screen name="Boot" component={IS_HD ? HDBootScreen : BootScreen} />
        <Stack.Screen name="Server" component={withPhoneScale(ServerScreen)} />
        <Stack.Screen name="Auth" component={withPhoneScale(AuthScreen)} />
        <Stack.Screen name="AuthLogin" component={IS_HD ? HDAuthLoginScreen : AuthLoginScreen} />
        <Stack.Screen name="AuthSignup" component={AuthSignupScreen} />
        <Stack.Screen name="Main" component={IS_HD ? HDMain : MainTabs} />
        <Stack.Screen name="Player" component={IS_HD ? HDPlayer : PlayerScreen} options={{ contentStyle: SIDEBAR_LOCK_CONTENT, animation: 'none' }} />
        <Stack.Screen name="Queue" component={QueueScreen} options={{ contentStyle: SIDEBAR_LOCK_CONTENT, animation: 'none' }} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="PlayerSettings" component={PlayerSettingsScreen} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="Comments" component={CommentsScreen} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="PlaylistDetail" component={IS_HD ? HDPlaylistDetailScreen : PlaylistDetailScreen} />
        <Stack.Screen name="Search" component={SearchScreen} options={{ contentStyle: SIDEBAR_LOCK_CONTENT, animation: 'none' }} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="ArtistDetail" component={ArtistDetailScreen} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="AlbumDetail" component={AlbumDetailScreen} />
        <Stack.Screen name="Route" component={RoutePage} options={{ contentStyle: SIDEBAR_LOCK_CONTENT, animation: 'none', presentation: 'transparentModal' }} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="Settings" component={IS_HD ? HDSettingsScreen : SettingsScreen} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="Sources" component={SourcesScreen} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="Account" component={AccountScreen} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="BasicSettings" component={BasicSettingsScreen} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="Theme" component={ThemeScreen} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="DownloadsSettings" component={DownloadsSettingsScreen} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="BackupSettings" component={BackupSettingsScreen} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="About" component={AboutScreen} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="Manual" component={ManualScreen} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="DeployGuide" component={DeployGuideScreen} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="Faq" component={FaqScreen} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="Changelog" component={ChangelogScreen} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="ImportPlaylist" component={ImportPlaylistScreen} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="Fx" component={FxScreen} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="MediaLibs" component={MediaLibsScreen} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="ProviderEdit" component={ProviderEditScreen} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="ProviderBrowse" component={ProviderBrowseRoute} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="ProviderDetail" component={ProviderDetailScreen} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="Downloads" component={DownloadsScreen} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="BoardsSquare" component={BoardsSquareScreen} />
        <Stack.Screen options={{ contentStyle: SIDEBAR_LOCK_CONTENT }} name="DeviceMusic" component={DeviceMusicScreen} />
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
