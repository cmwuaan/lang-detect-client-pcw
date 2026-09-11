import { app, BrowserWindow, ipcMain, shell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

import { AppInfo, IPC } from '@shared/ipc';

import { registerNativeDetectHandlers } from './nativeDetect';
import { osLabel } from './osInfo';

/**
 * Electron trên Windows build ở GUI subsystem: không có console nào gắn vào,
 * nên console.log và stderr rơi vào hư không. Một bản đóng gói không chịu hiện
 * cửa sổ vì thế là hộp đen hoàn toàn — phải có file log mới lần ra được.
 *
 * Ghi vào userData (%APPDATA%\lang-detect\startup.log trên Windows) chứ không
 * ghi cạnh .exe: thư mục app có thể nằm ở chỗ chỉ đọc.
 */
function diag(message: string): void {
	const line = new Date().toISOString() + '  ' + message;
	console.log('[diag] ' + message);
	try {
		fs.appendFileSync(path.join(app.getPath('userData'), 'startup.log'), line + '\n');
	} catch (err) {
		/* Log lỗi mà lại ném thì vô nghĩa. */
	}
}

/**
 * Cửa sổ sinh ra với `show: false` và chỉ hiện khi `ready-to-show` — sự kiện chỉ
 * bắn sau khung hình ĐẦU TIÊN mà renderer vẽ được. Renderer chết (GPU trong máy
 * ảo, thiếu file) là sự kiện không bao giờ bắn: app sống, không lỗi, không cửa
 * sổ. Quá hạn thì cứ hiện, để còn nhìn thấy trang trắng/trang lỗi mà chẩn đoán,
 * thay vì ngồi đoán xem app đã chạy hay chưa.
 */
const SHOW_TIMEOUT_MS = 5000;

function createWindow(): void {
	const win = new BrowserWindow({
		// Đủ cho hai cột của .split (breakpoint 900px) cộng padding của shell.
		// Hẹp hơn thì layout tự xếp dọc, không vỡ.
		width: 1240,
		height: 820,
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

	/*
	 * Link tài liệu (`target="_blank"`) phải mở ở TRÌNH DUYỆT của người dùng.
	 * Không có handler này thì Electron tự mở một BrowserWindow mới — cửa sổ đó
	 * không có thanh địa chỉ, không nút back, và vẫn nằm trong app.
	 *
	 * Chỉ mở http/https: `deny` mọi scheme khác để một URL dựng từ dữ liệu bên
	 * ngoài không gọi được `file://` hay handler tuỳ biến của hệ điều hành.
	 */
	win.webContents.setWindowOpenHandler(function (details) {
		const isWeb = /^https?:\/\//i.test(details.url);
		if (isWeb) void shell.openExternal(details.url);
		else diag('chặn mở URL ngoài http/https: ' + details.url);
		return { action: 'deny' };
	});

	/*
	 * Link không có target="_blank" sẽ điều hướng cả cửa sổ app đi mất. Chặn,
	 * nhưng CHỈ khi khác origin: reload của dev server (cùng origin) phải đi qua
	 * bình thường, không thì mất hot reload.
	 */
	win.webContents.on('will-navigate', function (event, url) {
		const current = win.webContents.getURL();
		let sameOrigin = true;
		try {
			sameOrigin = new URL(url).origin === new URL(current).origin;
		} catch (err) {
			sameOrigin = url === current;
		}
		if (sameOrigin) return;

		event.preventDefault();
		if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
		else diag('chặn điều hướng tới URL ngoài http/https: ' + url);
	});

	let shown = false;
	function show(why: string): void {
		if (shown || win.isDestroyed()) return;
		shown = true;
		diag('hiện cửa sổ (' + why + ')');
		win.show();
	}

	win.once('ready-to-show', function () {
		show('ready-to-show');
	});

	const rescue = setTimeout(function () {
		show('quá ' + SHOW_TIMEOUT_MS + 'ms mà không có ready-to-show');
	}, SHOW_TIMEOUT_MS);
	win.once('closed', function () {
		clearTimeout(rescue);
	});

	win.webContents.on('did-fail-load', function (_e, code, desc, url) {
		diag('did-fail-load ' + code + ' ' + desc + ' <- ' + url);
	});
	win.webContents.on('render-process-gone', function (_e, details) {
		diag('render-process-gone: ' + details.reason + ' exitCode=' + details.exitCode);
	});
	win.webContents.on('preload-error', function (_e, preloadPath, error) {
		diag('preload-error ' + preloadPath + ': ' + error.message);
	});

	if (__DEV__ && __DEV_SERVER_URL__) {
		void win.loadURL(__DEV_SERVER_URL__);
		win.webContents.openDevTools({ mode: 'right' });
	} else {
		const entry = path.join(__dirname, '..', 'renderer', 'index.html');
		diag('loadFile ' + entry);
		// `void` ở đây từng nuốt luôn rejection: file thiếu -> im lặng tuyệt đối.
		win.loadFile(entry).catch(function (err: Error) {
			diag('loadFile hỏng: ' + err.message);
		});
	}

	// Chạy trong máy ảo hay dựng lại bản đóng gói thì bật cờ này để có devtools
	// mà không cần build riêng: set LANGDETECT_DEBUG=1
	if (process.env.LANGDETECT_DEBUG) {
		win.webContents.openDevTools({ mode: 'right' });
		show('LANGDETECT_DEBUG');
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

// Ngoại lệ không bắt được trong main process: Electron in ra stderr, mà stderr
// ở GUI subsystem thì mất hút. Ghi vào log trước đã rồi mới để nó nổ.
process.on('uncaughtException', function (err: Error) {
	diag('uncaughtException: ' + (err.stack || err.message));
	throw err;
});

void app.whenReady().then(function () {
	diag(
		'khởi động — electron=' + process.versions.electron + ' arch=' + process.arch +
			' log=' + app.getPath('userData')
	);
	registerIpcHandlers();
	createWindow();

	app.on('activate', function () {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

app.on('window-all-closed', function () {
	if (process.platform !== 'darwin') app.quit();
});
