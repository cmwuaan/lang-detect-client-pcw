/** Hợp đồng dùng chung giữa main process, preload và renderer. */

export interface AppInfo {
  appVersion: string;
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
  /** `process.platform` thô — 'darwin' | 'win32' | 'linux'. Dùng cho logic. */
  platform: string;
  /** Nhãn để hiển thị: 'macOS 15.5', 'Windows 11 (build 22631)', 'Linux 6.8.0'. */
  osLabel: string;
  /** Kiến trúc CPU: 'x64' | 'arm64'. */
  arch: string;
}

export const IPC = {
  getAppInfo: 'app:get-info',
  openExternal: 'app:open-external',
};

/** API mà preload expose ra `window.electronAPI`. */
export interface ElectronAPI {
  getAppInfo(): Promise<AppInfo>;
  openExternal(url: string): Promise<void>;
}
