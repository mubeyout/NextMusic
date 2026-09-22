// NextMusic Desktop — Electron 主进程
// 职责：窗口壳 / 媒体流代理(WebDAV 等带 headers 的音频走 HTML5 Audio 无法自定义头,
//       由主进程 net.fetch 转发 Range 请求) / 媒体键由 renderer MediaSession 承担
const { app, BrowserWindow, shell, protocol, net, ipcMain, dialog, Menu } = require('electron');
const { pathToFileURL } = require('url');

// 自定义特权协议:prod 下承载 dist 静态资源(file:// 的 ES module 会被 CORS 拦,nmapp 是标准安全协议)
protocol.registerSchemesAsPrivileged([
  { scheme: 'nmapp', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);
const http = require('http');
const path = require('path');
const dlna = require('./cast-dlna.cjs'); // 桌面投屏:DLNA(SSDP+SOAP 零依赖)
const chromeCast = require('./cast-chrome.cjs'); // Chromecast(bonjour+castv2)
const airplay = process.platform === 'darwin' ? require('./cast-airplay.cjs') : null; // AirPlay 仅 mac(老板指令)
// 事件出口:投屏设备发现/扫描结束 → renderer(polyfills 映射回 NativeEventEmitter 通道)
function castSender(channel, payload) {
  for (const w of BrowserWindow.getAllWindows()) { try { w.webContents.send(channel, payload); } catch { /* ignore */ } }
}
dlna.setSender(castSender);
chromeCast.setSender(castSender);
if (airplay) airplay.setSender(castSender);

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

// v1.2.12b(Leo 验收打回2):菜单栏——win/linux null 根治 Alt 闪;mac 保留系统菜单但给最小中文版
// (原无条件 null 会砍 mac 顶部 Electron 名/Cmd+Q 集成——platform-spec:三平台统一 null,macOS 除外)
if (process.platform === 'darwin') {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu', label: 'NextMusic' },
    { role: 'editMenu', label: '编辑' },
    { role: 'windowMenu', label: '窗口' },
    { role: 'help', label: '帮助' },
  ]));
} else {
  Menu.setApplicationMenu(null);
}
// v1.2.12(Leo P0-4):窗口状态记忆——bounds 持久化(手动,零依赖)
const winStateFile = () => require('path').join(app.getPath('userData'), 'window-state.json');
function loadWinState() {
  try { return JSON.parse(require('fs').readFileSync(winStateFile(), 'utf8')); } catch { return null; }
}
function saveWinState(win) {
  try {
    const b = win.getNormalBounds ? win.getNormalBounds() : win.getBounds();
    require('fs').writeFileSync(winStateFile(), JSON.stringify({ x: b.x, y: b.y, width: b.width, height: b.height, maximized: win.isMaximized() }));
  } catch { /* ignore */ }
}

function createWindow() {
  const saved = loadWinState();
  const win = new BrowserWindow({
    x: saved?.x, y: saved?.y,
    width: Number(process.env.NM_W) || saved?.width || 1440,
    height: Number(process.env.NM_H) || saved?.height || 860,
    minWidth: 1080,
    minHeight: 640,
    backgroundColor: '#121212',
    autoHideMenuBar: true,
    // 无边框融入应用设计:mac 保留系统红绿灯叠放(hiddenInset);win/linux 全无边框(应用内自绘控制钮)
    // v1.2.5 平台窗口策略(A2/W2,轨道 40→36——老板:brand 在导航占太高):
    //  mac: hiddenInset + trafficLightPosition——红绿灯定位进侧栏列顶部(x=20 居 174px 侧栏内,y=11 居 36px 轨道)
    //  win: hidden + titleBarOverlay——无独立标题栏,系统三键原生悬于内容区行尾(悬停/贴边/snap 原生品质)
    //  linux: 全无边框(renderer DOM 三键,同 W2 视觉位)
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 20, y: 11 } }
      : process.platform === 'win32'
        ? { titleBarStyle: 'hidden', titleBarOverlay: { height: 36, color: '#00000000', symbolColor: '#ffffffcc' } }
        : { frame: false }),
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
  // 外链走系统浏览器。但 nmapp:// 是本应用内部特权协议(仅 protocol.handle 消费,从未向 OS 注册)——
  // 误传给 openExternal 在 mac 会弹「未设定用来打开 URL 的应用程序」(0922 老板 mac 实锤),一律拦截丢弃
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('nmapp://') || url.startsWith('file://')) {
      console.log('[open-blocked:internal-scheme]', url);
      return { action: 'deny' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });
  // v1.2.12b(Leo 验收打回1):窗口状态存取移出 dev 分支——正式包同样生效(原先只在 VITE_DEV 内=release 没修)
  win.on('close', () => saveWinState(win));
  if (saved?.maximized) win.maximize(); // 恢复最大化
  if (!app.isPackaged && process.env.VITE_DEV) {
    win.loadURL('http://127.0.0.1:5199');
  } else {
    win.loadURL('nmapp://local/index.html');
  }
}

