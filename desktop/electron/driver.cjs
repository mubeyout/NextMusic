// NextMusic Desktop 无头测试驱动（NM_DRIVER=1 时挂载）
// 环境变量：
//   NM_CLICK='x,y;x,y'      多步点击（每步 1.4s）
//   NM_TYPE='x,y|text;...'  点击聚焦后 insertText（每步 1.5s）
//   NM_SHOT=/path.png       截图退出（自动根据链长延后）
//   NM_PROBE=1              DOM+audio 摘要打到 stdout
const DELAY_UNIT = 1500;

module.exports = function driver(win, app) {
  // 预置登录态(NM_BOOT='{"mode":"server","base":...,"token":...,"username":...}'):
  // 写 localStorage 后 reload,App 冷启直接进入已连接状态
  if (process.env.NM_BOOT) {
    win.webContents.once('did-finish-load', async () => {
      await win.webContents.executeJavaScript(`localStorage.setItem('nmk:nextmusic:app', ${JSON.stringify(process.env.NM_BOOT)})`).catch(() => 0);
      console.log('[boot] state injected, reloading');
      win.loadURL(process.env.VITE_DEV ? 'http://127.0.0.1:5199' : 'about:blank');
    });
  }

  const typeSteps = (process.env.NM_TYPE || '').split(';').filter(Boolean);
  const clickSteps = (process.env.NM_CLICK || '').split(';').filter(Boolean);
  const chainLen = Math.max(typeSteps.length, clickSteps.length);
  const shotPath = process.env.NM_SHOT;

  function clickAt(x, y) {
    win.webContents.sendInputEvent({ type: 'mouseMove', x, y });
    win.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
    win.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
  }

  clickSteps.forEach((step, i) => {
    const [x, y] = step.split(',').map(Number);
    setTimeout(() => { clickAt(x, y); console.log('[click]', x, y); }, 1800 + i * DELAY_UNIT);
  });

  typeSteps.forEach((step, i) => {
    const [xy, text] = step.split('|');
    const [x, y] = xy.split(',').map(Number);
    setTimeout(() => {
      clickAt(x, y);
      if (text) setTimeout(() => win.webContents.insertText(text), 300);
      console.log('[type]', x, y, text || '(click)');
    }, 1800 + i * 1500);
  });

  // 任意 JS 驱动:NM_EVAL='js 代码'(链长时刻执行,结果打 [EVAL])
  if (process.env.NM_EVAL) {
    setTimeout(async () => {
      const r = await win.webContents.executeJavaScript(process.env.NM_EVAL)
        .then(v => JSON.stringify(v)).catch(e => 'EVAL-FAIL ' + e.message);
      console.log('[EVAL]', String(r).slice(0, 500));
    }, 1800 + chainLen * 1500);
  }
  // 探测+截图：链结束后 2.5s 执行
  const tailMs = 1800 + chainLen * 1500 + 2500;

  if (process.env.NM_PROBE) {
    win.webContents.once('did-finish-load', () => setTimeout(async () => {
      const out = await win.webContents.executeJavaScript(`(() => {
        const r = document.getElementById('root');
        if (!r) return JSON.stringify({ root: 'NO-ROOT' });
        const au = window.__nmAudio;
        const audioStat = au ? {
          paused: au.paused,
          t: Math.round(au.currentTime),
          dur: Math.round(au.duration || 0),
          src: String(au.currentSrc || au.src).slice(0, 100),
          err: au.error ? au.error.code : null,
        } : 'no-audio';
        return JSON.stringify({ audioStat, rootChildren: r.children.length, bodyBg: getComputedStyle(document.body).backgroundColor });
      })()`).catch(e => JSON.stringify({ probe: 'EXEC-FAIL', msg: String(e).slice(0, 200) }));
      console.log('[DOM]', out);
    }, tailMs));
  }

  if (shotPath) {
    setTimeout(async () => {
      try {
        const im = await win.webContents.capturePage();
        require('fs').writeFileSync(shotPath, im.toPNG());
        console.log('SHOT-OK');
      } catch (e) {
        console.error('shot fail', e);
      }
      app.quit();
    }, tailMs + 1200);
  }
};
