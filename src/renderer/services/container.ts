import { container, InjectionToken } from 'tsyringe';

import { LanguageDetectorProvider } from './detection/LanguageDetector';
import { BrowserDetectorProvider } from './detection/providers/BrowserDetectorProvider';
import { HybridDetectorProvider } from './detection/providers/HybridDetectorProvider';
import { NativeDetectorProvider } from './detection/providers/NativeDetectorProvider';
import { ScriptDetectorProvider } from './detection/providers/ScriptDetectorProvider';
import { TrigramDetectorProvider } from './detection/providers/TrigramDetectorProvider';
import { DesktopPlatformService } from './platform/DesktopPlatformService';
import { IPlatformService } from './platform/IPlatformService';
import { WebPlatformService } from './platform/WebPlatformService';
import { TOKENS } from './tokens';

export function configureContainer(): void {
	const isDesktop = !!window.electronAPI;

	/**
	 * Thứ tự đăng ký = thứ tự chip trên UI, và phần tử đầu là lựa chọn mặc định.
	 *
	 * Web đặt browser trước: Chrome/Edge >= 138 có Web API LanguageDetector.
	 * Desktop đặt native trước: Electron 22 là Chromium 108, không có API đó, nên
	 * mặc định phải là phương pháp thật sự dùng được.
	 */
	const detectorProviders: InjectionToken<LanguageDetectorProvider>[] = isDesktop
		? [
				NativeDetectorProvider,
				BrowserDetectorProvider,
				HybridDetectorProvider,
				TrigramDetectorProvider,
				ScriptDetectorProvider,
			]
		: [
				BrowserDetectorProvider,
				NativeDetectorProvider,
				HybridDetectorProvider,
				TrigramDetectorProvider,
				ScriptDetectorProvider,
			];

	detectorProviders.forEach(function (provider) {
		container.register<LanguageDetectorProvider>(TOKENS.LanguageDetectorProvider, {
			useToken: provider,
		});
	});

	const platform = isDesktop ? DesktopPlatformService : WebPlatformService;

	container.register<IPlatformService>(TOKENS.PlatformService, { useToken: platform });
}

export { container };
