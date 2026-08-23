import { singleton } from 'tsyringe';

import {
  AvailabilityStatus,
  LanguageDetectionResult,
  LanguageDetector,
  LanguageDetectorCreateOptions,
  LanguageDetectorProvider,
} from '../LanguageDetector';
import { createStubDetector } from './stubDetector';

/**
 * Phương pháp 1 — dựa vào hệ chữ viết (khối Unicode).
 *
 * TODO: implement. Gợi ý: đếm ký tự theo khối Unicode (Han, Kana, Hangul, Thai,
 * Cyrillic, Arabic…), lấy khối chiếm đa số rồi map sang thẻ BCP 47.
 */
@singleton()
export class ScriptDetectorProvider implements LanguageDetectorProvider {
  public readonly id = 'script';
  public readonly label = 'Hệ chữ viết';
  public readonly description =
    'Đếm ký tự theo khối Unicode. Nhanh, nhưng mọi thứ tiếng Latin đều ra như nhau.';

  public availability(_options?: LanguageDetectorCreateOptions): Promise<AvailabilityStatus | null> {
    // Thuật toán cục bộ, không phải tải model.
    return Promise.resolve('available');
  }

  public create(options?: LanguageDetectorCreateOptions): Promise<LanguageDetector> {
    return Promise.resolve(
      createStubDetector(options, function (_input: string): LanguageDetectionResult[] {
        return [];
      })
    );
  }
}
