// src/main/main.js
// NVECode â€” Electron main process v1.0.2
// Frameless on ALL platforms (Win / Linux / macOS)
// Traffic-light buttons are rendered in renderer via titlebar.js

'use strict';

const {
  app, BrowserWindow, ipcMain, Menu,
  dialog, shell, nativeTheme, screen,
} = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { spawnSync } = require('child_process');

function loadFontSizeManager() {
  const candidates = [
    path.resolve(__dirname, '../../font-size/font-size-manager.js'),
    path.resolve(__dirname, '../font-size/font-size-manager.js'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return require(candidate);
    }
  }

  return null;
}

const fontSizeManager = loadFontSizeManager();

function loadNativeAddon() {
  const candidate = path.resolve(__dirname, '../../build/Release/vecode_native.node');
  if (!fs.existsSync(candidate)) return null;

  try {
    return require(candidate);
  } catch (error) {
    console.warn('Native addon unavailable:', error.message);
    return null;
  }
}

const nativeAddon = loadNativeAddon();
const agentSandbox = require('./agent-sandbox');

const DEFAULT_WINDOW_WIDTH = 1600;
const DEFAULT_WINDOW_HEIGHT = 900;
const WINDOW_STATE_FILE = path.join(app.getPath('userData'), 'window-state.ini');

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

function parseIni(content) {
  const result = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';') || line.startsWith('#') || line.startsWith('[')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    result[key] = value;
  }
  return result;
}

function serializeIni(entries) {
  return ['[window]', ...Object.entries(entries).map(([key, value]) => `${key}=${value}`), ''].join('\n');
}

function getWindowStatePath() {
  fs.mkdirSync(path.dirname(WINDOW_STATE_FILE), { recursive: true });
  return WINDOW_STATE_FILE;
}

function getDefaultWindowState() {
  const { workArea } = screen.getPrimaryDisplay();
  const width = Math.min(DEFAULT_WINDOW_WIDTH, workArea.width);
  const height = Math.min(DEFAULT_WINDOW_HEIGHT, workArea.height);
  const x = workArea.x + Math.max(0, Math.floor((workArea.width - width) / 2));
  const y = workArea.y + Math.max(0, Math.floor((workArea.height - height) / 2));

  return {
    x,
    y,
    width,
    height,
    maximized: false,
    fullscreen: false,
  };
}

function normalizeWindowState(candidate) {
  const defaults = getDefaultWindowState();
  const display = screen.getDisplayMatching({
    x: candidate.x ?? defaults.x,
    y: candidate.y ?? defaults.y,
    width: candidate.width ?? defaults.width,
    height: candidate.height ?? defaults.height,
  });
  const { workArea } = display;

  const width = clamp(Number(candidate.width) || defaults.width, 800, workArea.width);
  const height = clamp(Number(candidate.height) || defaults.height, 560, workArea.height);
  const maxX = workArea.x + Math.max(0, workArea.width - width);
  const maxY = workArea.y + Math.max(0, workArea.height - height);
  const x = clamp(Number(candidate.x) || defaults.x, workArea.x, maxX);
  const y = clamp(Number(candidate.y) || defaults.y, workArea.y, maxY);

  return {
    x,
    y,
    width,
    height,
    maximized: String(candidate.maximized) === 'true',
    fullscreen: String(candidate.fullscreen) === 'true',
  };
}

function loadWindowState() {
  const defaults = getDefaultWindowState();
  try {
    const iniPath = getWindowStatePath();
    if (!fs.existsSync(iniPath)) return defaults;
    const parsed = parseIni(fs.readFileSync(iniPath, 'utf8'));
    return normalizeWindowState(parsed);
  } catch (error) {
    console.warn('Failed to load window-state.ini:', error.message);
    return defaults;
  }
}

function saveWindowState(state) {
  try {
    const iniPath = getWindowStatePath();
    fs.writeFileSync(iniPath, serializeIni({
      x: state.x,
      y: state.y,
      width: state.width,
      height: state.height,
      maximized: state.maximized,
      fullscreen: state.fullscreen,
    }), 'utf8');
  } catch (error) {
    console.warn('Failed to save window-state.ini:', error.message);
  }
}

function captureWindowState(win) {
  const bounds = win.isMaximized() || win.isFullScreen() ? win.getNormalBounds() : win.getBounds();
  return normalizeWindowState({
    ...bounds,
    maximized: win.isMaximized(),
    fullscreen: win.isFullScreen(),
  });
}

