// HDGrid:桌面 minmax(min,1fr) 的 RN 等价 —— onLayout 实测容器宽算列数,
// 卡片严格等宽整行填满(修老板反馈的自适应差/尾行拉伸/行内张数不一)
import React, { useState } from 'react';
import { View } from 'react-native';

export function HDGrid({
  min = 124, gap = 12, maxCols = 9, minCols = 3, children,
}: {
  /** 单卡最小宽(dp);列数 = floor((容器宽+gap)/(min+gap)),再夹在 [minCols, maxCols] */
  min?: number; gap?: number; maxCols?: number; minCols?: number;
  children: React.ReactNode;
}) {
  const [w, setW] = useState(0);
  const cols = Math.max(minCols, Math.min(maxCols, Math.floor((w + gap) / (min + gap))));
  const itemW = w > 0 ? (w - (cols - 1) * gap) / cols : 0;
  return (
    <View
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}
      onLayout={e => setW(e.nativeEvent.layout.width)}
    >
      {itemW > 0
        ? React.Children.map(children, ch => (ch == null ? null : <View style={{ width: itemW }}>{ch}</View>))
        : null}
    </View>
  );
}
