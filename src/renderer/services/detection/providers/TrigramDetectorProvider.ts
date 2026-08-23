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
 * Phương pháp 2 — so tần suất trigram với profile từng thứ tiếng.
 *
 * TODO: implement. Lưu ý out-of-place distance kiểu Cavnar–Trenkle cần profile
 * 300–400 trigram mỗi thứ tiếng; profile nhỏ hơn thì hình phạt cho trigram
 * không khớp sẽ nhấn chìm mọi khác biệt giữa các thứ tiếng.
 */
@singleton()
export class TrigramDetectorProvider implements LanguageDetectorProvider {
  public readonly id = 'trigram';
  public readonly label = 'Trigram n-gram';
  public readonly description =
    'So tần suất trigram với profile từng thứ tiếng. Tách được các thứ tiếng Latin.';

  public availability(_options?: LanguageDetectorCreateOptions): Promise<AvailabilityStatus | null> {
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