function attachWindowStatePersistence(win) {
  let saveTimer = null;

  const queueSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveWindowState(captureWindowState(win));
    }, 150);
  };

  win.on('resize', queueSave);
  win.on('move', queueSave);
  win.on('maximize', queueSave);
  win.on('unmaximize', queueSave);
  win.on('enter-full-screen', queueSave);
  win.on('leave-full-screen', queueSave);
  win.on('close', () => {
    clearTimeout(saveTimer);
    saveWindowState(captureWindowState(win));
  });
}

// â”€â”€â”€ Single instance lock â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

app.setName('NVECode');
app.setAppUserModelId('com.neofilisoft.nvecode');
nativeTheme.themeSource = 'dark';

// â”€â”€â”€ Window registry â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const windows = new Set();

// â”€â”€â”€ Create window â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function createWindow(opts = {}) {
  const persistedState = loadWindowState();
  const {
    width = persistedState.width,
    height = persistedState.height,
    x = persistedState.x,
    y = persistedState.y,
    startMaximized = persistedState.maximized,
    startFullscreen = persistedState.fullscreen,
    filePath = null,
    folderPath = null,
  } = opts;

  const win = new BrowserWindow({
    width,
    height,
    x,
    y,
    minWidth:  800,
    minHeight: 560,

    // â”€â”€ Frameless on every OS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    frame:          false,
    titleBarStyle:  'hidden',          // macOS: hides default title but keeps traffic-lights slot
    titleBarOverlay: false,            // we paint our own buttons everywhere
    trafficLightPosition: { x: -100, y: -100 }, // push native lights off-screen on mac
    // (our custom lights sit at the same visual position via CSS)

    backgroundColor: '#0d1117',
    show: false,
    webPreferences: {
      nodeIntegration:   false,
      contextIsolation:  true,
      preload:           path.join(__dirname, 'preload.js'),
      webviewTag:        true,
      spellcheck:        false,
      sandbox:           false,       // needed to load local workbench resources
    },
    icon: path.join(__dirname, '../../resources/icons/icon.png'),
  });

  // â”€â”€ Load workbench â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const workbenchHtml = path.join(
    __dirname, '../../vscode-source/out/vs/workbench/workbench.desktop.main.html'
  );
  if (fs.existsSync(workbenchHtml)) {
    win.loadFile(workbenchHtml);
  } else {
    // Dev fallback
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  win.once('ready-to-show', () => {
    if (startMaximized) win.maximize();
    if (startFullscreen) win.setFullScreen(true);
    win.show();
    if (process.env.NVECODE_DEV) {
      win.webContents.openDevTools({ mode: 'detach' });
    }
  });

  // Inject NVECode CSS + titlebar after every navigation
  win.webContents.on('did-finish-load', () => {
    injectVecodeUI(win);
    if (filePath) {
      rememberRecentPath(filePath);
      win.webContents.send('open-file', filePath);
      win.webContents.send('open-path', filePath);
    }
    if (folderPath) {
      rememberRecentPath(folderPath);
      win.webContents.send('open-folder', folderPath);
      win.webContents.send('open-path', folderPath);
    }
  });

  win.on('maximize',   () => win.webContents.send('window:state', 'maximized'));
  win.on('unmaximize', () => win.webContents.send('window:state', 'normal'));
  win.on('enter-full-screen', () => win.webContents.send('window:state', 'fullscreen'));
  win.on('leave-full-screen', () => win.webContents.send('window:state', 'normal'));
  win.on('closed', () => windows.delete(win));

  attachWindowStatePersistence(win);
  windows.add(win);
  return win;
}

// â”€â”€â”€ Inject custom UI into the loaded workbench â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function injectVecodeUI(win) {
  const cssPath = path.join(__dirname, '../renderer/vecode-overrides.css');
  const jsPath  = path.join(__dirname, '../renderer/titlebar.js');

  if (fs.existsSync(cssPath)) {
    const fontFaceCss = fontSizeManager?.buildInterFontFaceCss?.(__dirname) || '';
    const css = fontFaceCss + '\\n' + fs.readFileSync(cssPath, 'utf8');
    await win.webContents.insertCSS(css);
  }
  if (fs.existsSync(jsPath)) {
    const js = fs.readFileSync(jsPath, 'utf8');
    await win.webContents.executeJavaScript(js);
  }
}

