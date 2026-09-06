// HD 屏外导航辅助:hdNav() 分流——内页(设置族除外)进 HDMain 内容区嵌套栈,左侧导航恒固定
// lx84(老板定夺):所有内页只在右侧内容区切换;Settings 族仍走根栈全屏
import { createNavigationContainerRef } from '@react-navigation/native';
import { navRef } from '../navRef';

// HDMain 内容区嵌套栈(独立 NavigationContainer;未挂时=冷启动 Boot 阶段,全部落根栈)
export const hdInnerRef = createNavigationContainerRef<ReactNavigation.RootParamList>();

// 根栈专属:启动流 + 播放页(lx89 老板定夺:播放页像设置一样单独一屏全屏) + 设置族
const ROOT_ONLY = new Set([
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
