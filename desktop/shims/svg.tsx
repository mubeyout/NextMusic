// react-native-svg web shim:SvgXml 直注 SVG 字符串;声明式组件(Svg/Path/...)映射为 SVG 原生标签
import React from 'react';

type XProps = { xml: string | null; width?: number | string; height?: number | string; size?: number; [k: string]: unknown };

export function SvgXml({ xml, width, height, size, style, ...rest }: XProps) {
  const w = size ?? width, h = size ?? height;
  if (!xml) return null;
  // 尺寸经 CSS 控制(svg 标签上的 width/height 属性会被样式覆盖)
  return (
    <span
      style={{ display: 'inline-flex', width: w == null ? undefined : (w as number), height: h == null ? undefined : (h as number), ...(style as object) }}
      {...(rest as object)}
      dangerouslySetInnerHTML={{ __html: xml }}
    />
  );
}

// 声明式子集(PlayerScreen 黑胶唱片用):Svg/Circle/Path/Defs/RadialGradient/Stop → SVG DOM 标签
const tag = (name: string) =>
  React.forwardRef<SVGElement, Record<string, unknown>>((props, _ref) => {
    const { children, ...rest } = props as { children?: React.ReactNode };
    return React.createElement(name, rest as never, children);
  });

export const Svg = tag('svg');
export const Circle = tag('circle');
export const Path = tag('path');
export const Defs = tag('defs');
export const RadialGradient = tag('radialGradient');
export const Stop = tag('stop');
export const LinearGradient = tag('linearGradient');
export const Rect = tag('rect');
export const G = tag('g');

export default { SvgXml, Svg, Circle, Path, Defs, RadialGradient, Stop, LinearGradient, Rect, G };
