// react-native-screens web shim：JS stack 下无需原生屏容器,Screen 退化为透传 View
import React from 'react';

export function enableScreens(_v?: boolean): void { /* no-op */ }
export function enableFreeze(_v?: boolean): void { /* no-op */ }
export function screensEnabled(): boolean { return false; }
export function shouldEnableEventEmitter(): boolean { return false; }

export const Screen: React.FC<Record<string, unknown> & { children?: React.ReactNode; active?: number | string }> = ({ children, ...rest }) => {
  const { active, ...divProps } = rest as { active?: number | string } & Record<string, unknown>;
  // active: 0/off/after_disappear → 隐藏（stack 保活语义近似）
  const off = active === 0 || active === 'off' || active === 'after_disappear';
  return <div {...divProps} style={{ display: off ? 'none' : undefined, ...((divProps.style as object) || {}) }}>{children}</div>;
};

export default { enableScreens, screensEnabled, Screen };
