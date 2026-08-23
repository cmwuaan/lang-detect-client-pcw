import { contextBridge, ipcRenderer } from 'electron';

import { AppInfo, ElectronAPI, IPC } from '@shared/ipc';

/**
 * Preload là ranh giới tin cậy duy nhất giữa renderer và main process.
 * Chỉ expose đúng các hàm khai báo trong ElectronAPI — không expose
 * `ipcRenderer` thô, vì như vậy renderer sẽ gọi được mọi channel.
 */
const api: ElectronAPI = {
  getAppInfo: function (): Promise<AppInfo> {
    return ipcRenderer.invoke(IPC.getAppInfo) as Promise<AppInfo>;
  },
  openExternal: function (url: string): Promise<void> {
    return ipcRenderer.invoke(IPC.openExternal, url) as Promise<void>;
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
