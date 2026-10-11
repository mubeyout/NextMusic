// 唱片盘体(共享)——landing draft-2 规格的 SVG 复刻
// 设计源:NextMusic-design/landing/draft-2.html .vinyl/.disc(行 136-152)
//   盘底 radial:#171717 → #0e0e0e 60% → #191919 95% → #060606 100%
//   细胶纹:白 5% alpha,0.9px 刻痕/3.1px 节距(≈40+ 圈,程序化循环生成)
//   宽纹带:黑 22% alpha,1.2px/36px 节距
//   盘缘内描边:白 6% 1px inset 环
//   外阴影(0 24px 70px 黑 55%)属容器层,由调用方 View 施加
// 裁量点(给 LEO 验收裁):保留一道低幅偏心 sheen(白 4%→0)随盘旋转——
//   纯对称纹理(胶纹圈)旋转无感知,去掉 sheen 后转动不可见
// v3.37(老板 1011 换盘):盘心换款——黑盘身+灰过渡环+银盘心+小轴孔(参考图:黑外圈/灰中环/银心),
//   盘心不再贴封面(浅色封面「盘面发白」问题根除);几何仍单源,勿在调用方手写
// v3.38(老板 1011 二稿):盘心改「镂空窗口展示封面」——灰环做框,封面正圆裁切嵌入窗口;
//   无封面时回退银 label;轴孔改银色(参考图:central silver spindle hole)
// 双端几何单一真源:phone 端经本组件(react-native-svg);
//   HD/web 端因 RNW+svg shim React#130 历史坑直出 DOM(HDPlayer 内),
//   但半径序列/渐变规格一律取 vinylDiscSpec/VINYL_SPEC,勿在调用方手写胶纹
import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, Image as SvgImage, RadialGradient, Stop } from 'react-native-svg';

/** draft-2 .disc 三层渐变的参数化(两端共用,单源) */
export const VINYL_SPEC = {
  baseStops: [
    { offset: '0', color: '#171717' },
    { offset: '0.6', color: '#0e0e0e' },
    { offset: '0.95', color: '#191919' },
    { offset: '1', color: '#060606' },
  ],
  fine: { stroke: '#FFFFFF', opacity: 0.05, width: 0.9, pitch: 3.1 }, // 细胶纹(白5% 0.9px/3.1px)
  wide: { stroke: '#000000', opacity: 0.22, width: 1.2, pitch: 36 }, // 宽纹带(黑22% 1.2px/36px)
  rim: { stroke: '#FFFFFF', opacity: 0.06, width: 1, inset: 1 }, // 盘缘内描边(inset 1px 环)
  /** 换款盘心(老板 1011 参考图):黑外圈+灰中环+银盘心+小轴孔 */
  leadRing: { fill: '#8E9297', rr: 68 / 150, stroke: '#00000055' }, // 灰过渡环(外径=盘径 45%)
  label: {
    silverStops: [
      { offset: '0', color: '#EDEFF2' },
      { offset: '0.72', color: '#C9CDD2' },
      { offset: '1', color: '#AEB3B9' },
    ],
    rr: 54 / 150, // 银盘心半径比(盘径 36%,经典黑胶 label 比例邻域)
    stroke: '#00000040',
  },
  hole: { rr: 6 / 150, fill: '#C9CDD2', stroke: '#00000066' }, // 小轴孔(v3.38 银色,参考图 central silver spindle hole)
  sheen: {
    // 偏心低幅 sheen:白 4%→0;cx/cy/r 用百分比(RN-SVG 与 DOM 语义一致)
    cx: '36%', cy: '30%', r: '95%',
    stops: [
      { offset: '0', opacity: 0.04 },
      { offset: '0.5', opacity: 0.015 },
      { offset: '1', opacity: 0 },
    ],
  },
} as const;

/** repeating-radial 的 Circle 等价:纹带 [0,width) 起,每 pitch 重复;止于盘缘描边带内侧 */
function ringRadii(radius: number, width: number, pitch: number): number[] {
  const out: number[] = [];
  const limit = radius - VINYL_SPEC.rim.inset - width / 2;
  for (let r = width / 2; r <= limit; r += pitch) out.push(r);
  return out;
}

export interface VinylDiscSpec {
  size: number;
  center: number;
  radius: number;
  /** 细胶纹半径序列(size=270 → 43 圈) */
  fineGrooves: number[];
  /** 宽纹带半径序列(size=270 → 4 道) */
  wideBands: number[];
  /** 盘缘内描边环半径 */
  rimR: number;
  /** 灰过渡环半径(换款盘心外圈) */
  leadR: number;
  /** 银盘心半径 */
  labelR: number;
  /** 小轴孔半径 */
  holeR: number;
}

/** 按 size 生成盘体几何(双端同源:phone 组件与 HD/web DOM 版都吃这份) */
export function vinylDiscSpec(size: number): VinylDiscSpec {
  const radius = size / 2;
  return {
    size,
    center: radius,
    radius,
    fineGrooves: ringRadii(radius, VINYL_SPEC.fine.width, VINYL_SPEC.fine.pitch),
    wideBands: ringRadii(radius, VINYL_SPEC.wide.width, VINYL_SPEC.wide.pitch),
    rimR: radius - VINYL_SPEC.rim.inset + VINYL_SPEC.rim.width / 2,
    leadR: radius * VINYL_SPEC.leadRing.rr,
    labelR: radius * VINYL_SPEC.label.rr,
    holeR: radius * VINYL_SPEC.hole.rr,
  };
}