// â”€â”€â”€ IPC: Window controls â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ipcMain.on('window:minimize', (e) => {
  BrowserWindow.fromWebContents(e.sender)?.minimize();
});
ipcMain.on('window:maximize', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w) return;
  w.isMaximized() ? w.unmaximize() : w.maximize();
});
ipcMain.on('window:close', (e) => {
  BrowserWindow.fromWebContents(e.sender)?.close();
});
ipcMain.on('window:fullscreen', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w) w.setFullScreen(!w.isFullScreen());
});
ipcMain.handle('window:state', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w) return 'normal';
  if (w.isFullScreen()) return 'fullscreen';
  if (w.isMaximized())  return 'maximized';
  return 'normal';
});
ipcMain.handle('window:platform', () => process.platform);

// â”€â”€â”€ IPC: File system â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ipcMain.handle('fs:readFile',  (_, p)       => fs.promises.readFile(p, 'utf8'));
ipcMain.handle('fs:writeFile', (_, p, data) => fs.promises.writeFile(p, data, 'utf8'));
ipcMain.handle('fs:readdir',   (_, p)       =>
  fs.promises.readdir(p, { withFileTypes: true })
    .then(es => es.map(e => ({ name: e.name, isDir: e.isDirectory() })))
);
ipcMain.handle('fs:exists',    (_, p) => fs.promises.access(p).then(() => true).catch(() => false));
ipcMain.handle('fs:mkdir',     (_, p) => fs.promises.mkdir(p, { recursive: true }));
ipcMain.handle('fs:stat',      (_, p) => fs.promises.stat(p).then(s => ({
  size: s.size, mtimeMs: s.mtimeMs, isFile: s.isFile(), isDir: s.isDirectory(),
})));
ipcMain.handle('fs:unlink',    (_, p) => fs.promises.unlink(p));
ipcMain.handle('fs:rename',    (_, src, dst) => fs.promises.rename(src, dst));

// â”€â”€â”€ IPC: Dialogs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const SRC_EXTS = ['c','cpp','cc','cxx','h','hpp','hxx','cs','lua','py','rs',
  'js','ts','jsx','tsx','mjs','rb','php','scala','zig','sql','cmake','md',
  'json','yaml','yml','toml','xml','html','htm','css','sh','bash','zsh',
  'fish','bat','ps1','go','swift','kt','dart','ex','exs','vue','svelte'];

ipcMain.handle('dialog:openFile', async (e, opts = {}) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  return dialog.showOpenDialog(w, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Source Files', extensions: SRC_EXTS },
      { name: 'All Files',    extensions: ['*'] },
    ],
    ...opts,
  });
});
ipcMain.handle('dialog:openFolder', async (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  return dialog.showOpenDialog(w, { properties: ['openDirectory'] });
});
ipcMain.handle('dialog:saveFile', async (e, opts = {}) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  return dialog.showSaveDialog(w, opts);
});
ipcMain.handle('dialog:message', async (e, opts) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  return dialog.showMessageBox(w, opts);
});

// â”€â”€â”€ IPC: Shell â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ipcMain.handle('shell:openExternal',  (_, url) => shell.openExternal(url));
ipcMain.handle('shell:showInFolder',  (_, p)   => shell.showItemInFolder(p));
ipcMain.handle('app:getPath',         (_, n)   => app.getPath(n));
ipcMain.handle('app:getVersion',      ()       => app.getVersion());
ipcMain.handle('os:info', () => ({
  platform: process.platform,
  arch:     process.arch,
  release:  os.release(),
  homedir:  os.homedir(),
  tmpdir:   os.tmpdir(),
  cpus:     os.cpus().length,
  totalmem: os.totalmem(),
  freemem:  os.freemem(),
}));

ipcMain.handle('agent:capabilities', () => agentSandbox.getCapabilities());
ipcMain.handle('agent:list-providers', () => agentSandbox.listProviders());
ipcMain.handle('agent:run-provider', (_, providerId, args, opts) => agentSandbox.runProvider(providerId, args || [], opts || {}));
ipcMain.handle('agent:open-provider-home', (_, providerId) => agentSandbox.openProviderHome(providerId));
ipcMain.handle('tooling:compiler-info', (_, lang = 'cpp') => detectCompilerInfo(lang));
ipcMain.handle('tooling:debugger-info', () => detectDebuggerInfo());

// â”€â”€â”€ IPC: Menu event passthrough â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function sendToFocused(ch, ...a) {
  BrowserWindow.getFocusedWindow()?.webContents.send(ch, ...a);
}

