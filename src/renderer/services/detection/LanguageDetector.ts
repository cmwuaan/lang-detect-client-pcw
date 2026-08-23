////
/// Hợp đồng nhận diện ngôn ngữ, đặt tên KHỚP Web API `LanguageDetector`:
/// https://developer.mozilla.org/en-US/docs/Web/API/LanguageDetector
///
/// Nhờ vậy một implementation dùng API thật của trình duyệt cắm vào được mà
/// không cần lớp adapter nào — xem providers/BrowserDetectorProvider.ts.
////

/** Khớp AvailabilityStatus của Web API. */
export type AvailabilityStatus = 'unavailable' | 'downloadable' | 'downloading' | 'available';

/** Khớp LanguageDetectionResult của Web API. */
export interface LanguageDetectionResult {
  /** Thẻ ngôn ngữ BCP 47 — 'vi', 'en', 'zh', 'ja'… */
  detectedLanguage: string;
  /** 0..1 */
  confidence: number;
}

export interface LanguageDetectorCreateOptions {
  /** Thẻ BCP 47 mà caller dự kiến sẽ gặp, ví dụ ['en-US', 'vi']. */
  expectedInputLanguages?: string[];
  signal?: AbortSignal;
}

export interface LanguageDetectorDetectOptions {
  signal?: AbortSignal;
}

/**
 * Cùng hình dạng với instance `LanguageDetector` của trình duyệt.
 * Một instance là một session có vòng đời: dùng xong thì `destroy()`.
 */
export interface LanguageDetector {
  /** Ngưỡng độ dài input mà session xử lý được; tuỳ implementation. */
  readonly inputQuota: number;
  readonly expectedInputLanguages: string[];

  detect(
    input: string,
    options?: LanguageDetectorDetectOptions
  ): Promise<LanguageDetectionResult[]>;

  /** Lượng quota mà `input` tiêu thụ; nhỏ hơn inputQuota là xử lý được. */
  measureInputUsage(input: string, options?: LanguageDetectorDetectOptions): Promise<number>;

  destroy(): void;
}

/**
 * Web API để `availability()` và `create()` làm static method. TypeScript
 * không cho khai báo static trong interface, và container của tsyringe làm
 * việc với instance — nên hai static đó gom vào interface provider này.
 *
 * Provider là singleton; mỗi `create()` trả về một session mới.
 */
export interface LanguageDetectorProvider {
  /** Khoá bền để lưu lựa chọn của người dùng. */
  readonly id: string;
  /** Tên hiển thị trên UI. */
  readonly label: string;
  /** Mô tả ngắn cách hoạt động. */
  readonly description: string;

  availability(options?: LanguageDetectorCreateOptions): Promise<AvailabilityStatus | null>;
  create(options?: LanguageDetectorCreateOptions): Promise<LanguageDetector>;
}
