// src/extensions/extension-manager.js
// NVECode - Extension Manager
// Supports installing extensions from .zip and zip-compatible .zox archives.

'use strict';

const { app, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const USER_DATA_DIR = app.getPath('userData');
const EXTENSIONS_DIR = path.join(USER_DATA_DIR, 'extensions');
const EXTENSIONS_DB = path.join(USER_DATA_DIR, 'extensions.json');
const NATIVE_ADDON = path.join(__dirname, '../../build/Release/vecode_native.node');

fs.mkdirSync(EXTENSIONS_DIR, { recursive: true });

let native = null;
try {
  native = require(NATIVE_ADDON);
} catch (_) {
  native = null;
}

function loadDB() {
  try {
    return JSON.parse(fs.readFileSync(EXTENSIONS_DB, 'utf8'));
  } catch {
    return { installed: {}, disabled: [] };
  }
}

function saveDB(db) {
  fs.writeFileSync(EXTENSIONS_DB, JSON.stringify(db, null, 2), 'utf8');
}

function hashFile(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex').slice(0, 12);
}

function readPackageJson(extDir) {
  const pkgPath = path.join(extDir, 'package.json');
  if (!fs.existsSync(pkgPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch {
    return null;
  }
}

function extDirName(manifest) {
  return `${manifest.publisher || 'local'}.${manifest.name}-${manifest.version}`;
}

function isZipCompatibleArchive(archivePath) {
  const file = fs.openSync(archivePath, 'r');
  try {
    const header = Buffer.alloc(4);
    const bytesRead = fs.readSync(file, header, 0, header.length, 0);
    return bytesRead === 4 && header[0] === 0x50 && header[1] === 0x4b;
  } finally {
    fs.closeSync(file);
  }
}

function escapePowerShellLiteral(value) {
  return value.replace(/'/g, "''");
}

function extractZipArchive(archivePath, destDir) {
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(destDir, { recursive: true });

  try {
    const AdmZip = require('adm-zip');
    new AdmZip(archivePath).extractAllTo(destDir, true);
    return { ok: true, format: 'zip' };
  } catch (_) {
    // Fall through.
  }

  try {
    execFileSync('powershell', [
      '-NoProfile',
      '-Command',
      `Expand-Archive -Force -LiteralPath '${escapePowerShellLiteral(archivePath)}' -DestinationPath '${escapePowerShellLiteral(destDir)}'`,
    ], { stdio: 'pipe' });
    return { ok: true, format: 'zip' };
  } catch (_) {
    // Fall through.
  }

  try {
    execFileSync('tar', ['-xf', archivePath, '-C', destDir], { stdio: 'pipe' });
    return { ok: true, format: 'zip' };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

function extractZoxArchive(archivePath, destDir, password = '') {
  if (isZipCompatibleArchive(archivePath)) {
    return extractZipArchive(archivePath, destDir);
  }

  if (native && typeof native.unzoxExtract === 'function') {
    const result = native.unzoxExtract(archivePath, destDir, password);
    if (result && result.ok) {
      return { ok: true, format: 'zox-native' };
    }
    return result || { ok: false, error: 'Native zox extraction failed' };
  }

  return {
    ok: false,
    error: 'This .zox archive is not zip-compatible and no native UnZOX extractor is available in this build.',
  };
}

function probeZox(zoxPath, password = '') {
  if (isZipCompatibleArchive(zoxPath)) {
    try {
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(zoxPath);
      const entries = zip.getEntries().map((entry, index) => ({
        index,
        path: entry.entryName,
        size: entry.header.size,
      }));
      return { ok: true, zipCompatible: true, entries };
    } catch {
      return { ok: true, zipCompatible: true, entries: [] };
    }
  }

  if (native && typeof native.unzoxProbe === 'function') {
    return native.unzoxProbe(zoxPath, password);
  }

  return { ok: false, error: 'Native zox probing is unavailable in this build.' };
}

function normalizeExtractedTree(tempDir) {
  let manifest = readPackageJson(tempDir);
  if (manifest) {
    return { manifest, normalizedRoot: tempDir };
  }

  const directChildren = fs.readdirSync(tempDir, { withFileTypes: true });
  for (const child of directChildren) {
    if (!child.isDirectory()) continue;
    const childDir = path.join(tempDir, child.name);
    manifest = readPackageJson(childDir);
    if (!manifest) continue;

    for (const name of fs.readdirSync(childDir)) {
      fs.renameSync(path.join(childDir, name), path.join(tempDir, name));
    }
    fs.rmdirSync(childDir);
    return { manifest, normalizedRoot: tempDir };
  }

  return { manifest: null, normalizedRoot: tempDir };
}

function isSupportedEngine(manifest) {
  const engines = manifest.engines || {};
  return Boolean(engines.nvecode || engines.vscode || engines.forge);
}

async function installFromFile(archivePath, password = '') {
  const ext = path.extname(archivePath).toLowerCase();
  const tmpDir = path.join(EXTENSIONS_DIR, `.tmp_${hashFile(archivePath)}`);
  fs.rmSync(tmpDir, { recursive: true, force: true });

  let extraction;
  if (ext === '.zip') {
    extraction = extractZipArchive(archivePath, tmpDir);
  } else if (ext === '.zox') {
    extraction = extractZoxArchive(archivePath, tmpDir, password);
  } else {
    return { ok: false, error: `Unsupported archive format: ${ext}. Use .zip or .zox.` };
  }

  if (!extraction.ok) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return extraction;
  }

  const { manifest } = normalizeExtractedTree(tmpDir);
  if (!manifest || !manifest.name || !manifest.version) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return { ok: false, error: 'Invalid extension: missing package.json or name/version fields.' };
  }

  if (!isSupportedEngine(manifest)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return { ok: false, error: 'package.json must declare engines.nvecode, engines.vscode, or engines.forge.' };
  }

  const dirName = extDirName(manifest);
  const finalDir = path.join(EXTENSIONS_DIR, dirName);
  fs.rmSync(finalDir, { recursive: true, force: true });
  fs.renameSync(tmpDir, finalDir);

  const db = loadDB();
  db.installed[dirName] = {
    name: manifest.name,
    version: manifest.version,
    publisher: manifest.publisher || 'local',
    displayName: manifest.displayName || manifest.name,
    description: manifest.description || '',
    installedAt: Date.now(),
    path: finalDir,
    source: ext,
  };
  saveDB(db);

  return { ok: true, dirName, manifest, extractedAs: extraction.format || ext.slice(1) };
}

function uninstall(dirName) {
  const extDir = path.join(EXTENSIONS_DIR, dirName);
  fs.rmSync(extDir, { recursive: true, force: true });
  const db = loadDB();
  delete db.installed[dirName];
  saveDB(db);
  return { ok: true };
}

function listInstalled() {
  const db = loadDB();
  return Object.entries(db.installed).map(([id, meta]) => ({ id, ...meta }));
}

async function scanDropFolder() {
  const results = [];
  for (const file of fs.readdirSync(EXTENSIONS_DIR)) {
    const ext = path.extname(file).toLowerCase();
    if (ext !== '.zip' && ext !== '.zox') continue;
    const fullPath = path.join(EXTENSIONS_DIR, file);
    const result = await installFromFile(fullPath);
    if (result.ok) {
      fs.unlinkSync(fullPath);
      results.push({ file, ...result });
    }
  }
  return results;
}

let watcher = null;
function startDropWatcher(win) {
  try {
    const chokidar = require('chokidar');
    watcher = chokidar.watch(EXTENSIONS_DIR, {
      ignored: /(^|[/\\])\..|(node_modules)/,
      persistent: true,
      depth: 0,
    });
    watcher.on('add', async (filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      if (ext !== '.zip' && ext !== '.zox') return;
      await new Promise((resolve) => setTimeout(resolve, 800));
      const result = await installFromFile(filePath);
      if (result.ok) {
        fs.unlinkSync(filePath);
        win?.webContents.send('extension:installed', result);
      } else {
        win?.webContents.send('extension:install-error', result);
      }
    });
  } catch {
    setInterval(async () => {
      const dropped = await scanDropFolder();
      if (dropped.length > 0) {
        win?.webContents.send('extension:installed-batch', dropped);
      }
    }, 3000);
  }
}

function registerIPC(getMainWindow) {
  ipcMain.handle('ext:list', () => listInstalled());
  ipcMain.handle('ext:install-dialog', async () => {
    const win = getMainWindow();
    const { filePaths, canceled } = await dialog.showOpenDialog(win, {
      title: 'Install Extension',
      filters: [
        { name: 'NVECode Extensions', extensions: ['zip', 'zox'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });
    if (canceled || !filePaths[0]) return { ok: false, error: 'Cancelled' };
    return installFromFile(filePaths[0]);
  });
  ipcMain.handle('ext:install-file', async (_, archivePath, password) => installFromFile(archivePath, password || ''));
  ipcMain.handle('ext:uninstall', (_, dirName) => uninstall(dirName));
  ipcMain.handle('ext:open-folder', () => {
    shell.openPath(EXTENSIONS_DIR);
    return EXTENSIONS_DIR;
  });
  ipcMain.handle('ext:probe-zox', async (_, zoxPath, password) => probeZox(zoxPath, password || ''));
  ipcMain.handle('ext:get-dir', () => EXTENSIONS_DIR);
}

async function init(getMainWindow) {
  await scanDropFolder();
  startDropWatcher(getMainWindow());
  registerIPC(getMainWindow);
}

module.exports = {
  init,
  installFromFile,
  uninstall,
  listInstalled,
  scanDropFolder,
  probeZox,
  EXTENSIONS_DIR,
};
