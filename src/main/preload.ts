import { contextBridge, ipcRenderer } from 'electron';

import {
	AppInfo,
	ElectronAPI,
	IPC,
	NativeDetectStatus,
	NativeLanguageHypothesis,
} from '@shared/ipc';

const api: ElectronAPI = {
	getAppInfo: function (): Promise<AppInfo> {
		return ipcRenderer.invoke(IPC.getAppInfo) as Promise<AppInfo>;
	},

	nativeDetect: {
		status: function (): Promise<NativeDetectStatus> {
			return ipcRenderer.invoke(IPC.nativeDetectStatus) as Promise<NativeDetectStatus>;
		},
		detect: function (text: string, maxResults?: number): Promise<NativeLanguageHypothesis[]> {
			return ipcRenderer.invoke(IPC.nativeDetect, text, maxResults) as Promise<
				NativeLanguageHypothesis[]
			>;
		},
	},
};

contextBridge.exposeInMainWorld('electronAPI', api);
