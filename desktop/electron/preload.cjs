// NextMusic Desktop preload:窗口控制桥(contextIsolation 保持开启)
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('nmDesktop', {
  platform: process.platform,
  minimize: () => ipcRenderer.invoke('nm:win', 'min'),
  toggleMaximize: () => ipcRenderer.invoke('nm:win', 'max'),
  close: () => ipcRenderer.invoke('nm:win', 'close'),
});
