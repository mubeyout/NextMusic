// v1.2.4 D3(A2):桌面键盘导航控制器(web 专属)
// ↑↓ 列表内移焦点(指针在列表区域内才激活,防劫持)/Enter 播放/Shift+F10 菜单/Home End/Esc 清除/⌘F 聚焦搜索框
// 焦点视觉=品牌色左侧指示条(独立 DOM,不用 TV 焦点环)
import type { KbRow } from '../../src/hd/hdkeyboard';

interface RectRow { row: KbRow; x: number; y: number; w: number; h: number; }

export function mountKbNav() {
  if (document.getElementById('nm-kbbar')) return;

  // 指示条
  const bar = document.createElement('div');
  bar.id = 'nm-kbbar';
  bar.style.cssText = 'position:fixed;width:3px;border-radius:2px;background:#1ED760;z-index:2147483602;pointer-events:none;opacity:0;left:0;'; // v1.2.11 动效规范:键盘焦点零动画(高频操作禁过渡)——移除原 top/height .08s 滑动
  document.body.appendChild(bar);

  let idx = -1;              // 键盘焦点索引(-1=未激活)
  let rows: RectRow[] = [];  // 最近一次快照(可见行,y 排序)
  let mouseX = -1, mouseY = -1;
  window.addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; }, { passive: true });

  const rowsMap = () => ((globalThis as never as { __nmKbRows?: Map<number, KbRow> }).__nmKbRows || new Map());

  // 聚合量取(可见行过滤 w>0,y 排序)
  const snapshot = (cb: (rows: RectRow[]) => void) => {
    const entries = Array.from(rowsMap().values());
    const out: RectRow[] = [];
    let pending = entries.length;
    if (!pending) { cb([]); return; }
    entries.forEach(row => {
      try {
        row.measure((x, y, w, h, px, py) => {
          if (w > 40 && h > 20) out.push({ row, x: px, y: py, w, h });
          if (--pending === 0) { out.sort((a, b) => a.y - b.y || a.x - b.x); cb(out); }
        });
      } catch { if (--pending === 0) { out.sort((a, b) => a.y - b.y || a.x - b.x); cb(out); } }
    });
  };

  const showBar = (r: RectRow | null) => {
    if (!r) { bar.style.opacity = '0'; return; }
    bar.style.left = Math.max(4, r.x - 7) + 'px';
    bar.style.top = r.y + 3 + 'px';
    bar.style.height = Math.max(16, r.h - 6) + 'px';
    bar.style.opacity = '1';
  };

  const focusIdx = (i: number) => {
    if (!rows.length) return;
    idx = Math.max(0, Math.min(rows.length - 1, i));
    const r = rows[idx];
    showBar(r);
    // 滚动到可见
    if (r.y < 60 || r.y + r.h > innerHeight - 20) {
      const scroller = document.scrollingElement || document.documentElement;
      scroller.scrollTop += r.y < 60 ? r.y - 80 : r.y + r.h - innerHeight + 40;
      // 重取坐标(滚动后)
      snapshot(rs => { rows = rs; if (rows[idx]) showBar(rows[idx]); });
    }
  };

  const inListArea = () => mouseX >= 0 && rows.length
    ? rows.some(r => mouseY >= r.y - 8 && mouseY <= r.y + r.h + 8)
    : false;

  window.addEventListener('keydown', e => {
    const t = e.target as HTMLElement | null;
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    // ⌘F/Ctrl+F 聚焦搜索框(输入态也放行,统一抢占)
    if ((e.metaKey || e.ctrlKey) && (e.key === 'f' || e.key === 'F')) {
      const input = Array.from(document.querySelectorAll('input')).find(i => ((i.getAttribute('placeholder') || '') + (i.getAttribute('aria-label') || '')).includes('搜索') && i.getBoundingClientRect().width > 0);
      if (input) { e.preventDefault(); (input as HTMLInputElement).focus(); (input as HTMLInputElement).select?.(); return; }
    }
    if (typing) { if (e.key === 'Escape') (t as HTMLElement).blur?.(); return; }

    const key = e.key;
    if (key === 'Escape') { idx = -1; showBar(null); return; }
    if (key !== 'ArrowUp' && key !== 'ArrowDown' && key !== 'Enter' && key !== 'Home' && key !== 'End' && key !== 'F10' && key !== 'ContextMenu') return;

    snapshot(rs => {
      rows = rs;
      if (!rows.length) return;
      // 未激活:仅当指针在列表区域(防劫持)时首激活
      if (idx < 0 && (key === 'ArrowUp' || key === 'ArrowDown')) {
        if (!inListArea()) return;
        // 从指针最近的行开始
        let best = 0, bd = 1e9;
        rows.forEach((r, i) => { const d = Math.abs(r.y + r.h / 2 - mouseY); if (d < bd) { bd = d; best = i; } });
        e.preventDefault();
        focusIdx(best);
        return;
      }
      if (idx < 0) return;
      if (key === 'ArrowDown') { e.preventDefault(); focusIdx(idx + 1); }
      else if (key === 'ArrowUp') { e.preventDefault(); focusIdx(idx - 1); }
      else if (key === 'Home') { e.preventDefault(); focusIdx(0); }
      else if (key === 'End') { e.preventDefault(); focusIdx(rows.length - 1); }
      else if (key === 'Enter') { const r = rows[idx]; if (r) r.row.play(); }
      else if ((key === 'F10' && e.shiftKey) || key === 'ContextMenu') {
        const r = rows[idx];
        const items = r?.row.menu?.();
        if (r && items && items.length) {
          e.preventDefault();
          (globalThis as never as { __nmCtxMenu?: (x: number, y: number, items2: unknown[]) => void }).__nmCtxMenu?.(Math.round(r.x + 40), Math.round(r.y + 8), items);
        }
      }
    });
  });
}
