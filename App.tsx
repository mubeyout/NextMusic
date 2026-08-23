import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
// 主题 token 覆写必须最先执行（accent / 纯黑背景）
import { applyThemeTokens } from './src/services/settings';
applyThemeTokens();
import { AppStateProvider, useApp } from './src/state/AppState';
import { PlayerProvider, setupPlayer } from './src/state/PlayerProvider';
import { LxEngineHost, engine } from './src/lx-engine/engine';
import { loadSources } from './src/services/customSource';
import { RootNavigator } from './src/navigation';

function App() {
  useEffect(() => {
    setupPlayer();
    // WebView 就绪后重载已启用的自定义音源脚本
    engine.setActiveSources(loadSources());
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" />
        <AppStateProvider>
          <PlayerProvider>
            <LxEngineHost />
            <RootNavigator />
          </PlayerProvider>
        </AppStateProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default App;
