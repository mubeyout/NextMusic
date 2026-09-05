// HDTouch:HD 全场景可聚焦触点(TV 遥控/车机旋钮 D-pad 友好)
// 关键:必须用 Pressable 而非 TouchableOpacity —— RN 0.87 的 TouchableOpacity 会把
// onFocus/onBlur 从 View props 里剥掉(backward-compat),Android TV 焦点环收不到事件(实测坑)
// Pressable 会把 focus/blur 事件原样挂到 View,BaseViewManager 原生派发 topFocus/topBlur。
//
// v4:焦点环自动贴附 —— 从元素自身样式读 borderRadius,环与元素同圆角(老板反馈「描边不贴附」);
//     可选 glow(聚焦时彩色弥散投影)与 focusBg(选中态背景提亮)。
import React, { useState } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { C, TV_LOW_GPU } from './hdtokens';
type Props = React.ComponentProps<typeof Pressable> & {
  /** 聚焦时附加样式;不传 = 自动贴附环(元素圆角 + 2px 品牌描边);传 false = 无视觉 */
  focusStyle?: false | ViewStyle | ViewStyle[];
  /** 聚焦时背景提亮色(选中态);默认不动背景 */
  focusBg?: string;
  /** 聚焦时弥散投影(RN boxShadow 字符串,如 SH.brand);TV 低 GPU 自动忽略 */
  glow?: string;
  /** lx87:聚焦放大悬浮(TV 卡片标准交互)——transform scale 不占布局+投影抬升;如 1.06 */
  zoom?: number;
  activeOpacity?: number;
};

export function HDTouch({ style, focusStyle, focusBg, glow, zoom, activeOpacity = 0.8, children, ...rest }: Props) {
  const [focus, setFocus] = useState(false);
  const flat = (StyleSheet.flatten(style as ViewStyle | ViewStyle[]) || {}) as { borderRadius?: number };
  // v6(lx75b): border 环(米电视渲染稳定) + padding 负补偿抵消 border 占位——环外扩 2px 描边,内容零位移
  // v5 overlay 在米电视 Pressable 内不渲染(同 overflow 裁剪家族 bug),废弃
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
        focus && focusStyle !== false && { margin: -2 }, // border 占 2px 布局,margin -2 外缩抵消——总占位不变,描边画在原边界,内容不动
        zoom != null && { transform: [{ scale: focus ? zoom : 1 }] }, // lx87:卡片聚焦放大悬浮
        focus && zoom != null && !TV_LOW_GPU && { boxShadow: '0 16px 32px rgba(0,0,0,.55)' }, // 悬浮投影抬升(低 GPU 忽略)
        focus && focusBg != null && { backgroundColor: focusBg },
        focus && glow != null && !TV_LOW_GPU && { boxShadow: glow },
      ]}
    >
      {children}
    </Pressable>
  );
}
