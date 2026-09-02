// HDTouch:HD 全场景可聚焦触点(TV 遥控/车机旋钮 D-pad 友好)
// 关键:必须用 Pressable 而非 TouchableOpacity —— RN 0.87 的 TouchableOpacity 会把
// onFocus/onBlur 从 View props 里剥掉(backward-compat),Android TV 焦点环收不到事件(实测坑)
// Pressable 会把 focus/blur 事件原样挂到 View,BaseViewManager 原生派发 topFocus/topBlur。
//
// v4:焦点环自动贴附 —— 从元素自身样式读 borderRadius,环与元素同圆角(老板反馈「描边不贴附」);
//     可选 glow(聚焦时彩色弥散投影)与 focusBg(选中态背景提亮)。
import React, { useState } from 'react';
import { Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { C, TV_LOW_GPU } from './hdtokens';
type Props = React.ComponentProps<typeof Pressable> & {
  /** 聚焦时附加样式;不传 = 自动贴附环(元素圆角 + 2px 品牌描边);传 false = 无视觉 */
  focusStyle?: false | ViewStyle | ViewStyle[];
  /** 聚焦时背景提亮色(选中态);默认不动背景 */
  focusBg?: string;
  /** 聚焦时弥散投影(RN boxShadow 字符串,如 SH.brand);TV 低 GPU 自动忽略 */
  glow?: string;
  activeOpacity?: number;
};

export function HDTouch({ style, focusStyle, focusBg, glow, activeOpacity = 0.8, children, ...rest }: Props) {
  const [focus, setFocus] = useState(false);
  // 从元素样式提圆角:环贴附元素的形状(数组和对象样式都兼容)
  const flat = (StyleSheet.flatten(style as ViewStyle | ViewStyle[]) || {}) as { borderRadius?: number };
  const autoRing: ViewStyle = { borderWidth: 2, borderColor: C.brand, borderRadius: flat.borderRadius ?? 12 };
  return (
    <Pressable
      focusable
      {...rest}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      style={({ pressed }: { pressed: boolean }) => [
        style as ViewStyle | ViewStyle[] | undefined,
        pressed && { opacity: activeOpacity },
        focus && (focusStyle === undefined ? autoRing : focusStyle === false ? null : focusStyle),
        focus && focusBg != null && { backgroundColor: focusBg },
        focus && glow != null && !TV_LOW_GPU && { boxShadow: glow },
      ]}
    >
      {children}
    </Pressable>
  );
}
