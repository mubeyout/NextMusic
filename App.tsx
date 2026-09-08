import React, { useEffect } from 'react';
import { StatusBar, AppState as RNAppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
// 主题已在 theme/tokens.ts 模块加载期应用（早于一切组件/StyleSheet 创建）
import { T, C } from './src/theme/tokens';
import { AppStateProvider, useApp } from './src/state/AppState';
import { PlayerProvider, setupPlayer } from './src/state/PlayerProvider';
import { LxEngineHost, engine } from './src/lx-engine/engine';
import { loadSources } from './src/services/customSource';
import { initFx } from './src/services/soundfx';
import { RootNavigator } from './src/navigation';
import { DialogHost } from './src/components/Dialog';
import { IS_HD } from './src/services/appversion';
import { HDActionHost } from './src/hd/HDActions';
import { refetchAndBump } from './src/services/sync';
import { store as httpStore } from './src/services/server';

function App() {
  useEffect(() => {
    setupPlayer();
    // 均衡器与音效：启动即把持久化配置应用到原生 DSP（服务器同步在后台拉）
    initFx();
    // WebView 就绪后重载已启用的自定义音源脚本
    engine.setActiveSources(loadSources());
    // lx163:回前台全量拉服务器快照并广播——服务器/其他端操作过的增删改在本端即时落地(双向同步拉半边)
    const sub = RNAppState.addEventListener('change', s => {
      if (s === 'active' && httpStore.base && httpStore.token) refetchAndBump();
    });
    return () => sub.remove();
  }, []);

  return (
    // lx49:根容器恒定主题底色——navigation stack 的屏容器在 pop 销毁瞬间会
    // 露出 windowBackground(一加/浅色下露白一帧);GestureHandlerRootView 常驻不销毁,
    // 它的背景色就是最后一道盾
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.bg }}>
      <SafeAreaProvider>
        <StatusBar barStyle={T.light ? 'dark-content' : 'light-content'} />
        <AppStateProvider>
          <PlayerProvider>
            <LxEngineHost />
            <RootNavigator />
            {IS_HD ? <HDActionHost /> : null}
            <DialogHost />
          </PlayerProvider>
        </AppStateProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default App;
