import { singleton } from 'tsyringe';

import {
  AvailabilityStatus,
  LanguageDetector,
  LanguageDetectorCreateOptions,
  LanguageDetectorProvider,
} from '../LanguageDetector';

/** Hình dạng static của `LanguageDetector` mà trình duyệt expose ra global. */
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
 * Uỷ quyền cho Web API `LanguageDetector` của trình duyệt — không có thuật
 * toán nào ở đây, chỉ chuyển tiếp. Chạy được vì interface trong dự án đặt tên
 * khớp Web API.
 *
 * Electron 22 nhúng Chromium 108 nên global này KHÔNG tồn tại; lúc đó
 * availability() trả 'unavailable' và UI sẽ vô hiệu hoá lựa chọn này.
 */
@singleton()
export class BrowserDetectorProvider implements LanguageDetectorProvider {
  public readonly id = 'browser';
  public readonly label = 'Web API của trình duyệt';
  public readonly description =
    'Uỷ quyền cho window.LanguageDetector. Cần Chrome/Edge đủ mới; Electron 22 (Chromium 108) chưa có.';

  public availability(
    options?: LanguageDetectorCreateOptions
  ): Promise<AvailabilityStatus | null> {
    const api = nativeStatic();
    if (!api) return Promise.resolve('unavailable');
    return api.availability(options);
  }

  public create(options?: LanguageDetectorCreateOptions): Promise<LanguageDetector> {
    const api = nativeStatic();
    if (!api) {
      return Promise.reject(new Error('Trình duyệt này không có LanguageDetector API'));
    }
    return api.create(options);
  }
}
