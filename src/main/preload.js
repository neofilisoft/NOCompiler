// src/main/preload.js
// Secure contextBridge - exposes typed APIs to renderer
// No raw Node/Electron modules are exposed

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vecodeWindow', {
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  fullscreen: () => ipcRenderer.send('window:fullscreen'),
  getState: () => ipcRenderer.invoke('window:state'),
  getPlatform: () => ipcRenderer.invoke('window:platform'),
  onStateChange: (cb) => {
    const fn = (_, state) => cb(state);
    ipcRenderer.on('window:state', fn);
    return () => ipcRenderer.removeListener('window:state', fn);
  },
});

contextBridge.exposeInMainWorld('vecodeFS', {
  readFile: (p) => ipcRenderer.invoke('fs:readFile', p),
  writeFile: (p, data) => ipcRenderer.invoke('fs:writeFile', p, data),
  readdir: (p) => ipcRenderer.invoke('fs:readdir', p),
  exists: (p) => ipcRenderer.invoke('fs:exists', p),
  mkdir: (p) => ipcRenderer.invoke('fs:mkdir', p),
  stat: (p) => ipcRenderer.invoke('fs:stat', p),
  unlink: (p) => ipcRenderer.invoke('fs:unlink', p),
  rename: (src, dst) => ipcRenderer.invoke('fs:rename', src, dst),
});

contextBridge.exposeInMainWorld('vecodeDialog', {
  openFile: (opts) => ipcRenderer.invoke('dialog:openFile', opts),
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  saveFile: (opts) => ipcRenderer.invoke('dialog:saveFile', opts),
  message: (opts) => ipcRenderer.invoke('dialog:message', opts),
});

contextBridge.exposeInMainWorld('vecodeShell', {
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  showInFolder: (p) => ipcRenderer.invoke('shell:showInFolder', p),
  getAppPath: (n) => ipcRenderer.invoke('app:getPath', n),
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  osInfo: () => ipcRenderer.invoke('os:info'),
});

contextBridge.exposeInMainWorld('vecodeAgents', {
  capabilities: () => ipcRenderer.invoke('agent:capabilities'),
  listProviders: () => ipcRenderer.invoke('agent:list-providers'),
  runProvider: (providerId, args, opts) => ipcRenderer.invoke('agent:run-provider', providerId, args, opts),
  openProviderHome: (providerId) => ipcRenderer.invoke('agent:open-provider-home', providerId),
});

contextBridge.exposeInMainWorld('vecodeTools', {
  compilerInfo: (lang) => ipcRenderer.invoke('tooling:compiler-info', lang),
  debuggerInfo: () => ipcRenderer.invoke('tooling:debugger-info'),
});

const ALLOWED_CHANNELS = new Set([
  'menu:newFile', 'menu:newWindow', 'menu:openFile', 'menu:openFolder',
  'menu:save', 'menu:saveAs', 'menu:saveAll', 'menu:closeFolder',
  'menu:find', 'menu:replace', 'menu:format',
  'menu:commandPalette', 'menu:quickOpen',
  'menu:toggleSidebar', 'menu:toggleTerminal', 'menu:toggleMinimap',
  'menu:run', 'menu:stop', 'menu:build', 'menu:debug',
  'open-file', 'open-folder', 'open-path',
]);

contextBridge.exposeInMainWorld('vecodeMenu', {
  on: (channel, cb) => {
    if (!ALLOWED_CHANNELS.has(channel)) return () => {};
    const fn = (_, ...args) => cb(...args);
    ipcRenderer.on(channel, fn);
    return () => ipcRenderer.removeListener(channel, fn);
  },
});
