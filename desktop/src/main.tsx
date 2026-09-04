// NextMusic Desktop renderer 入口：HD 形态（与 Android hd flavor 同一 UI/业务层）
import './polyfills';
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

(function mountWindowChrome() {
  const nm = (window as never as Record<string, unknown>).nmDesktop as
    | { platform: string; minimize: () => void; toggleMaximize: () => void; close: () => void }
    | undefined;
  const isMac = nm?.platform === 'darwin';

  // ===== 全局布局 CSS:40px 工具栏占位(所有内容下移),侧栏常驻让位 =====
  const css = document.createElement('style');
  css.id = 'nm-desktop-chrome';
  css.textContent = [
    /* root 下第一层 = NavigationContainer;内容整体下移 40px 让位工具栏 */
    '#root > div { top: 40px !important; height: calc(100% - 40px) !important; }',
    /* 卡片层:非首张(Main)左让 174 侧栏 */
    '#root > div > div:nth-of-type(n+2) { left: 174px !important; right: 0 !important; width: auto !important; }',
    '#root > div > div:nth-of-type(n+2) > div { left: 0 !important; }',
    /* mac 红绿灯在左上:侧栏首行内容左让 78px(仅顶部区域) */
    isMac ? '#root .nm-brand-row { padding-left: 78px; }' : '',
    /* 工具栏本体 */
    '#nm-titlebar { position:fixed; top:0; left:0; right:0; height:40px; display:flex; align-items:center;',
    '  -webkit-app-region:drag; z-index:2147483600; background:transparent; }',
    '#nm-titlebar * { -webkit-app-region:no-drag; }',
    '#nm-titlebar .tb-btn:hover { color:#fff !important; }',
  ].filter(Boolean).join('\n');
  document.head.appendChild(css);

  const bar = document.createElement('div');
  bar.id = 'nm-titlebar';
  const light = document.title === '__never__' ? '#fff' : '#ffffffcc';

  // 左:品牌(logo 上移到工具栏——窗口按钮行从此有实际内容且不挤)
  const brand = document.createElement('div');
  brand.style.cssText = ['display:flex','align-items:center','gap:8px','padding:0 14px','height:100%','font:700 13px/-webkit-app-region system-ui','color:#ffffffcc','user-select:none'].join(';');
  const dot = document.createElement('span');
  dot.textContent = '\u25CF';
  dot.style.cssText = 'color:#1ED760;font-size:15px;line-height:1';
  const name = document.createElement('span');
  name.textContent = 'NextMusic';
  name.style.cssText = 'font-weight:800;font-size:13px;letter-spacing:.2px';
  brand.appendChild(dot); brand.appendChild(name);
  if (isMac) brand.style.paddingLeft = '84px'; // 红绿灯让位
  bar.appendChild(brand);

  if (!isMac && nm) {
    // win/linux:右三钮(46px 宽×3)
    const btns: Array<[string, string, () => void]> = [
      ['\u2015', '#ffffff1a', () => nm.minimize()],
      ['\u25a1', '#ffffff1a', () => nm.toggleMaximize()],
      ['\u2715', '#e81123', () => nm.close()],
    ];
    const grp = document.createElement('div');
    grp.style.cssText = ['display:flex','height:100%'].join(';');
    for (const [label, hoverBg, fn] of btns) {
      const b = document.createElement('div');
      b.className = 'tb-btn';
      b.textContent = label;
      b.style.cssText = ['display:flex','align-items:center','justify-content:center','width:46px','height:40px','cursor:pointer','color:#ffffffb0','font-size:13px','user-select:none','transition:background .12s'].join(';');
      b.addEventListener('mouseenter', () => { b.style.background = hoverBg; });
      b.addEventListener('mouseleave', () => { b.style.background = 'transparent'; });
      b.addEventListener('click', fn);
      grp.appendChild(b);
    }
    bar.appendChild(grp);
  }
  // 设置齿轮(全局属性位:品牌对面;win 在三钮左,mac 独占右侧)
  const gear = document.createElement('div');
  gear.title = '设置';
  gear.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.08a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.08a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.08a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
  gear.style.cssText = ['margin-left:auto','display:flex','align-items:center','justify-content:center','width:36px','height:40px','cursor:pointer','color:#ffffff99','transition:color .12s'].join(';');
  gear.addEventListener('mouseenter', () => { gear.style.color = '#fff'; });
  gear.addEventListener('mouseleave', () => { gear.style.color = '#ffffff99'; });
  gear.addEventListener('click', () => {
    const nav = (window as never as Record<string, { navigate?: (s: string) => boolean }>).nmNavProxy;
    const g = (globalThis as never as Record<string, { navigate?: (s: string) => boolean }>).nmNav;
    (g || nav)?.navigate?.('Settings');
  });
  // 齿轮插入:win 在三钮组前(先 gear 后 grp 顺序已保证——gear 在三钮 append 前创建并插入)
  bar.appendChild(gear);
  document.body.appendChild(bar);
})();