// 窗口控制 IPC(应用内自绘按钮用)
// v1.2.3 win:主题感知 titleBarOverlay(浅色主题白符号看不清)
ipcMain.handle('nm:tbstyle', (_e, style) => {
  const w = BrowserWindow.getAllWindows()[0];
  try { w?.setTitleBarOverlay(style); } catch { /* 非 win 平台无此 API */ }
});
ipcMain.handle('nm:win', (e, act) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w) return;
  if (act === 'min') w.minimize();
  else if (act === 'max') w.isMaximized() ? w.unmaximize() : w.maximize();
  else if (act === 'close') w.close();
});
// ===== v1.1.7 桌面文件能力:保存/打开对话框 + 主进程下载 =====
const fsmod = require('fs');
const os = require('os');
ipcMain.handle('nm:openFile', async () => {
  const w = BrowserWindow.getAllWindows()[0];
  if (!w) return null;
  const { canceled, filePaths } = await dialog.showOpenDialog(w, {
    properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (canceled || !filePaths.length) return null;
  try { return { path: filePaths[0], text: fsmod.readFileSync(filePaths[0], 'utf8') }; } catch { return null; }
});
ipcMain.handle('nm:saveFile', async (_e, { defaultName, text }) => {
  const w = BrowserWindow.getAllWindows()[0];
  if (!w) return null;
  const { canceled, filePath } = await dialog.showSaveDialog(w, { defaultPath: defaultName, filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (canceled || !filePath) return null;
  try { fsmod.writeFileSync(filePath, String(text), 'utf8'); return { path: filePath }; } catch { return null; }
});
ipcMain.handle('nm:pickDir', async () => {
  const w = BrowserWindow.getAllWindows()[0];
  if (!w) return null;
  const { canceled, filePaths } = await dialog.showOpenDialog(w, { properties: ['openDirectory'] });
  return canceled || !filePaths.length ? null : filePaths[0];
});
// 主进程下载:net.fetch 流式落盘,进度 IPC 回推
ipcMain.handle('nm:download', async (e, { key, url, fileName, saveDir }) => {
  const dir = saveDir || path.join(os.homedir(), 'Music', 'NextMusic');
  fsmod.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, String(fileName).replace(/[\\/:*?"<>|]/g, '_'));
  const w = BrowserWindow.fromWebContents(e.sender);
  try {
    const up = await net.fetch(url);
    if (!up.ok) throw new Error('HTTP ' + up.status);
    const total = Number(up.headers.get('content-length') || 0);
    let received = 0;
    const st = fsmod.createWriteStream(file);
    const reader = up.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      st.write(Buffer.from(value));
      received += value.length;
      if (w && !w.isDestroyed()) w.webContents.send('nm:dl-progress', { key, received, total });
    }
    await new Promise(r => st.end(r));
    return { ok: true, path: file, size: received };
  } catch (err) {
    try { fsmod.unlinkSync(file); } catch { /* ignore */ }
    return { ok: false, error: String(err && err.message || err) };
  }
});

// ---------- 投屏(老板 09-14:桌面版保留投屏) ----------
// renderer 无法开 UDP/组播,发现与控制全在主进程;IPC 带方法名分发,减 boilerplate
ipcMain.handle('nm:cast', async (_e, kind, method, ...args) => {
  try {
    const mod = kind === 'cast' ? chromeCast : kind === 'airplay' ? airplay : dlna;
    if (!mod) return { ok: false, error: 'not available on this platform' };
    const r = await mod[method](...args);
    return { ok: true, r };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
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
  // 探针注入:PROBE 环境变量指向 .cjs,拿首个窗口自驱动验证(不进发布链)
  if (process.env.PROBE) { try { const w = BrowserWindow.getAllWindows()[0]; console.log('[probe-hook] start'); require(process.env.PROBE)(w, app); } catch (e) { console.log('[probe-hook] ERR', e.message, e.stack); } }

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
