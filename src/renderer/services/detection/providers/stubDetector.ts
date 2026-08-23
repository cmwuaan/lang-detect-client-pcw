import {
  LanguageDetectionResult,
  LanguageDetector,
  LanguageDetectorCreateOptions,
} from '../LanguageDetector';

/**
 * Session rỗng — chỗ để điền thuật toán.
 *
 * Chỉ `detect()` cần viết; phần vòng đời (inputQuota, expectedInputLanguages,
 * measureInputUsage, destroy) đã theo đúng hợp đồng Web API.
 */
export function createStubDetector(
  options: LanguageDetectorCreateOptions | undefined,
  detect: (input: string) => LanguageDetectionResult[]
): LanguageDetector {
  const expected = (options && options.expectedInputLanguages) || [];
  let destroyed = false;

  function assertAlive(): void {
    if (destroyed) throw new Error('LanguageDetector session đã destroy()');
  }

  return {
    // Thuật toán chạy cục bộ, không có hạn mức model.
    inputQuota: Number.POSITIVE_INFINITY,
    expectedInputLanguages: expected,

    detect: function (input: string): Promise<LanguageDetectionResult[]> {
      assertAlive();
      return Promise.resolve(detect(input));
    },

    measureInputUsage: function (input: string): Promise<number> {
      assertAlive();
      // Theo spec, con số này tuỳ implementation.
      return Promise.resolve(input.length);
    },

    destroy: function (): void {
      destroyed = true;
    },
  };
}
