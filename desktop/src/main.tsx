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

  // 主题感知(浅色/深色工具栏材质):主题切换走整页 reload,挂载时读一次即可
  let isLight = false;
  try {
    const raw = localStorage.getItem('nmk:nextmusic-settings:settings');
    if (raw) isLight = !!(JSON.parse(raw) as { light?: boolean }).light;
  } catch { /* ignore */ }

  // ===== 全局布局 CSS:40px 工具栏占位(所有内容下移),侧栏常驻让位 =====
  // 平台差异化:v1.2.2——mac 品牌居中(HIG:工具栏中央放标题,红绿灯区留空);
  //            win/linux 品牌靠左(Fluent:标题栏左侧),右侧齿轮+三钮
  const css = document.createElement('style');
  css.id = 'nm-desktop-chrome';
  css.textContent = [
    '#root > div { top: 40px !important; height: calc(100% - 40px) !important; }',
    '#root > div > div:nth-of-type(n+2) { left: 174px !important; right: 0 !important; width: auto !important; }',
    '#root > div > div:nth-of-type(n+2) > div { left: 0 !important; }',
    '#nm-titlebar { position:fixed; top:0; left:0; right:0; height:40px; display:flex; align-items:center;',
    '  -webkit-app-region:drag; z-index:2147483600;',
    isLight
      ? 'background:rgba(246,247,249,.72); border-bottom:.5px solid rgba(31,35,41,.10); color:#26282C;'
      : 'background:rgba(18,18,18,.55); border-bottom:.5px solid rgba(255,255,255,.08); color:#ffffffcc;',
    '  backdrop-filter:blur(18px); -webkit-backdrop-filter:blur(18px); }',
    '#nm-titlebar * { -webkit-app-region:no-drag; }',
    '#nm-titlebar .tb-btn { transition:background .12s, color .12s; }',
    /* mac:中央品牌 */
    '#nm-tb-brand.mac { position:absolute; left:50%; transform:translateX(-50%); }',
  ].join('\n');
  document.head.appendChild(css);

  const bar = document.createElement('div');
  bar.id = 'nm-titlebar';
  const txt = isLight ? '#26282C' : '#ffffffcc';

  // 品牌:win/linux 左贴边;mac 居中(class=mac)
  const brand = document.createElement('div');
  brand.id = 'nm-tb-brand';
  if (isMac) brand.className = 'mac';
  brand.style.cssText = ['display:flex','align-items:center','gap:8px','padding:0 14px','height:100%',
    'font-family:system-ui,-apple-system,sans-serif','font-weight:800','font-size:13px','letter-spacing:.2px',
    `color:${txt}`,'user-select:none','white-space:nowrap'].join(';');
  const dot = document.createElement('span');
  dot.textContent = '\u25CF';
  dot.style.cssText = 'color:#1ED760;font-size:14px;line-height:1';
  const name = document.createElement('span');
  name.textContent = 'NextMusic';
  brand.appendChild(dot); brand.appendChild(name);
  if (!isMac) bar.appendChild(brand); // mac:居中品牌后插(顺序无关,绝对定位)

  // mac 左上 84px 红绿灯区:纯拖拽(不放假元素占位)
  if (isMac) {
    const lights = document.createElement('div');
    lights.style.cssText = 'width:84px;height:100%;flex:0 0 auto;-webkit-app-region:drag;';
    bar.appendChild(lights);
  }



  if (isMac) bar.appendChild(brand); // mac 居中品牌(在 lights 后 append,绝对定位无所谓序)

  // 设置齿轮:右侧(margin-left:auto 推到最右;win 在三钮左侧因三钮已 append——顺序:brand,grp?,gear → gear auto 后于 grp 即在 grp 右?不——auto 推 gear 到行尾,grp 在 gear 前)
  const gear = document.createElement('div');
  gear.title = '设置';
  gear.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.08a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.08a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.08a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
  gear.style.cssText = ['margin-left:auto','display:flex','align-items:center','justify-content:center','width:36px','height:40px','cursor:pointer',`color:${isLight ? '#62676e' : '#ffffff99'}`,'transition:color .12s'].join(';');
  gear.addEventListener('mouseenter', () => { gear.style.color = isLight ? '#26282C' : '#fff'; });
  gear.addEventListener('mouseleave', () => { gear.style.color = isLight ? '#62676e' : '#ffffff99'; });
  gear.addEventListener('click', () => {
    const g = (globalThis as never as Record<string, { navigate?: (s: string) => boolean }>).nmNav;
    g?.navigate?.('Settings');
  });
  bar.appendChild(gear);
  // win/linux:三钮组最后 append(gear 的 margin-left:auto 把 gear+grp 整体推右——gear 在三钮左)
  if (!isMac && nm) {
    // win/linux:右三钮(Fluent:46px 宽,close 悬停红)
    const btns: Array<[string, string, () => void]> = [
      ['\u2015', 'rgba(255,255,255,.10)', () => nm.minimize()],
      ['\u25a1', 'rgba(255,255,255,.10)', () => nm.toggleMaximize()],
      ['\u2715', '#e81123', () => nm.close()],
    ];
    const grp = document.createElement('div');
    grp.style.cssText = ['display:flex','height:100%'].join(';');
    for (const [label, hoverBg, fn] of btns) {
      const b = document.createElement('div');
      b.className = 'tb-btn';
      b.textContent = label;
      b.style.cssText = ['display:flex','align-items:center','justify-content:center','width:46px','height:40px','cursor:pointer',`color:${isLight ? '#42464c' : '#ffffffb0'}`,'font-size:13px','user-select:none'].join(';');
      b.addEventListener('mouseenter', () => { b.style.background = hoverBg; b.style.color = isLight ? '#fff' : '#fff'; });
      b.addEventListener('mouseleave', () => { b.style.background = 'transparent'; b.style.color = isLight ? '#42464c' : '#ffffffb0'; });
      b.addEventListener('click', fn);
      grp.appendChild(b);
    }
    bar.appendChild(grp);
  }  document.body.appendChild(bar);
})();