/**
 * draft-2 唱片盘体。children = 盘心封面槽(位置/裁切由调用方传入,本组件只管盘体)。
 * 旋转机制也归调用方:phone=外层 Animated rotate,HD/web=nm-vinyl-spin CSS。
 */
export function VinylDisc({ size, img, children, gradientId = 'vd', sheen = true }: {
  size: number;
  /** 盘心封面(v3.38 镂空窗口):传入则正圆裁切嵌进灰环窗口;缺省回退银 label */
  img?: string;
  children?: React.ReactNode;
  /** 同屏多实例时的渐变 id 前缀(默认单实例够用) */
  gradientId?: string;
  /** 偏心 sheen 开关(验收裁撤用) */
  sheen?: boolean;
}) {
  const spec = vinylDiscSpec(size);
  const { center: c, radius: R } = spec;
  const baseId = `${gradientId}Base`;
  const sheenId = `${gradientId}Sheen`;
  const silverId = `${gradientId}Silver`;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={baseId} cx="50%" cy="50%" r="50%">
            {VINYL_SPEC.baseStops.map((s, i) => (
              <Stop key={i} offset={s.offset} stopColor={s.color} />
            ))}
          </RadialGradient>
          {sheen ? (
            <RadialGradient id={sheenId} cx={VINYL_SPEC.sheen.cx} cy={VINYL_SPEC.sheen.cy} r={VINYL_SPEC.sheen.r}>
              {VINYL_SPEC.sheen.stops.map((s, i) => (
                <Stop key={i} offset={s.offset} stopColor="#FFFFFF" stopOpacity={String(s.opacity)} />
              ))}
            </RadialGradient>
          ) : null}
          {/* 换款银盘心渐变(v3.37;v3.38 起为无封面回退态) */}
          <RadialGradient id={silverId} cx="50%" cy="42%" r="62%">
            {VINYL_SPEC.label.silverStops.map((s, i) => (
              <Stop key={i} offset={s.offset} stopColor={s.color} />
            ))}
          </RadialGradient>
          {img ? (
            <ClipPath id={`${gradientId}Win`}>
              <Circle cx={c} cy={c} r={VINYL_SPEC.label.rr * size / 2} />
            </ClipPath>
          ) : null}
        </Defs>
        {/* 盘底 */}
        <Circle cx={c} cy={c} r={R} fill={`url(#${baseId})`} />
        {/* 细胶纹(程序化循环) */}
        {spec.fineGrooves.map((r, i) => (
          <Circle key={`f${i}`} cx={c} cy={c} r={r} fill="none"
            stroke={VINYL_SPEC.fine.stroke} strokeOpacity={VINYL_SPEC.fine.opacity} strokeWidth={VINYL_SPEC.fine.width} />
        ))}
        {/* 宽纹带 */}
        {spec.wideBands.map((r, i) => (
          <Circle key={`w${i}`} cx={c} cy={c} r={r} fill="none"
            stroke={VINYL_SPEC.wide.stroke} strokeOpacity={VINYL_SPEC.wide.opacity} strokeWidth={VINYL_SPEC.wide.width} />
        ))}
        {/* 盘缘内描边 */}
        <Circle cx={c} cy={c} r={spec.rimR} fill="none"
          stroke={VINYL_SPEC.rim.stroke} strokeOpacity={VINYL_SPEC.rim.opacity} strokeWidth={VINYL_SPEC.rim.width} />
        {/* 换款盘心(v3.38 二稿):灰过渡环做框→镂空窗口嵌封面(无图回退银 label)→银色小轴孔 */}
        <Circle cx={c} cy={c} r={spec.leadR} fill={VINYL_SPEC.leadRing.fill}
          stroke={VINYL_SPEC.leadRing.stroke} strokeWidth={1} />
        {img ? (
          <SvgImage href={img} x={c - spec.labelR} y={c - spec.labelR}
            width={spec.labelR * 2} height={spec.labelR * 2}
            preserveAspectRatio="xMidYMid slice" clipPath={`url(#${gradientId}Win)`} />
        ) : (
          <Circle cx={c} cy={c} r={spec.labelR} fill={`url(#${silverId})`}
            stroke={VINYL_SPEC.label.stroke} strokeWidth={1} />
        )}
        {img ? <Circle cx={c} cy={c} r={spec.labelR} fill="none"
          stroke={VINYL_SPEC.label.stroke} strokeWidth={1} /> : null}
        <Circle cx={c} cy={c} r={spec.holeR} fill={VINYL_SPEC.hole.fill}
          stroke={VINYL_SPEC.hole.stroke} strokeWidth={1} />
        {/* 偏心 sheen(裁量保留,让旋转可见) */}
        {sheen ? <Circle cx={c} cy={c} r={R} fill={`url(#${sheenId})`} /> : null}
      </Svg>
      {children}
    </View>
  );
}
