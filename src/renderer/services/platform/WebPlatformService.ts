import { singleton } from 'tsyringe';

import { IPlatformService, PlatformInfo } from './IPlatformService';

@singleton()
export class WebPlatformService implements IPlatformService {
	public readonly isDesktop = false;

	public getInfo(): Promise<PlatformInfo> {
		return Promise.resolve({
			label: 'Web (browser)',
			details: [
				{ name: 'Origin', value: window.location.origin },
				{ name: 'Ngôn ngữ hệ thống', value: navigator.language },
				{ name: 'User agent', value: navigator.userAgent },
			],
		});
	}
}
