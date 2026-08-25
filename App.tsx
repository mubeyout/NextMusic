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
import { initFx } from './src/services/soundfx';
import { RootNavigator } from './src/navigation';
import { DialogHost } from './src/components/Dialog';

function App() {
  useEffect(() => {
    setupPlayer();
    // 均衡器与音效：启动即把持久化配置应用到原生 DSP（服务器同步在后台拉）
    initFx();
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
            <DialogHost />
          </PlayerProvider>
        </AppStateProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default App;
