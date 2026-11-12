// HDMain.tsx —— [APK 三版合一 WebView 壳 1112 老板令]
// HD/TV 形态弃原生大屏 UI(174 侧栏家族退役,git 史可考),改 react-native-webview 离线壳
// 直载 assets/web/index.html(NextMusic-HD-Web dist 单文件自包含,HD 1:1 还原版)。
// 壳实现/注入/返回桥见 WebShell;本文件保留 withPhoneScale/FocusBridge/usePbFocusTarget
// 导出(navigation/HD 子页仍引用,防 tsc 断链)——焦点桥句柄随原生播放条退役恒 null=空渲染。
import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { HDTouch } from './HDTouch';
import { WebShell } from '../web/WebShell';

const IS_WEB = Platform.OS === 'web';

// lx127:内容区→播放条 焦点桥(原生 HD UI 退役后无人置句柄,恒 null;保留导出防子页 import 断)
let pbBridgeHandle: number | null = null;
const pbBridgeSubs = new Set<() => void>();
export function usePbFocusTarget(): number | null {
  const [h, setH] = useState(pbBridgeHandle);
  useEffect(() => { const f = () => setH(pbBridgeHandle); pbBridgeSubs.add(f); return () => { pbBridgeSubs.delete(f); }; }, []);
  return h;
}
export function FocusBridge({ active }: { active?: boolean }) {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick(n => n + 1); pbBridgeSubs.add(f); return () => { pbBridgeSubs.delete(f); }; }, []);
  if (!active || pbBridgeHandle == null) return null;
  return (
    <HDTouch style={{ height: 8, marginTop: 4 }} focusStyle={false} onPress={() => {}} nextFocusDown={pbBridgeHandle} />
  );
}

// v1.2.7 phone 桥接屏缩放适配(web 桌面恒 CSS zoom 0.75;原生侧原样返回)——按组件缓存防重挂
const phoneScaleCache = new Map<React.ComponentType<Record<string, unknown>>, React.ComponentType<Record<string, unknown>>>();
export const withPhoneScale = (Cmp: React.ComponentType<Record<string, unknown>>) => {
  if (!IS_WEB) return Cmp;
  const hit = phoneScaleCache.get(Cmp);
  if (hit) return hit;
  const W = (props: Record<string, unknown>) => (
    <div style={{ width: '100%', height: '100%', zoom: 0.75, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Cmp {...props} />
    </div>
  );
  W.displayName = 'PhoneScale';
  phoneScaleCache.set(Cmp, W);
  return W;
};

export function HDMain() {
  return <WebShell entry="index.html" />;
}
