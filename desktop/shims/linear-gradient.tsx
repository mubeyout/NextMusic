// react-native-linear-gradient web shim：CSS linear-gradient 同 API
import React from 'react';

type Props = {
  colors: [string, ...string[]];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  locations?: number[];
  style?: React.CSSProperties;
  children?: React.ReactNode;
};

export function LinearGradient({ colors, start = { x: 0, y: 0 }, end = { x: 1, y: 1 }, style, children }: Props) {
  const dx = end.x - start.x, dy = end.y - start.y;
  const angle = Math.round((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360) % 360;
  return (
    <div style={{ background: `linear-gradient(${angle}deg, ${colors.join(', ')})`, ...style }}>
      {children}
    </div>
  );
}
export default LinearGradient;
