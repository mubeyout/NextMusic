// NextMusic Desktop preload:窗口控制桥 + 文件/下载能力(v1.1.7)
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('nmDesktop', {
  platform: process.platform,
  minimize: () => ipcRenderer.invoke('nm:win', 'min'),
  toggleMaximize: () => ipcRenderer.invoke('nm:win', 'max'),
  close: () => ipcRenderer.invoke('nm:win', 'close'),
  setTbStyle: (style) => ipcRenderer.invoke('nm:tbstyle', style),  // v1.2.3 win:主题感知 overlay
  // v1.1.7 桌面文件能力(SAF/blob-util 的 Electron 对应实现)
  openFile: () => ipcRenderer.invoke('nm:openFile'),
  saveFile: (o) => ipcRenderer.invoke('nm:saveFile', o),   // {path}|null(SAF createDocument 桌面对应)
  pickDir: () => ipcRenderer.invoke('nm:pickDir'),
  download: (opts) => ipcRenderer.invoke('nm:download', opts),
  onProgress: (cb) => {
    const l = (_e, p) => cb(p);
    ipcRenderer.on('nm:dl-progress', l);
    return () => ipcRenderer.removeListener('nm:dl-progress', l);
  },
});
