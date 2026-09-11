import { container } from 'tsyringe';

import { LanguageDetectorProvider } from './detection/LanguageDetector';
import { BrowserDetectorProvider } from './detection/providers/BrowserDetectorProvider';
import { NativeDetectorProvider } from './detection/providers/NativeDetectorProvider';
import { DesktopPlatformService } from './platform/DesktopPlatformService';
import { IPlatformService } from './platform/IPlatformService';
import { WebPlatformService } from './platform/WebPlatformService';
import { TOKENS } from './tokens';

/**
 * Đăng ký ĐÚNG MỘT provider — nền tảng quyết định, người dùng không chọn.
 *
 *   desktop  NativeDetectorProvider  — model của hệ điều hành (macOS: Apple
 *            NaturalLanguage; Windows: Extended Linguistic Services). Electron
 *            22 là Chromium 108, không có Web API LanguageDetector, nên native
 *            là thứ duy nhất thật sự chạy được.
 *   web      BrowserDetectorProvider — hạ tầng của trình duyệt. Bản web không
 *            có bridge sang native, nên cũng chỉ có một lựa chọn.
 *
 * Vì sao bỏ việc cho chọn: hai môi trường không có giao điểm nào dùng được, nên
 * cái "menu" cũ chỉ bày ra những lựa chọn mà bấm vào là hỏng. UI giờ chỉ *báo*
 * đang chạy bằng gì.
 *
 * Các provider còn lại (Hybrid/Trigram/Script) vẫn nằm trong repo nhưng KHÔNG
 * đăng ký — chúng là stub cho hướng đi sau, không phải lựa chọn của người dùng.
 */
export function configureContainer(): void {
	const isDesktop = !!window.electronAPI;

	container.register<LanguageDetectorProvider>(TOKENS.LanguageDetectorProvider, {
		useToken: isDesktop ? NativeDetectorProvider : BrowserDetectorProvider,
	});

	container.register<IPlatformService>(TOKENS.PlatformService, {
		useToken: isDesktop ? DesktopPlatformService : WebPlatformService,
	});
}

export { container };
