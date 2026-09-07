// NextMusic Desktop renderer 入口：HD 形态（与 Android hd flavor 同一 UI/业务层）
import './polyfills';
import { mountCtxMenu } from './ctxmenu';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '../../App';

const root = createRoot(document.getElementById('root')!);

class EB extends React.Component<{children?: React.ReactNode}, {err: string | null}> {
  state = { err: null as string | null };
  static getDerivedStateFromError(e: Error) { return { err: (e.stack || e.message || String(e)).slice(0, 600) }; }
  componentDidCatch(e: Error, info: { componentStack?: string }) {
    this.setState({ err: (this.state.err || '') + '\n|||STACK|||\n' + (info.componentStack || '').slice(0, 1200) });
  }
  render() { return this.state.err ? <pre style={{color:'#f66',fontSize:12,whiteSpace:'pre-wrap'}}>{this.state.err}</pre> : this.props.children; }
}
root.render(<EB><App /></EB>);


// 桌面窗口标题
document.title = 'NextMusic';

// ===== 桌面壳层：页面缩放（settings.uiScale → CSS zoom）+ 无边框窗口控制条 =====
import { settings, onSettings } from '../../src/services/settings';

const applyZoom = () => {
  const z = Math.max(0.75, Math.min(2, Number(String(settings.get().uiScale || '125%').replace('%', '')) / 100));
  document.documentElement.style.zoom = String(z);
};
applyZoom();
onSettings(applyZoom);

mountCtxMenu();
(function mountWindowChrome() {
  const nm = (window as never as Record<string, unknown>).nmDesktop as
    | { platform: string; minimize: () => void; toggleMaximize: () => void; close: () => void; setTbStyle?: (s: unknown) => void }
    | undefined;
  const isMac = nm?.platform === 'darwin';
  const isWin = nm?.platform === 'win32';

  // 主题感知(挂载读一次;主题切换走整页 reload)
  let isLight = false;
  try {
    const raw = localStorage.getItem('nmk:nextmusic-settings:settings');
    if (raw) isLight = !!(JSON.parse(raw) as { light?: boolean }).light;
  } catch { /* ignore */ }

  // win:原生 overlay 符号色随主题(浅色下白色不可读)
  if (isWin) {
    nm?.setTbStyle?.(isLight
      ? { color: '#00000000', symbolColor: '#26282C' }
      : { color: '#00000000', symbolColor: '#ffffffcc' });
  }

  // ===== v1.2.3 顶部轨道(A2/W2):无标题栏 =====
  //  40px 通栏拖拽轨道:左 174px 侧栏同色(视觉上侧栏贯通到窗口顶——mac 红绿灯在此行),右侧透明(内容头部区拖拽;win 三键原生 overlay 悬于行尾)
  const css = document.createElement('style');
  css.id = 'nm-desktop-chrome';
  css.textContent = [
    '#nm-toprail { position:fixed; top:0; left:0; right:0; height:40px; display:flex; z-index:2147483600;',
    '  -webkit-app-region:drag; }',
    '#nm-toprail .rail-side { width:174px; flex:0 0 auto; -webkit-app-region:drag;',
    '  background:' + (isLight ? '#F6F7F9' : '#121212') + ';',
    '  border-right:.5px solid ' + (isLight ? 'rgba(31,35,41,.10)' : 'rgba(255,255,255,.08)') + '; }',
    '#nm-toprail .rail-main { flex:1; -webkit-app-region:drag; }',
    /* 只对按钮挖 no-drag 孔(rail-side/rail-main 恒为拖拽面——`*` 全 no-drag 会废掉整行拖拽,清单坑②) */
    '#nm-toprail .rail-btns, #nm-toprail .rail-btns * { -webkit-app-region:no-drag; }',
  ].join('\n');
  document.head.appendChild(css);

  // ===== v1.2.3 卡片几何 JS 直控 =====
  // 并行重构后栈卡片序=DOM 序但 Main 不一定是首张(Boot 壳在前)——CSS nth-of-type 会误偏 Main(双栏 bug 根因)。
  // 识别:含品牌 mark 图的卡片=Main(全宽,仅让位顶部轨道);其余=内页(左让 174 侧栏)。
  function applyCardLock() {
    // 从品牌 mark 图反查 Main 卡片(确定性)——卡片=mark 的最近 absolute 全尺寸祖先
    const mark = Array.from(document.images).find((im) => (im.src || '').includes('mark') && im.getBoundingClientRect().width > 0);
    if (!mark) return;
    let appCard: HTMLElement | null = mark as HTMLElement;
    while (appCard && appCard !== document.body) {
      const st = getComputedStyle(appCard);
      if (st.position === 'absolute' && appCard.getBoundingClientRect().width > 800) break;
      appCard = appCard.parentElement;
    }
    if (!appCard || appCard === document.body) return;
    const parent = appCard.parentElement;
    if (!parent) return;
    for (const cd of Array.from(parent.children) as HTMLElement[]) {
      if (cd.id === 'nm-toprail' || cd.tagName !== 'DIV') continue;
      const isMain = !!cd.querySelector('img[src*="mark"]');
      cd.style.top = '40px';
      cd.style.height = 'calc(100% - 40px)';
      if (isMain) {
        cd.style.left = '0px'; cd.style.right = '0px'; cd.style.width = 'auto'; cd.style.marginLeft = '';
      } else {
        cd.style.left = '174px'; cd.style.right = '0px'; cd.style.width = 'auto';
      }
    }
  }
  let lockQueued = false;
  const scheduleLock = () => {
    if (lockQueued) return;
    lockQueued = true;
    requestAnimationFrame(() => { lockQueued = false; applyCardLock(); });
  };
  new MutationObserver(scheduleLock).observe(document.body, { childList: true, subtree: true });
  applyCardLock();

  const rail = document.createElement('div');
  rail.id = 'nm-toprail';
  const side = document.createElement('div');
  side.className = 'rail-side';
  const mainArea = document.createElement('div');
  mainArea.className = 'rail-main';
  rail.appendChild(side); rail.appendChild(mainArea);

  // linux:无原生 overlay,DOM 三键悬于轨道行尾(W2 同位)
  if (!isMac && !isWin && nm) {
    const btns: Array<[string, string, () => void]> = [
      ['\u2015', 'rgba(255,255,255,.10)', () => nm.minimize()],
      ['\u25a1', 'rgba(255,255,255,.10)', () => nm.toggleMaximize()],
      ['\u2715', '#e81123', () => nm.close()],
    ];
    const grp = document.createElement('div');
    grp.className = 'rail-btns';
    grp.style.cssText = ['position:absolute','right:0','top:0','display:flex','height:40px'].join(';');
    for (const [label, hoverBg, fn] of btns) {
      const b = document.createElement('div');
      b.textContent = label;
      b.style.cssText = ['display:flex','align-items:center','justify-content:center','width:46px','height:40px','cursor:pointer','color:' + (isLight ? '#42464c' : '#ffffffb0'),'font-size:13px','user-select:none','transition:background .12s'].join(';');
      b.addEventListener('mouseenter', () => { b.style.background = hoverBg; });
      b.addEventListener('mouseleave', () => { b.style.background = 'transparent'; });
      b.addEventListener('click', fn);
      grp.appendChild(b);
    }
    rail.appendChild(grp);
  }
  document.body.appendChild(rail);
})();
