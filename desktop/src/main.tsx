// NextMusic Desktop renderer 入口：HD 形态（与 Android hd flavor 同一 UI/业务层）
import './polyfills';
import { mountCtxMenu } from './ctxmenu';
import { mountKbNav } from './kbnav';
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
mountKbNav();
// v3.17(老板):playbar 毛玻璃——RNW style 不认 backdropFilter,用 dataSet data-nm-playbar 挂 CSS;
// 必须在 mountWindowChrome 的 !nm 早退之外(web 部署形态无 Electron 桥,拿不到那段注入)
(function mountPlaybarGlass() {
  const css = document.createElement('style');
  css.id = 'nm-playbar-glass';
  css.textContent = '[data-nm-playbar="1"]{backdrop-filter:blur(22px) saturate(150%);-webkit-backdrop-filter:blur(22px) saturate(150%)}';
  document.head.appendChild(css);
})();
(function mountWindowChrome() {
  const nm = (window as never as Record<string, unknown>).nmDesktop as
    | { platform: string; minimize: () => void; toggleMaximize: () => void; close: () => void; setTbStyle?: (s: unknown) => void }
    | undefined;
  const isMac = nm?.platform === 'darwin';
  const isWin = nm?.platform === 'win32';
  // web 服务端部署形态:无 Electron 桥——不注入窗口轨道(toprail)。
  // 此前误注入: rail-side(174px) 右边框发丝线悬在侧栏上方,与侧栏自身边线错位(老板:logo 后有条没对齐的线)
  if (!nm) return;

  // 主题感知(挂载读一次;主题切换走整页 reload)
  let isLight = false;
  let isPureBlack = false;
  try {
    const raw = localStorage.getItem('nmk:nextmusic-settings:settings');
    if (raw) {
      const s = JSON.parse(raw) as { light?: boolean; pureBlack?: boolean };
      isLight = !!s.light;
      isPureBlack = !!s.pureBlack;
    }
  } catch { /* ignore */ }
  // v1.2.5:body/#root/html 底色随主题——顶部轨道(透明)与内容卡上方区域透出的底,浅色下不再是裸 #121212 深条
  // (index.html 给 html/body/#root 三者都烘了 #121212,只改 body 会被 #root 盖住——实测)
  // v1.2.11:补 pureBlack 底色(否则纯黑主题下顶部轨道透出 #121212 灰条)
  const themeBg = isLight ? '#F6F7F9' : (isPureBlack ? '#000000' : '#121212');
  document.body.style.background = themeBg;
  document.documentElement.style.background = themeBg;
  const rootEl = document.getElementById('root');
  if (rootEl) rootEl.style.background = 'transparent';

  // win:原生 overlay 符号色随主题(浅色下白色不可读)
  if (isWin) {
    nm?.setTbStyle?.(isLight
      ? { color: '#00000000', symbolColor: '#26282C' }
      : { color: '#00000000', symbolColor: '#ffffffcc' });
  }

  // ===== v1.2.5 顶部轨道 36px(A2/W2):无标题栏 =====
  //  36px 通栏拖拽轨道:左 174px 侧栏区(win/linux 透明——React 品牌行负 margin 顶入轨道,拖拽面仍在;
  // mac 不透明——红绿灯在此行,品牌行在轨道下方第二行),右侧透明(内容头部区拖拽;win 三键原生 overlay 悬于行尾)
  const css = document.createElement('style');
  css.id = 'nm-desktop-chrome';
  css.textContent = [
    '#nm-toprail { position:fixed; top:0; left:0; right:0; height:36px; display:flex; z-index:2147483600;',
    '  -webkit-app-region:drag; }',
    // v1.2.11(老板:mac 红绿灯上面有条形胶囊):rail-side 改恒透明+mac 去右边框——
    // 之前 mac 不透明条(174×36+右边框发丝线)在侧栏色上方读作独立胶囊;现在透出的 body 底
    // 与侧栏 C.bg 三主题一致(深 #121212/浅 #F6F7F9/纯黑 #000),红绿灯直接浮在侧栏同色底上,无胶囊感
    // v1.2.13(老板:桌面也错位):分割线统一由侧栏自身 border 提供,轨道不再画框——
    // 两条线(轨道框+侧栏框)在 zoom 非 100% 时相差零点几像素,读作双线/错位;rail-side 恒透明
    '#nm-toprail .rail-side { width:174px; flex:0 0 auto; -webkit-app-region:drag;',
    '  background:transparent; border-right:none; }',
    '#nm-toprail .rail-main { flex:1; -webkit-app-region:drag; }',
    /* 只对按钮挖 no-drag 孔(rail-side/rail-main 恒为拖拽面——`*` 全 no-drag 会废掉整行拖拽,清单坑②) */
    '#nm-toprail .rail-btns, #nm-toprail .rail-btns * { -webkit-app-region:no-drag; }',
    /* v1.2.5 卡片 hover 过渡(React inline style 变化→CSS 过渡接管)——lx170:接 easing token(Leo motion-spec 基准) */
    ':root { --nm-ease-out: cubic-bezier(0.23,1,0.32,1); --nm-ease-hover: cubic-bezier(0.25,0.1,0.25,1); --nm-ease-in-out: cubic-bezier(0.77,0,0.175,1); }',
    '.nm-card { transition: transform .16s var(--nm-ease-hover), box-shadow .16s var(--nm-ease-hover); }',
    /* v1.2.12(Leo P0-1/2):HDTouch 按压平滑 + 可点区域 pointer 手型 */
    '.nm-press { transition: transform .12s var(--nm-ease-hover); cursor: pointer; }',
    '.nm-card { cursor: pointer; }',
    /* ===== v1.2.11 三平台规范层 ===== */
    /* 细滚动条(mac overlay 质感;win/linux 取代 Chromium 粗条),主题感知(主题切换=整页 reload) */
    '::-webkit-scrollbar { width: 12px; height: 12px; }',
    '::-webkit-scrollbar-thumb { border-radius: 6px; border: 3px solid transparent; background-clip: content-box; background-color: ' + (isLight ? 'rgba(31,35,41,.20)' : 'rgba(255,255,255,.16)') + '; }',
    '::-webkit-scrollbar-thumb:hover { background-color: ' + (isLight ? 'rgba(31,35,41,.32)' : 'rgba(255,255,255,.30)') + '; }',
    '::-webkit-scrollbar-track, ::-webkit-scrollbar-corner { background: transparent; }',
    /* 选区/tap 高亮(桌面感);v3.14(老板:淡淡方块跟着选中)去掉 :focus-visible 描边——桌面 hover 态已足够 */
    '::selection { background: rgba(30,215,96,.32); }',
    '* { -webkit-tap-highlight-color: transparent; }',
    /* 视图入场:内页卡片 push 转场(右入+淡入,桌面应用通用手感) */
    '@keyframes nmViewIn { from { opacity: 0; transform: translateX(22px); } to { opacity: 1; transform: translateX(0); } }',
    '.nm-view-in { animation: nmViewIn .2s var(--nm-ease-out); }',
    /* lx170(动效 standard 档):reduced-motion 兜底——保 opacity/color,去 transform/位移;动效全靜音 */
    '@media (prefers-reduced-motion: reduce) {',
    '  .nm-card, .nm-view-in, #nm-ctxmenu-host * { transition: none !important; animation: none !important; }',
    '  .nm-vinyl-spin { animation: none !important; }',
    '  * { scroll-behavior: auto !important; }',
    '}',
  ].join('\n');
  document.head.appendChild(css);

  // v1.2.6(老板:横向一行滚动要适合桌面):滚轮纵向→容器横向滚动——
  // 光标在横向行(推荐歌单/最近播放等)上时,滚轮直接横向翻,不再需要拖拽/Shift
  document.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.deltaY === 0 || e.deltaX !== 0) return;
    let n: HTMLElement | null = e.target as HTMLElement;
    for (let i = 0; i < 8 && n && n !== document.body; i++) {
      const st = getComputedStyle(n);
      if ((st.overflowX === 'auto' || st.overflowX === 'scroll') && n.scrollWidth > n.clientWidth + 4) {
        n.scrollLeft += e.deltaY;
        e.preventDefault();
        return;
      }
      n = n.parentElement;
    }
  }, { passive: false });

  // ===== v1.2.3 卡片几何 JS 直控 =====
  // 并行重构后栈卡片序=DOM 序但 Main 不一定是首张(Boot 壳在前)——CSS nth-of-type 会误偏 Main(双栏 bug 根因)。
  // 识别:含品牌 mark 图的卡片=Main(全宽,仅让位顶部轨道);其余=内页(左让 174 侧栏)。
  const seenViews = new WeakSet<HTMLElement>(); // v1.2.11:内页入场动画只放一次(Main/Boot 不放,防启动闪烁)
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
      cd.style.top = '36px';
      cd.style.height = 'calc(100% - 36px)';
      if (isMain) {
        cd.style.left = '0px'; cd.style.right = '0px'; cd.style.width = 'auto'; cd.style.marginLeft = '';
      } else {
        cd.style.left = '174px'; cd.style.right = '0px'; cd.style.width = 'auto';
        // v1.2.11 新内页首次出现→push 入场动画(右入+淡入)
        if (!seenViews.has(cd)) { seenViews.add(cd); cd.classList.add('nm-view-in'); }
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
    grp.style.cssText = ['position:absolute','right:0','top:0','display:flex','height:36px'].join(';');
    for (const [label, hoverBg, fn] of btns) {
      const b = document.createElement('div');
      b.textContent = label;
      b.title = label === '\u2015' ? '最小化' : label === '\u25a1' ? '最大化 / 还原' : '关闭'; // v1.2.11 原生 tooltip
      b.style.cssText = ['display:flex','align-items:center','justify-content:center','width:46px','height:36px','cursor:pointer','color:' + (isLight ? '#42464c' : '#ffffffb0'),'font-size:13px','user-select:none','transition:background .12s'].join(';');
      b.addEventListener('mouseenter', () => { b.style.background = hoverBg; });
      b.addEventListener('mouseleave', () => { b.style.background = 'transparent'; });
      b.addEventListener('click', fn);
      grp.appendChild(b);
    }
    rail.appendChild(grp);
  }
  document.body.appendChild(rail);
})();


// web 全局错误红条(部署版排障:未捕获错误显示为顶部红条,便于定位线上崩溃)
if (typeof window !== 'undefined') {
  const showErr = (msg: string) => {
    let bar = document.getElementById('nm-web-errbar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'nm-web-errbar';
      bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#F2545B;color:#fff;font:12px/1.6 monospace;padding:8px 14px;white-space:pre-wrap;max-height:30vh;overflow:auto';
      (document.body || document.documentElement).appendChild(bar);
    }
    bar.textContent = msg;
  };
  window.addEventListener('error', (e: ErrorEvent) => { showErr('Error: ' + (e.message || 'unknown') + (e.filename ? `\n  at ${e.filename}:${e.lineno}` : '')); });
  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => { showErr('Promise: ' + String((e.reason as Error)?.message || e.reason)); });
}
