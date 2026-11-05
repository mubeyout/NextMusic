import React from 'react';
import { ResponsiveGrid as HDGrid } from './ResponsiveGrid';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { SPACE } from '../theme/design-system';

/** All platforms size media cards from the available container width. */
export function GridWall({ children, phoneGap = SPACE.md }: { children: React.ReactNode; phoneGap?: number }) {
  const layout = useResponsiveLayout();
  return <HDGrid min={layout.cardMin} gap={layout.narrow ? phoneGap : SPACE.md}>{children}</HDGrid>;
}
