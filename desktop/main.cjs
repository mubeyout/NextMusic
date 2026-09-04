// NextMusic Desktop — Electron 主进程
// 职责：窗口壳 / 媒体流代理(WebDAV 等带 headers 的音频走 HTML5 Audio 无法自定义头,
//       由主进程 net.fetch 转发 Range 请求) / 媒体键由 renderer MediaSession 承担
const { app, BrowserWindow, shell, protocol, net, ipcMain } = require('electron');
const { pathToFileURL } = require('url');

// 自定义特权协议:prod 下承载 dist 静态资源(file:// 的 ES module 会被 CORS 拦,nmapp 是标准安全协议)
protocol.registerSchemesAsPrivileged([
  { scheme: 'nmapp', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);
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
    // 无边框融入应用设计:mac 保留系统红绿灯叠放(hiddenInset);win/linux 全无边框(应用内自绘控制钮)
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' } : { frame: false }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // 单机音乐应用直连自建服务器/音乐平台 API，renderer fetch 需免同源限制
      webSecurity: false,
    },
  });
  if (process.env.NM_DRIVER) { try { require('./driver.cjs')(win, app); } catch { console.log('[driver] not bundled, skip'); } }
    // 调试:renderer console 转发到 stdout
  win.webContents.on('console-message', (_e, _l, msg) => { const m = String(msg); if (!/Download the React DevTools/.test(m)) console.log('[web]', m.slice(0, 500)); });
  win.webContents.on('did-fail-load', (_e, code, desc, url) => console.log('[fail-load]', code, desc, url));
  win.webContents.on('render-process-gone', (_e, d) => console.log('[gone]', d.reason));
  // 外链走系统浏览器
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  if (!app.isPackaged && process.env.VITE_DEV) {
    win.loadURL('http://127.0.0.1:5199');
  } else {
    win.loadURL('nmapp://local/index.html');
  }
}

// 窗口控制 IPC(应用内自绘按钮用)
ipcMain.handle('nm:win', (e, act) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w) return;
  if (act === 'min') w.minimize();
  else if (act === 'max') w.isMaximized() ? w.unmaximize() : w.maximize();
  else if (act === 'close') w.close();
});
// 自动播放策略放行(单机音乐应用,无手势也允许出声——WebAudio/HTML5 需要音频上下文立即可用)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

app.whenReady().then(() => {
  // nmapp://local/<path> → dist/<path>
  protocol.handle('nmapp', (req) => {
    const u = new URL(req.url);
    let p = decodeURIComponent(u.pathname).replace(/^\/+/, '');
    if (!p) p = 'index.html';
    const file = path.join(__dirname, '..', 'dist', p);
    return net.fetch(pathToFileURL(file).toString());
  });
  startMediaProxy();
  createWindow();

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
