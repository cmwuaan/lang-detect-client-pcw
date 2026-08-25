import { singleton } from 'tsyringe';

import { ElectronAPI } from '@shared/ipc';
import { IPlatformService, PlatformInfo } from './IPlatformService';

/** Bản desktop — mọi lệnh đi qua preload bridge sang main process. */
@singleton()
export class DesktopPlatformService implements IPlatformService {
	public readonly isDesktop = true;

	private get api(): ElectronAPI {
		const api = window.electronAPI;
		if (!api) throw new Error('electronAPI chưa được preload expose');
		return api;
	}

	public async getInfo(): Promise<PlatformInfo> {
		const info = await this.api.getAppInfo();
		return {
			label: 'Desktop (Electron)',
			details: [
				{ name: 'App', value: info.appVersion },
				{ name: 'Electron', value: info.electronVersion },
				{ name: 'Chromium', value: info.chromeVersion },
				{ name: 'Node', value: info.nodeVersion },
				{ name: 'OS', value: info.osLabel },
				{ name: 'Kiến trúc', value: info.arch },
			],
		};
	}
}
