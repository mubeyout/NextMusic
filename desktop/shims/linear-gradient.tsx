// react-native-linear-gradient web shim:CSS linear-gradient 同 API
// v1.1.8:style 数组先 flatten(数组直展开成 {0:…} 数字键 → CSSStyleDeclaration[0] 崩=Queue/Route 黑屏根因);
// 外层用 DOM div(不能 RN View 包 DOM div——RNW 会把 div 当 RN child → React#130)
import React from 'react';
import { StyleSheet } from 'react-native';

type Props = {
  colors: [string, ...string[]];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  locations?: number[];
  style?: unknown;
  children?: React.ReactNode;
};

export function LinearGradient({ colors, start = { x: 0, y: 0 }, end = { x: 1, y: 1 }, style, children }: Props) {
  const dx = end.x - start.x, dy = end.y - start.y;
  const angle = Math.round((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360) % 360;
  const flat = StyleSheet.flatten(style as never) as Record<string, unknown> | undefined;
  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden', ...(flat as object) }}>
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(${angle}deg, ${colors.join(', ')})`, pointerEvents: 'none' }} />
      {children}
    </div>
  );
}
export default LinearGradient;
