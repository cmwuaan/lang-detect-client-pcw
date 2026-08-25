import { singleton } from 'tsyringe';

import {
	AvailabilityStatus,
	LanguageDetector,
	LanguageDetectorCreateOptions,
	LanguageDetectorProvider,
} from '../LanguageDetector';

/**
 * Hình dạng static của `LanguageDetector` mà trình duyệt expose ra global
 * scope. Trùng khớp với interface trong dự án nên không cần adapter.
 */
interface NativeLanguageDetectorStatic {
	availability(options?: LanguageDetectorCreateOptions): Promise<AvailabilityStatus | null>;
	create(options?: LanguageDetectorCreateOptions): Promise<LanguageDetector>;
}

function nativeStatic(): NativeLanguageDetectorStatic | undefined {
	const scope = globalThis as unknown as {
		LanguageDetector?: NativeLanguageDetectorStatic;
	};
	return scope.LanguageDetector;
}

/**
 * Nhận diện bằng Web API `LanguageDetector` của trình duyệt.
 * https://developer.mozilla.org/en-US/docs/Web/API/LanguageDetector
 *
 * Không có thuật toán nào ở đây — toàn bộ việc nhận diện do model của trình
 * duyệt làm; lớp này chỉ chuyển tiếp lời gọi.
 *
 * Yêu cầu Chromium >= 138 và secure context. Đã kiểm chứng có mặt trong:
 *   - Chrome 151 qua http://localhost
 *   - Electron 44 (Chromium 152) qua cả http://localhost lẫn file://
 *     (Chromium coi file:// là secure context)
 *
 * Trên runtime cũ hơn thì global này không tồn tại, availability() trả
 * 'unavailable' và UI báo lựa chọn này không dùng được.
 */
@singleton()
export class BrowserDetectorProvider implements LanguageDetectorProvider {
	public readonly id = 'browser';
	public readonly label = 'Web API của trình duyệt';
	public readonly description =
		'Dùng model có sẵn của trình duyệt qua window.LanguageDetector. Cần Chromium >= 138 và secure context.';

	public availability(
		options?: LanguageDetectorCreateOptions
	): Promise<AvailabilityStatus | null> {
		const api = nativeStatic();
		if (!api) return Promise.resolve('unavailable');

		// availability() có thể ném nếu thẻ ngôn ngữ không hợp lệ; coi như không dùng được.
		return Promise.resolve()
			.then(function () {
				return api.availability(options);
			})
			.catch(function () {
				return 'unavailable' as AvailabilityStatus;
			});
	}

	/**
	 * Chuyển tiếp nguyên vẹn, kể cả `monitor` và `signal`.
	 *
	 * Spec yêu cầu transient activation khi model chưa tải xong, nên caller
	 * phải gọi từ trong một sự kiện do người dùng kích hoạt — nếu không sẽ
	 * nhận NotAllowedError.
	 */
	public create(options?: LanguageDetectorCreateOptions): Promise<LanguageDetector> {
		const api = nativeStatic();
		if (!api) {
			return Promise.reject(new Error('Trình duyệt này không có LanguageDetector API'));
		}
		return api.create(options);
	}
}
