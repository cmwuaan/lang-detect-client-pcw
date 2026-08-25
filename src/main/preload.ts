import { contextBridge, ipcRenderer } from 'electron';

import { AppInfo, ElectronAPI, IPC } from '@shared/ipc';

const api: ElectronAPI = {
	getAppInfo: function (): Promise<AppInfo> {
		return ipcRenderer.invoke(IPC.getAppInfo) as Promise<AppInfo>;
	},
};

contextBridge.exposeInMainWorld('electronAPI', api);
