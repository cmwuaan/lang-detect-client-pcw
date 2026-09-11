import { container } from 'tsyringe';

import { LanguageDetectorProvider } from './detection/LanguageDetector';
import { NativeDetectorProvider } from './detection/providers/NativeDetectorProvider';
import { ZDetectProvider } from './detection/providers/ZDetectProvider';
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
 *   web      ZDetectProvider — bộ detector thuần JS của repo (weblibs/zdetect),
 *            dùng BẢN ĐÃ BUILD ở dist/. Không chọn Web API LanguageDetector của
 *            trình duyệt vì nó đòi Chromium >= 138 và hành vi khác nhau giữa các
 *            máy; zdetect cho kết quả giống nhau ở mọi nơi, không cần tải model.
 *
 * Vì sao bỏ việc cho chọn: hai môi trường không có giao điểm nào dùng được, nên
 * cái "menu" cũ chỉ bày ra những lựa chọn mà bấm vào là hỏng. UI giờ chỉ *báo*
 * đang chạy bằng gì.
 *
 * Chỉ còn ĐÚNG HAI provider trong repo, mỗi nền tảng một cái. Các stub trước đây
 * (Browser/Hybrid/Trigram/Script) đã xoá: chúng không được đăng ký, không được
 * triển khai, và để lại chỉ khiến người đọc tưởng có lựa chọn.
 */
export function configureContainer(): void {
	const isDesktop = !!window.electronAPI;

	container.register<LanguageDetectorProvider>(TOKENS.LanguageDetectorProvider, {
		useToken: isDesktop ? NativeDetectorProvider : ZDetectProvider,
	});

	container.register<IPlatformService>(TOKENS.PlatformService, {
		useToken: isDesktop ? DesktopPlatformService : WebPlatformService,
	});
}

export { container };
