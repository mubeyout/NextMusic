import { useEffect } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { IS_HD } from '../services/appversion';
import { layoutForWidth } from '../theme/design-system';

export function useResponsiveLayout() {
  const { width, height } = useWindowDimensions();
  const layout = layoutForWidth(width, IS_HD && Platform.OS !== 'web');
  useEffect(() => {
    if (Platform.OS === 'web') document.documentElement.style.setProperty('--nm-sidebar-width', String(layout.compact ? (layout.narrow ? 0 : 72) : layout.sidebar) + 'px');
  }, [layout.compact, layout.narrow, layout.sidebar]);
  return { ...layout, width, height };
}
