import { inject, singleton } from 'tsyringe';

import {
  AvailabilityStatus,
  LanguageDetectionResult,
  LanguageDetector,
  LanguageDetectorCreateOptions,
  LanguageDetectorProvider,
} from '../LanguageDetector';
import { ScriptDetectorProvider } from './ScriptDetectorProvider';
import { TrigramDetectorProvider } from './TrigramDetectorProvider';

/**
 * Phương pháp 3 — kết hợp hai phương pháp trên.
 *
 * Hai provider kia inject qua constructor: mọi tham số PHẢI có @inject(...)
 * tường minh vì esbuild không hỗ trợ emitDecoratorMetadata. Cả hai là
 * @singleton nên đây đúng là instance mà container đã tạo.
 */
@singleton()
export class HybridDetectorProvider implements LanguageDetectorProvider {
  public readonly id = 'hybrid';
  public readonly label = 'Kết hợp (khuyến nghị)';
  public readonly description =
    'Hệ chữ viết chọn nhánh, trigram tách các thứ tiếng Latin.';

  private readonly script: ScriptDetectorProvider;
  private readonly trigram: TrigramDetectorProvider;

  public constructor(
    @inject(ScriptDetectorProvider) script: ScriptDetectorProvider,
    @inject(TrigramDetectorProvider) trigram: TrigramDetectorProvider
  ) {
    this.script = script;
    this.trigram = trigram;
  }

  public availability(
    options?: LanguageDetectorCreateOptions
  ): Promise<AvailabilityStatus | null> {
    // Chỉ sẵn sàng khi cả hai nhánh sẵn sàng.
    return Promise.all([
      this.script.availability(options),
      this.trigram.availability(options),
    ]).then(function (statuses) {
      return statuses.indexOf('available') === -1 ? 'unavailable' : 'available';
    });
  }

  public async create(options?: LanguageDetectorCreateOptions): Promise<LanguageDetector> {
    const script = await this.script.create(options);
    const trigram = await this.trigram.create(options);
    const expected = (options && options.expectedInputLanguages) || [];

    return {
      inputQuota: Math.min(script.inputQuota, trigram.inputQuota),
      expectedInputLanguages: expected,

      detect: async function (input: string): Promise<LanguageDetectionResult[]> {
        // Khung tạm: hệ chữ viết trả về được gì thì lấy, không thì rơi sang trigram.
        // TODO: thay bằng logic kết hợp thật.
        const byScript = await script.detect(input);
        if (byScript.length > 0) return byScript;
        return trigram.detect(input);
      },

      measureInputUsage: function (input: string): Promise<number> {
        return script.measureInputUsage(input);
      },

      // Session tổng hợp destroy thì phải destroy cả hai session con.
      destroy: function (): void {
        script.destroy();
        trigram.destroy();
      },
    };
  }
}