const pendingLaunchPaths = [];

function queueLaunchPath(targetPath) {
  if (!targetPath || !fs.existsSync(targetPath)) return;
  if (!pendingLaunchPaths.includes(targetPath)) pendingLaunchPaths.push(targetPath);
}

function extractLaunchTargets(argv = process.argv) {
  const baseIndex = app.isPackaged ? 1 : 2;
  return argv
    .slice(baseIndex)
    .filter((arg) => arg && !arg.startsWith('-') && fs.existsSync(arg));
}

function rememberRecentPath(targetPath) {
  if (!targetPath || !fs.existsSync(targetPath)) return;

  try {
    app.addRecentDocument(targetPath);
  } catch (_) {
    // Some platforms may ignore recent document registration.
  }

  if (app.isReady()) buildAppMenu();
}

function openPathInWindow(targetPath) {
  if (!targetPath || !fs.existsSync(targetPath)) return null;

  rememberRecentPath(targetPath);
  const stat = fs.statSync(targetPath);
  return createWindow(stat.isDirectory() ? { folderPath: targetPath } : { filePath: targetPath });
}

function getRecentMenuItems() {
  const recentPaths = [...new Set((app.getRecentDocuments?.() || []).filter((value) => value && fs.existsSync(value)))].slice(0, 12);
  if (recentPaths.length === 0) {
    return [{ label: 'No Recent Items', enabled: false }];
  }

  return recentPaths.map((targetPath) => ({
    label: path.basename(targetPath),
    sublabel: targetPath,
    click: () => openPathInWindow(targetPath),
  }));
}

function probeExecutable(command, args = ['--version']) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: 4000,
    windowsHide: true,
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
  return {
    found: !result.error && (result.status === 0 || output.length > 0),
    command,
    version: output.split(/\r?\n/)[0] || '',
  };
}

function detectCompilerInfo(lang = 'cpp') {
  if (nativeAddon && typeof nativeAddon.findCompiler === 'function') {
    try {
      const detected = nativeAddon.findCompiler(lang);
      return {
        provider: 'vecode_native',
        ...detected,
      };
    } catch (error) {
      return { found: false, provider: 'vecode_native', error: error.message };
    }
  }

  const fallback = probeExecutable(process.platform === 'win32' ? 'g++' : 'gcc');
  return {
    provider: 'fallback',
    found: fallback.found,
    cc: fallback.found ? fallback.command : '',
    cxx: fallback.found ? fallback.command : '',
    version: fallback.version,
  };
}

function detectDebuggerInfo() {
  const candidates = [
    { id: 'gdb', command: 'gdb', args: ['--version'] },
    { id: 'lldb', command: 'lldb', args: ['--version'] },
    { id: 'codelldb', command: 'codelldb', args: ['--version'] },
    { id: 'cppvsdbg', command: 'cppvsdbg', args: ['--help'] },
    { id: 'vsdbg', command: 'vsdbg', args: ['--help'] },
  ];

  return candidates.map((candidate) => {
    const result = probeExecutable(candidate.command, candidate.args);
    return {
      id: candidate.id,
      command: candidate.command,
      found: result.found,
      version: result.version,
    };
  });
}

// â”€â”€â”€ Second instance â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.on('second-instance', (_, argv) => {
  const w = [...windows][0];
  if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
});

// â”€â”€â”€ macOS dock click â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.on('activate', () => { if (windows.size === 0) createWindow(); });
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// â”€â”€â”€ Extension manager â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let extManager = null;
try {
  extManager = require('../extensions/extension-manager');
} catch (e) {
  console.warn('Extension manager not available:', e.message);
}

// â”€â”€â”€ Ready â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.whenReady().then(async () => {
  const launchTargets = [...new Set([...pendingLaunchPaths, ...extractLaunchTargets(process.argv)])];
  const bootstrapWindow = launchTargets.length === 0
    ? createWindow()
    : (launchTargets.map((targetPath) => openPathInWindow(targetPath)).find(Boolean) || createWindow());

  buildAppMenu();

  if (extManager) {
    await extManager.init(() => [...windows][0] || bootstrapWindow);
  }
});

