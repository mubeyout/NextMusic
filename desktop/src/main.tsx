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
  // 顶部拖拽条:仅在标题栏高度内拖拽(34px);按钮区 no-drag;不遮侧栏 logo(避开左下)
  const strip = document.createElement('div');
  strip.style.cssText = [
    'position:fixed', 'top:0', 'left:0', 'right:0', 'height:34px',
    '-webkit-app-region:drag', 'z-index:2147483000', 'pointer-events:none',
  ].join(';');
  if (isMac) {
    // mac:红绿灯由系统叠放在左上,拖拽区让位
    strip.style.left = '78px';
    strip.style.pointerEvents = 'auto';
  } else if (nm) {
    // win/linux:自绘三钮(右下贴角落):整个按钮容器 no-drag
    const bar = document.createElement('div');
    bar.style.cssText = [
      'position:absolute', 'top:0', 'right:0', 'height:34px',
      '-webkit-app-region:no-drag', 'display:flex', 'pointer-events:auto',
    ].join(';');
    strip.appendChild(bar);
    const btns: Array<[string, string, () => void]> = [
      ['\u2015', '#ffffff1a', () => nm.minimize()],
      ['\u25a1', '#ffffff1a', () => nm.toggleMaximize()],
      ['\u2715', '#e81123', () => nm.close()],
    ];
    for (const [label, hoverBg, fn] of btns) {
      const b = document.createElement('div');
      b.textContent = label;
      b.style.cssText = [
        'display:flex', 'align-items:center', 'justify-content:center',
        'width:46px', 'height:34px',
        'cursor:pointer',
        'color:#ffffffb0', 'font-size:13px', 'user-select:none',
        'transition:background .12s',
      ].join(';');
      b.addEventListener('mouseenter', () => { b.style.background = hoverBg; b.style.color = '#fff'; });
      b.addEventListener('mouseleave', () => { b.style.background = 'transparent'; b.style.color = '#ffffffb0'; });
      b.addEventListener('click', fn);
      bar.appendChild(b);
    }
  }
  document.body.appendChild(strip);
})();
