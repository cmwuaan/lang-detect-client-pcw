import { contextBridge, ipcRenderer } from 'electron';

import {
	AppInfo,
	ElectronAPI,
	IPC,
	NativeDetection,
	NativeDetectOptions,
	NativeDetectStatus,
	NativeRawSnapshot,
} from '@shared/ipc';

const api: ElectronAPI = {
	getAppInfo: function (): Promise<AppInfo> {
		return ipcRenderer.invoke(IPC.getAppInfo) as Promise<AppInfo>;
	},

	nativeDetect: {
		status: function (): Promise<NativeDetectStatus> {
			return ipcRenderer.invoke(IPC.nativeDetectStatus) as Promise<NativeDetectStatus>;
		},
		detect: function (options: NativeDetectOptions): Promise<NativeDetection> {
			return ipcRenderer.invoke(IPC.nativeDetect, options) as Promise<NativeDetection>;
		},
		raw: function (): Promise<NativeRawSnapshot> {
			return ipcRenderer.invoke(IPC.nativeDetectRaw) as Promise<NativeRawSnapshot>;
		},
	},
};

contextBridge.exposeInMainWorld('electronAPI', api);
