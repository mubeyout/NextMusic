import React, { useEffect, useState } from 'react';
import { View, StyleSheet, BackHandler } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { navRef } from './navRef';
import { C } from './theme/tokens';
import { TabBar } from './components/TabBar';
import { MiniPlayer } from './components/MiniPlayer';
import { useApp } from './state/AppState';

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
import { RouteScreen } from './screens/RouteScreen';
import { PlayerSettingsScreen } from './screens/PlayerSettingsScreen';
import { CommentsScreen } from './screens/CommentsScreen';
import { PlaylistDetailScreen } from './screens/PlaylistDetailScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { SourcesScreen, AccountScreen } from './screens/SourcesAccountScreens';
import { BasicSettingsScreen, ThemeScreen, AboutScreen, DownloadsSettingsScreen, BackupSettingsScreen, VizSettingsScreen, ProxySettingsScreen } from './screens/SettingSubScreens';
import { ImportPlaylistScreen } from './screens/ImportPlaylistScreen';
import { FxScreen } from './screens/FxScreen';
import { MediaLibsScreen, ProviderBrowseRoute } from './screens/MediaLibsScreen';
import { DownloadsScreen } from './screens/DownloadsScreen';
import { DeviceMusicScreen } from './screens/DeviceMusicScreen';
import { SearchScreen } from './screens/SearchScreen';

const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: C.bg, card: C.bg, text: C.text, primary: C.brand, border: 'transparent' },
};

const Stack = createNativeStackNavigator();

// Manual tab host to mirror Figma layout exactly: content + MiniPlayer + TabBar
function MainTabs() {
  const [tab, setTab] = useState(0);
  return (
    <View style={st.main}>
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
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (navRef.current?.canGoBack()) {
        navRef.current.goBack();
        return true;
      }
      return false; // at stack root: default behavior (exit)
    });
    return () => sub.remove();
  }, []);

  return (
    <NavigationContainer ref={navRef} theme={navTheme}>
      <Stack.Navigator initialRouteName={initial} screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="Boot" component={BootScreen} />
        <Stack.Screen name="Server" component={ServerScreen} />
        <Stack.Screen name="Auth" component={AuthScreen} />
        <Stack.Screen name="AuthLogin" component={AuthLoginScreen} />
        <Stack.Screen name="AuthSignup" component={AuthSignupScreen} />
        <Stack.Screen name="Main" component={MainTabs} />
        <Stack.Screen name="Player" component={PlayerScreen} options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="Queue" component={QueueScreen} options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="Route" component={RouteScreen} options={{ animation: 'none' }} />
        <Stack.Screen name="PlayerSettings" component={PlayerSettingsScreen} />
        <Stack.Screen name="Comments" component={CommentsScreen} />
        <Stack.Screen name="PlaylistDetail" component={PlaylistDetailScreen} />
        <Stack.Screen name="Search" component={SearchScreen} options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="Sources" component={SourcesScreen} />
        <Stack.Screen name="Account" component={AccountScreen} />
        <Stack.Screen name="BasicSettings" component={BasicSettingsScreen} />
        <Stack.Screen name="Theme" component={ThemeScreen} />
        <Stack.Screen name="DownloadsSettings" component={DownloadsSettingsScreen} />
        <Stack.Screen name="BackupSettings" component={BackupSettingsScreen} />
        <Stack.Screen name="VizSettings" component={VizSettingsScreen} />
        <Stack.Screen name="ProxySettings" component={ProxySettingsScreen} />
        <Stack.Screen name="About" component={AboutScreen} />
        <Stack.Screen name="ImportPlaylist" component={ImportPlaylistScreen} />
        <Stack.Screen name="Fx" component={FxScreen} />
        <Stack.Screen name="MediaLibs" component={MediaLibsScreen} />
        <Stack.Screen name="ProviderBrowse" component={ProviderBrowseRoute} />
        <Stack.Screen name="Downloads" component={DownloadsScreen} />
        <Stack.Screen name="DeviceMusic" component={DeviceMusicScreen} />
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
