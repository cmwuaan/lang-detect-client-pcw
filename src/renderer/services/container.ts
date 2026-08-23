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

/**
 * Chỗ DUY NHẤT biết lớp cụ thể nào được dùng. Thêm/thay một phương pháp nhận
 * diện chỉ sửa file này; UI không đổi vì nó chỉ làm việc với
 * LanguageDetectorProvider.
 */
export function configureContainer(): void {
  // Token đăng ký nhiều lần -> resolveAll() trả về đủ các provider theo đúng
  // thứ tự dưới đây. Mỗi lớp là singleton nên đổi phương pháp trên UI không
  // tạo provider mới.
  container.register<LanguageDetectorProvider>(TOKENS.LanguageDetectorProvider, {
    useToken: HybridDetectorProvider,
  });
  container.register<LanguageDetectorProvider>(TOKENS.LanguageDetectorProvider, {
    useToken: TrigramDetectorProvider,
  });
  container.register<LanguageDetectorProvider>(TOKENS.LanguageDetectorProvider, {
    useToken: ScriptDetectorProvider,
  });
  container.register<LanguageDetectorProvider>(TOKENS.LanguageDetectorProvider, {
    useToken: BrowserDetectorProvider,
  });

  // Bản web và bản desktop dùng cùng bundle renderer; chọn implementation dựa
  // trên việc preload có expose bridge hay không.
  const platform = window.electronAPI ? DesktopPlatformService : WebPlatformService;
  container.register<IPlatformService>(TOKENS.PlatformService, { useToken: platform });
}

export { container };
