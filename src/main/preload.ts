import { contextBridge, ipcRenderer } from 'electron';

import {
	AppInfo,
	ElectronAPI,
	IPC,
	NativeDetectStatus,
	NativeLanguageHypothesis,
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
		detect: function (text: string): Promise<NativeLanguageHypothesis[]> {
			return ipcRenderer.invoke(IPC.nativeDetect, text) as Promise<NativeLanguageHypothesis[]>;
		},
		raw: function (): Promise<NativeRawSnapshot> {
			return ipcRenderer.invoke(IPC.nativeDetectRaw) as Promise<NativeRawSnapshot>;
		},
	},
};

contextBridge.exposeInMainWorld('electronAPI', api);
