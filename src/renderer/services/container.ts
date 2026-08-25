import { container } from 'tsyringe';

import { LanguageDetectorProvider } from './detection/LanguageDetector';
import { BrowserDetectorProvider } from './detection/providers/BrowserDetectorProvider';
import { HybridDetectorProvider } from './detection/providers/HybridDetectorProvider';
import { ScriptDetectorProvider } from './detection/providers/ScriptDetectorProvider';
import { TrigramDetectorProvider } from './detection/providers/TrigramDetectorProvider';
import { DesktopPlatformService } from './platform/DesktopPlatformService';
import { IPlatformService } from './platform/IPlatformService';
import { WebPlatformService } from './platform/WebPlatformService';
import { TOKENS } from './tokens';

export function configureContainer(): void {
	container.register<LanguageDetectorProvider>(TOKENS.LanguageDetectorProvider, {
		useToken: BrowserDetectorProvider,
	});
	container.register<LanguageDetectorProvider>(TOKENS.LanguageDetectorProvider, {
		useToken: HybridDetectorProvider,
	});
	container.register<LanguageDetectorProvider>(TOKENS.LanguageDetectorProvider, {
		useToken: TrigramDetectorProvider,
	});
	container.register<LanguageDetectorProvider>(TOKENS.LanguageDetectorProvider, {
		useToken: ScriptDetectorProvider,
	});

	const platform = window.electronAPI ? DesktopPlatformService : WebPlatformService;

	container.register<IPlatformService>(TOKENS.PlatformService, { useToken: platform });
}

export { container };
