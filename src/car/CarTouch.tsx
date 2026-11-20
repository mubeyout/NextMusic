// CarTouch.tsx —— [D-pad 焦点系统 1107·车机规范+老板令 1120 内描边] 车机旋钮/遥控焦点必须有视觉反馈;
// 内描边铁律:描边几何常驻预留(透明),聚焦只换色——零布局位移、内容零跳动;
// 自带 borderWidth 的宿主(卡片类)沿用其宽度,聚焦只染 brand 色。
import React, { useState } from 'react';
import { Pressable, StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import { C } from '../theme/tokens';

export function CarTouch({ style, focusedStyle, onPress, disabled, children, ...tv }: {
  style?: StyleProp<ViewStyle>;
  focusedStyle?: StyleProp<ViewStyle>;  // 宿主自定义焦点态(默认 brandDim 底+brand 染边,宽度不变)
  onPress?: () => void;
  disabled?: boolean;
  children?: React.ReactNode;
  [tvProp: string]: unknown;  // TV/车机专属 props(如 hasTVPreferredFocus)原样透传
}) {
  const [foc, setFoc] = useState(false);
  const flat = (StyleSheet.flatten(style) || {}) as { borderWidth?: number };
  // [老板令 1120] 常驻透明描边:无自带边的元素预留 2px(与默认焦点色宽一致);自带边的不动几何只留色槽
  const reserve: ViewStyle | null = flat.borderWidth != null ? null : { borderWidth: 2, borderColor: 'transparent' };
  return (
    <Pressable
      focusable={!disabled}
      onPress={onPress}
      onFocus={() => setFoc(true)}
      onBlur={() => setFoc(false)}
      style={({ pressed }) => [style, reserve, foc && (focusedStyle ?? st.foc), pressed && { opacity: 0.85 }]}
      {...tv}>
      {children}
    </Pressable>
  );
}

const st = {
  // 默认焦点态[1120 内描边]:brand 染边+brandDim 底;不含 borderWidth(几何由 reserve 常驻或宿主自带)——零位移
  foc: { backgroundColor: C.brandDim, borderColor: C.brand } as ViewStyle,
};

// hasTVPreferredFocus 兼容垫片:TV/车机环境首焦(非 TV no-op)
export const tvFirst = { hasTVPreferredFocus: true } as unknown as object;
export const __keepView = View; // 防 tree-shake 误删
