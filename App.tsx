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
import { DropdownHost } from './src/components/DropdownMenu';
import { IS_HD, isCarUi } from './src/services/appversion';
import { useSettings, settings } from './src/services/settings';
import { HDActionHost } from './src/hd/HDActions';
import { refetchAndBump } from './src/services/sync';
import { store as httpStore } from './src/services/server';
import { dialog } from './src/components/Dialog';
import { onCarAudio } from './src/services/audioroute';

let carAskDone = false; // 同一次车载连接只问一次;断开重置
function App() {
  useEffect(() => {
    // [carlink v2] 连上车载蓝牙且未开车机模式 → 弹确认一键切 HD 大屏 UI(hd 包不需要)
    if (!IS_HD) {
      const sub = onCarAudio(connected => {
        if (!connected) { carAskDone = false; return; }
        if (carAskDone || settings.get().carModeUi === true) return;
        carAskDone = true;
        dialog.confirm('已连接车机', '检测到车载蓝牙音频，切换到车机模式（大屏界面）？',
          () => settings.set('carModeUi', true), '切换');
      });
      return () => sub?.remove();
    }
  }, []);
  useEffect(() => {
    setupPlayer();
    // 均衡器与音效：启动即把持久化配置应用到原生 DSP（服务器同步在后台拉）
    initFx();
    // WebView 就绪后重载已启用的自定义音源脚本
    engine.setActiveSources(loadSources());
    // lx163:回前台全量拉服务器快照并广播——服务器/其他端操作过的增删改在本端即时落地(双向同步拉半边)
    let lastBump = 0;
    const sub = RNAppState.addEventListener('change', s => {
      if (s === 'active' && httpStore.base && httpStore.token && Date.now() - lastBump > 30000) { lastBump = Date.now(); refetchAndBump(); }
    });
    return () => sub.remove();
  }, []);

  useSettings(); // carlink:carModeUi 变更即重渲
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
            {isCarUi() ? <HDActionHost /> : null} {/* carlink:车机模式共享 HDActionHost */}
            <DialogHost />
            <DropdownHost />
          </PlayerProvider>
        </AppStateProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default App;
