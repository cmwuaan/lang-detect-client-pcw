import { InjectionToken } from 'tsyringe';

import { LanguageDetectorProvider } from './detection/LanguageDetector';
import { IPlatformService } from './platform/IPlatformService';

/**
 * Token cho các service có nhiều implementation. Dùng token thay vì class giúp
 * UI phụ thuộc vào interface, không phụ thuộc lớp cụ thể.
 */
export const TOKENS = {
  /** Đăng ký nhiều lần -> container.resolveAll() trả về mọi phương pháp. */
  LanguageDetectorProvider: 'LanguageDetectorProvider' as InjectionToken<LanguageDetectorProvider>,
  PlatformService: 'PlatformService' as InjectionToken<IPlatformService>,
};
