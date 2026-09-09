// v1.2.4 D1:桌面右键菜单 DOM 渲染层(web 专属,desktop/src 注册)
// 视口边界翻转/Esc+点外关闭/hover 高亮/danger 红/子菜单悬停展开
import type { CtxMenuItem } from '../../src/hd/hdctxmenu';

export function mountCtxMenu() {
  if (document.getElementById('nm-ctxmenu-host')) return;
  // 主题感知(挂载读一次;主题切换=整页 reload)
  let light = false;
  try {
    const raw = localStorage.getItem('nmk:nextmusic-settings:settings');
    if (raw) light = !!(JSON.parse(raw) as { light?: boolean }).light;
  } catch { /* ignore */ }
  const surface = light ? 'rgba(252,253,254,.97)' : '#1E2023F2';
  const text = light ? '#26282C' : '#E8EAED';
  const subText = light ? '#62676E' : '#9AA0A6';
  const hoverBg = light ? 'rgba(31,35,41,.06)' : 'rgba(255,255,255,.09)';
  const border = light ? 'rgba(31,35,41,.12)' : 'rgba(255,255,255,.10)';
  const host = document.createElement('div');
  host.id = 'nm-ctxmenu-host';
  host.style.cssText = 'position:fixed;z-index:2147483601;inset:0;pointer-events:none;';
  document.body.appendChild(host);

  let open = false;
  const menu = document.createElement('div');
  const sub = document.createElement('div');
  menu.style.cssText = `position:absolute;min-width:196px;background:${surface};border:1px solid ${border};border-radius:10px;padding:5px;box-shadow:0 12px 32px rgba(0,0,0,.25);pointer-events:auto;`;
  sub.style.cssText = menu.style.cssText;
  host.appendChild(menu);
  host.appendChild(sub);

  const itemEl = (it: CtxMenuItem, depth0: boolean) => {
    const row = document.createElement('div');
    row.style.cssText = `display:flex;align-items:center;gap:9px;height:32px;padding:0 11px;border-radius:7px;font:500 12.5px/1 system-ui;color:${text};cursor:default;white-space:nowrap;`;
    if (it.disabled) { row.style.opacity = '.38'; }
    else row.style.cursor = 'pointer';
    if (it.danger) row.style.color = '#FF6B6B';
    const label = document.createElement('span');
    label.textContent = it.label;
    label.style.flex = '1';
    row.appendChild(label);
    if (it.children) {
      const arr = document.createElement('span');
      arr.textContent = '\u25B8';
      arr.style.cssText = `color:${subText};font-size:10px;`;
      row.appendChild(arr);
    } else if (it.shortcut) {
      const sc = document.createElement('span');
      sc.textContent = it.shortcut;
      sc.style.cssText = `color:${subText};font-size:11px;`;
      row.appendChild(sc);
    }
    if (!it.disabled) {
      row.addEventListener('mouseenter', () => { row.style.background = hoverBg; });
      row.addEventListener('mouseleave', () => { row.style.background = 'transparent'; });
      row.addEventListener('click', e => {
        e.stopPropagation();
        if (it.children) return;
        close();
        it.onPress?.();
      });
    }
    if (depth0 && it.children) {
      row.addEventListener('mouseenter', () => showSub(it, row));
    }
    return row;
  };

  const place = (el: HTMLElement, x: number, y: number) => {
    el.style.visibility = 'hidden';
    el.style.left = '0px'; el.style.top = '0px';
    // el 已在 host 内,勿 re-append(会脱离 host 的 pointer-events/关闭链)
    const r = el.getBoundingClientRect();
    let px = x, py = y;
    if (x + r.width > innerWidth - 8) px = Math.max(8, x - r.width);
    if (y + r.height > innerHeight - 8) py = Math.max(8, y - r.height);
    el.style.left = px + 'px';
    el.style.top = py + 'px';
    el.style.visibility = 'visible';
  };

  const showSub = (parent: CtxMenuItem, anchor: HTMLElement) => {
    sub.textContent = '';
    (parent.children || []).forEach(c => { if (!c.hidden) sub.appendChild(itemEl(c, false)); });
    const r = anchor.getBoundingClientRect();
    place(sub, r.right + 4, r.top - 5);
    sub.style.display = 'block';
  };

  const close = () => {
    open = false;
    menu.style.display = 'none';
    sub.style.display = 'none';
    host.style.pointerEvents = 'none';
  };

  host.addEventListener('mousedown', e => {
    if (e.target === host) close(); // 点遮罩外
  });
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && open) close(); });
  window.addEventListener('blur', close);
  // 菜单外 mousedown 关闭(host 全屏 pointer-events auto 时拦截)
  menu.addEventListener('mouseleave', () => { sub.style.display = 'none'; });

  (globalThis as never as Record<string, unknown>).__nmCtxMenu = (x: number, y: number, items: CtxMenuItem[]) => {
    menu.textContent = '';
    sub.style.display = 'none';
    const vis = items.filter(i => !i.hidden);
    vis.forEach(it => menu.appendChild(itemEl(it, true)));
    place(menu, x, y);
    menu.style.display = 'block';
    host.style.pointerEvents = 'auto';
    open = true;
  };

  // v1.2.4 D1 A3:全局右键——RNW 不透传 onContextMenu(forwardedProps 白名单无此项),
  // 故右键时从 __nmHoverMenu(hover 行注册的构造器)取菜单数据;无 hover 菜单也拦原生菜单
  window.addEventListener('contextmenu', e => {
    e.preventDefault();
    const get = (globalThis as unknown as { __nmHoverMenu?: (() => import('../../src/hd/hdctxmenu').CtxMenuItem[]) | null }).__nmHoverMenu;
    const items = get?.() || [];
    if (items.length) (globalThis as unknown as { __nmCtxMenu?: (x: number, y: number, items2: unknown[]) => void }).__nmCtxMenu?.(e.clientX, e.clientY, items);
  });
}
