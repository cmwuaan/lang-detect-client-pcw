import { app, BrowserWindow, ipcMain, shell } from 'electron';
import * as path from 'path';

import { AppInfo, IPC } from '@shared/ipc';

import { osLabel } from './osInfo';

function createWindow(): void {
  const win = new BrowserWindow({
    width: 960,
    height: 760,
    minWidth: 640,
    minHeight: 480,
    show: false,
    title: 'Lang Detect',
    backgroundColor: '#111112',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // Renderer là trang browser thuần: không có Node API. Mọi thứ cần quyền
      // hệ thống phải đi qua IPC bên dưới.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('ready-to-show', function () {
    win.show();
  });

  if (__DEV__ && __DEV_SERVER_URL__) {
    void win.loadURL(__DEV_SERVER_URL__);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    // dist/main/main.js -> dist/renderer/index.html
    void win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC.getAppInfo, function (): AppInfo {
    return {
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      nodeVersion: process.versions.node,
      platform: process.platform,
      osLabel: osLabel(),
      arch: process.arch,
    };
  });

  ipcMain.handle(IPC.openExternal, async function (_event, url: string): Promise<void> {
    // Chỉ cho phép http/https, tránh biến IPC này thành đường mở file://
    // hay scheme lạ từ phía renderer.
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Scheme không được phép: ' + parsed.protocol);
    }
    await shell.openExternal(parsed.toString());
  });
}

void app.whenReady().then(function () {
  registerIpcHandlers();
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