// â”€â”€â”€ Native app menu â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function buildAppMenu() {
  const mac = process.platform === 'darwin';
  const closeWindowAccelerator = mac ? 'CmdOrCtrl+Shift+W' : 'Alt+F4';
  const closeFolderAccelerator = mac ? 'CmdOrCtrl+W' : 'Ctrl+F4';
  const openFolderAccelerator = mac ? 'CmdOrCtrl+K' : 'Ctrl+K';

  const tmpl = [
    ...(mac ? [{ label: app.name, submenu: [
      { role: 'about' }, { type: 'separator' },
      { role: 'services' }, { type: 'separator' },
      { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
      { type: 'separator' }, { role: 'quit' },
    ]}] : []),
    { label: 'File', submenu: [
      { label: 'New File...', accelerator: 'CmdOrCtrl+N', click: () => sendToFocused('menu:newFile') },
      { label: 'New Window', accelerator: 'CmdOrCtrl+Shift+N', click: () => createWindow() },
      { type: 'separator' },
      { label: 'Open File...', accelerator: 'CmdOrCtrl+O', click: () => sendToFocused('menu:openFile') },
      { label: 'Open Folder...', accelerator: openFolderAccelerator, click: () => sendToFocused('menu:openFolder') },
      { label: 'Open Recent', submenu: getRecentMenuItems() },
      { type: 'separator' },
      { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => sendToFocused('menu:save') },
      { label: 'Save As...', click: () => sendToFocused('menu:saveAs') },
      { label: 'Save All', click: () => sendToFocused('menu:saveAll') },
      { type: 'separator' },
      { label: 'Close Folder', accelerator: closeFolderAccelerator, click: () => sendToFocused('menu:closeFolder') },
      { label: 'Close Window', accelerator: closeWindowAccelerator, click: () => BrowserWindow.getFocusedWindow()?.close() },
      { type: 'separator' },
      { label: 'Exit', click: () => app.quit() },
    ]},
    { label: 'Edit', submenu: [
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
      { type: 'separator' },
      { label: 'Find', accelerator: 'CmdOrCtrl+F', click: () => sendToFocused('menu:find') },
      { label: 'Replace', accelerator: 'CmdOrCtrl+H', click: () => sendToFocused('menu:replace') },
      { label: 'Format Document', accelerator: 'Shift+Alt+F', click: () => sendToFocused('menu:format') },
    ]},
    { label: 'View', submenu: [
      { label: 'Command Palette', accelerator: 'CmdOrCtrl+Shift+P', click: () => sendToFocused('menu:commandPalette') },
      { label: 'Quick Open', accelerator: 'CmdOrCtrl+P', click: () => sendToFocused('menu:quickOpen') },
      { type: 'separator' },
      { label: 'Toggle Sidebar', accelerator: 'CmdOrCtrl+B', click: () => sendToFocused('menu:toggleSidebar') },
      { label: 'Toggle Terminal', accelerator: 'CmdOrCtrl+`', click: () => sendToFocused('menu:toggleTerminal') },
      { label: 'Toggle Minimap', click: () => sendToFocused('menu:toggleMinimap') },
      { type: 'separator' },
      { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
      ...(process.env.NVECODE_DEV ? [{ type: 'separator' }, { role: 'toggleDevTools' }] : []),
    ]},
    { label: 'Run', submenu: [
      { label: 'Run', accelerator: 'F5', click: () => sendToFocused('menu:run') },
      { label: 'Stop', accelerator: 'Shift+F5', click: () => sendToFocused('menu:stop') },
      { type: 'separator' },
      { label: 'Build', accelerator: 'F7', click: () => sendToFocused('menu:build') },
      { label: 'Debugger', accelerator: 'F9', click: () => sendToFocused('menu:debug') },
    ]},
    { label: 'Help', submenu: [
      { label: 'About NVECode', click: () => {
          const w = BrowserWindow.getFocusedWindow();
          dialog.showMessageBox(w, {
            type: 'info', title: 'NVECode',
            message: 'NVECode',
            detail: [
              'Neofilisoft Visual Editor Code',
              `Version:   ${app.getVersion()}`,
              `Engine:    VSCodium (MIT)`,
              `Electron:  ${process.versions.electron}`,
              `Node:      ${process.versions.node}`,
              `V8:        ${process.versions.v8}`,
              `OS:        ${os.type()} ${os.release()} ${os.arch()}`,
            ].join('\n'),
          });
      }},
      { type: 'separator' },
      { label: 'GitHub Repository', click: () => shell.openExternal('https://github.com/neofilisoft/nvecode') },
      { label: 'Report Issue', click: () => shell.openExternal('https://github.com/neofilisoft/nvecode/issues') },
    ]},
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(tmpl));
}













