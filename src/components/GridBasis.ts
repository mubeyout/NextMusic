// [审计P0·批B 1010] 网格列基自适应 hook——宽度自适应优先于形态硬切(老板令)
// 用法:const g = useGridBasis(); <View style={x.grid} onLayout={g.onLayout}>…cell style={[x.cell, { width: g.basis }]}
// 阈值默认档:≥1500→15%(6列)/≥1100→18%(5列)/≥800→23%(4列)/≥560→31%(3列)/其余→48%(2列)
import { useState, useCallback } from 'react';

export type BasisTier = [minWidth: number, basis: string];

export const DEFAULT_GRID_TIERS: BasisTier[] = [[1500, '15%'], [1100, '18%'], [800, '23%'], [560, '31%'], [0, '48%']];

export function useGridBasis(tiers: BasisTier[] = DEFAULT_GRID_TIERS) {
  const [basis, setBasis] = useState('31%'); // 首帧测量前的缺省(窄中窗即正确值)
  const onLayout = useCallback((e: { nativeEvent: { layout: { width: number } } }) => {
    const w = e.nativeEvent.layout.width;
    for (const [min, b] of tiers) {
      if (w >= min) {
        setBasis(prev => (prev === b ? prev : b));
        return;
      }
    }
  }, [tiers]);
  return { onLayout, basis };
}
