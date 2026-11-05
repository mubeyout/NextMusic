import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { gridMetrics, SPACE } from '../theme/design-system';

export function ResponsiveGrid({ min = 160, gap = SPACE.md, maxCols = 8, minCols = 1, children, onCols }: {
  min?: number; gap?: number; maxCols?: number; minCols?: number;
  children: React.ReactNode; onCols?: (cols: number) => void;
}) {
  const [width, setWidth] = useState(0);
  const { cols, itemWidth } = gridMetrics(width, min, gap, maxCols, minCols);
  useEffect(() => { if (width > 0) onCols?.(cols); }, [cols, onCols, width]);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap, minWidth: 0 }}
      onLayout={e => setWidth(e.nativeEvent.layout.width)}>
      {itemWidth > 0 ? React.Children.map(children, child => child == null || typeof child === 'boolean' ? null : (
        <View style={{ width: itemWidth, minWidth: 0 }}>{child}</View>
      )) : null}
    </View>
  );
}
