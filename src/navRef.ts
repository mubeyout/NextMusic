import { createNavigationContainerRef } from '@react-navigation/native';

// Shared nav ref (usable outside React tree, e.g. PlayerProvider play-fail prompt)
export const navRef = createNavigationContainerRef<ReactNavigation.RootParamList>();

// 桌面验证钩子(不影响生产行为):探针直接 navigate
(typeof globalThis !== 'undefined') && ((globalThis as Record<string, unknown>).__nmNav = {
  navigate: (name: string, params?: unknown) => {
    try { (navRef as unknown as { navigate: (n: string, p?: unknown) => void }).navigate(name, params); return true; } catch { return false; }
  },
});
