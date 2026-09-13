// 桌面验证钩子(同 navRef.__nmNav 思路):暴露嵌套栈直达导航——CDP 验证内页(歌单详情等)不再依赖不可靠的 UI 点击
(typeof globalThis !== 'undefined') && (((globalThis as never as Record<string, unknown>).__nmNavInner = {
  navigate: (name: string, params?: unknown) => {
    try { (hdInnerRef as unknown as { navigate: (n: string, p?: unknown) => void }).navigate(name, params as never); return true; } catch { return false; }
  },
  lastParams: () => {
    try { const r = hdInnerRef.getCurrentRoute(); return r ? { name: r.name, keys: Object.keys((r.params || {}) as object), songsLen: (((r.params as { songs?: unknown[] })?.songs) as unknown[] | undefined)?.length ?? null, title: (r.params as { title?: string })?.title ?? null } : null; } catch (e) { return String(e); }
  },
}));

// HD 屏外导航辅助:hdNav() 分流——内页进 HDMain 内容区嵌套栈,左侧导航恒固定
// lx84(老板定夺):TV 所有内页只在右侧内容区切换;Settings 族仍走根栈全屏
// v1.2.5 桌面(老板:设置也作为内页加载,左边导航固定):web 侧设置族/播放页全部进嵌套栈,
// 根栈只剩启动流(Boot/Server/Auth/Main)——侧栏在任何页面都活跃可点
import { Platform } from 'react-native';
import { createNavigationContainerRef } from '@react-navigation/native';
import { navRef } from '../navRef';

// HDMain 内容区嵌套栈(独立 NavigationContainer;未挂时=冷启动 Boot 阶段,全部落根栈)
export const hdInnerRef = createNavigationContainerRef<ReactNavigation.RootParamList>();

// 根栈专属:启动流 + (TV:播放页/设置族全屏——lx89 老板定夺)
const ROOT_ONLY = new Set(Platform.OS === 'web'
  ? ['Boot', 'Server', 'Auth', 'Main']
  : [
      'Boot', 'Server', 'Auth', 'Main', 'Player',
      'Settings', 'BasicSettings', 'Theme', 'About',
      'Manual', 'DeployGuide', 'Faq', 'Changelog',
      'BackupSettings', 'DownloadsSettings',
    ]);

type LooseNav = { navigate: (s: string, p?: object) => void; goBack: () => void; canGoBack?: () => boolean } | null;

export const hdNav = (): LooseNav => {
  const inner = hdInnerRef.isReady() ? (hdInnerRef as unknown as LooseNav) : null;
  const root = navRef.current as unknown as LooseNav;
  if (!inner && !root) return null;
  return {
    navigate: (s: string, p?: object) => {
      // lx90→lx109 通用化:根栈顶不是 Main(设置/播放页等全屏层)时,一切跳转同层根栈——
      // 否则路由进被 HDMain 盖住的嵌套栈=按钮无响应(Fx/登录从设置页打不开的根因)
      const rootTop = (navRef.current as unknown as { getCurrentRoute?: () => { name?: string } | null })?.getCurrentRoute?.()?.name;
      const useRoot = ROOT_ONLY.has(s) || (rootTop != null && rootTop !== 'Main');
      const target = inner && !useRoot ? inner : root;
      target?.navigate(s, p);
    },
    goBack: () => {
      if (inner?.canGoBack?.()) inner.goBack();
      else root?.goBack();
    },
  };
};
