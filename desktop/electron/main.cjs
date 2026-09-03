// NextMusic Desktop — Electron 主进程
// 职责：窗口壳 / 媒体流代理(WebDAV 等带 headers 的音频走 HTML5 Audio 无法自定义头,
//       由主进程 net.fetch 转发 Range 请求) / 媒体键由 renderer MediaSession 承担
const { app, BrowserWindow, shell } = require('electron');
const http = require('http');
const path = require('path');

const PROXY_PORT = 5198;

function startMediaProxy() {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, `http://127.0.0.1:${PROXY_PORT}`);
    if (u.pathname !== '/__media__') { res.writeHead(404).end(); return; }
    const target = u.searchParams.get('u') || '';
    let headers = {};
    try { headers = JSON.parse(u.searchParams.get('h') || '{}'); } catch { /* ignore */ }
    const range = req.headers['range'];
    const fwd = { ...headers };
    if (range) fwd['Range'] = range;
    const controller = new AbortController();
    req.on('close', () => controller.abort());
    fetch(target, { headers: fwd, signal: controller.signal }).then(up => {
      const hs = {};
      up.headers.forEach((v, k) => { if (k !== 'transfer-encoding') hs[k] = v; });
      res.writeHead(up.status, hs);
      // 流式管道
      const body = up.body;
      if (body) body.pipeTo(new WritableStream({ write: chunk => res.write(chunk) })).then(() => res.end()).catch(() => res.end());
      else res.end();
    }).catch(() => { try { res.writeHead(502).end(); } catch { /* closed */ } });
  });
  server.listen(PROXY_PORT, '127.0.0.1');
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 860,
    minWidth: 1080,
    minHeight: 640,
    backgroundColor: '#121212',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // 单机音乐应用直连自建服务器/音乐平台 API，renderer fetch 需免同源限制
      webSecurity: false,
    },
  });
  // 调试:renderer console 转发到 stdout
  win.webContents.on('console-message', (_e, _l, msg) => { const m = String(msg); if (!/Download the React DevTools/.test(m)) console.log('[web]', m.slice(0, 500)); });
  win.webContents.on('did-fail-load', (_e, code, desc, url) => console.log('[fail-load]', code, desc, url));
  win.webContents.on('render-process-gone', (_e, d) => console.log('[gone]', d.reason));
  // 外链走系统浏览器
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  if (!app.isPackaged && process.env.VITE_DEV) {
    win.loadURL('http://127.0.0.1:5199');
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
  // 调试:DOM 摘要(root 子树规模/尺寸/背景)
  if (process.env.NM_SHOT) win.webContents.once('did-finish-load', () => setTimeout(async () => {
    const dom = await win.webContents.executeJavaScript(`(() => {
      const r = document.getElementById('root');
      if (!r) return 'NO-ROOT';
      const first = r.firstElementChild;
      const cs = first ? getComputedStyle(first) : null;
      const sc = document.querySelector('script[type=module]');
      let fetchStat = 'no-script';
      if (sc) { try { const x = new XMLHttpRequest(); x.open('GET', sc.getAttribute('src'), false); x.send(); fetchStat = x.status; } catch (e) { fetchStat = 'ERR ' + e.message; } }
      return JSON.stringify({scriptSrc: sc && sc.getAttribute('src'), fetchStat, rootChildren: r.children.length, firstTag: first && first.tagName,
        firstSize: first ? first.offsetWidth + 'x' + first.offsetHeight : '',
        firstBg: cs && cs.backgroundColor, firstColor: cs && cs.color,
        bodyBg: getComputedStyle(document.body).backgroundColor, html: r.innerHTML.slice(0, 1600)});
    })()`).catch(e => 'EXEC-FAIL ' + e.message);
    console.log('[DOM]', String(dom).slice(0, 2200));
  }, 3500));
  // 交互驱动:NM_CLICK='x,y;x,y'(分号多步,每步间隔1.2s)
  if (process.env.NM_CLICK) {
    const steps = process.env.NM_CLICK.split(';').map(p => p.split(',').map(Number));
    steps.forEach(([x, y], i) => setTimeout(() => {
      win.webContents.sendInputEvent({ type: 'mouseMove', x, y });
      win.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
      win.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
      console.log('[click]', x, y);
    }, 1500 + i * 1400));
  }
  // 调试截图:NM_SHOT=/path.png 时加载 4.5s 后 capturePage 退出(无头验证渲染)
  if (process.env.NM_SHOT) setTimeout(async () => {
    try { const im = await win.webContents.capturePage(); require('fs').writeFileSync(process.env.NM_SHOT, im.toPNG()); console.log('SHOT-OK'); } catch (e) { console.error('shot fail', e); }
    app.quit();
  }, 4500);
}

app.whenReady().then(() => {
  startMediaProxy();
  createWindow();

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
