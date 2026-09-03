// react-native-gesture-handler web shim：桌面鼠标无需手势系统，RootView 透传 View
import React from 'react';

export function GestureHandlerRootView({ children, ...rest }: { children?: React.ReactNode } & Record<string, unknown>) {
  return <div {...(rest as object)} style={{ display: 'contents' }}>{children}</div>;
}
export default { GestureHandlerRootView };
