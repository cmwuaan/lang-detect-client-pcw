import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';

import { AppInfo, IPC } from '@shared/ipc';

import { registerNativeDetectHandlers } from './nativeDetect';
import { osLabel } from './osInfo';

function createWindow(): void {
	const win = new BrowserWindow({
		width: 960,
		height: 760,
		minWidth: 640,
		minHeight: 480,
		show: false,
		title: 'Lang Detect',
		backgroundColor: '#f4f4f2',
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'),
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
		win.webContents.openDevTools({ mode: 'right' });
	} else {
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

	registerNativeDetectHandlers(ipcMain);
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
