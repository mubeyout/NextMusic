// react-native-safe-area-context web shim：桌面窗口无刘海，insets 恒 0
import React, { createContext, useContext } from 'react';

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const Ctx = createContext(insets);

export function useSafeAreaInsets() { return insets; }
export function useSafeAreaFrame() { return { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight }; }
export function SafeAreaProvider({ children }: { children?: React.ReactNode }) {
  return <Ctx.Provider value={insets}>{children}</Ctx.Provider>;
}
export function useSafeArea() { return { insets, frame: { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight } }; }
export function SafeAreaView(props: Record<string, unknown>) {
  const { children, ...rest } = props as { children?: React.ReactNode };
  return <div {...(rest as object)}>{children}</div>;
}

// @react-navigation/elements 需要:SafeAreaInsetsContext(消费 insets)
export const SafeAreaInsetsContext = { Consumer: { _currentValue: insets, _threadCount: 0 } } as never;
export const SafeAreaFrameContext = { Consumer: { _currentValue: { x: 0, y: 0, width: 0, height: 0 }, _threadCount: 0 } } as never;

export const initialWindowMetrics = { insets, frame: { x: 0, y: 0, width: 0, height: 0 } };
export default { useSafeAreaInsets, useSafeAreaFrame, SafeAreaProvider, SafeAreaView, initialWindowMetrics };
