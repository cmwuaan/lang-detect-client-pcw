////
/// Hợp đồng nhận diện ngôn ngữ, đặt tên KHỚP Web API `LanguageDetector`:
/// https://developer.mozilla.org/en-US/docs/Web/API/LanguageDetector
///
/// Giữ đúng tên của Web API là một lựa chọn có chủ ý: hình dạng này quen thuộc,
/// và nếu sau này cần cắm thẳng `window.LanguageDetector` của trình duyệt vào
/// thì không phải viết lớp adapter nào.
////

/** Khớp AvailabilityStatus của Web API. */
export type AvailabilityStatus = 'unavailable' | 'downloadable' | 'downloading' | 'available';

/**
 * Thẻ BCP 47 cho "không xác định". Phần tử CUỐI của mảng detect() luôn là thẻ
 * này, kèm xác suất văn bản không thuộc ngôn ngữ nào model biết.
 */
export const UNDETERMINED_LANGUAGE = 'und';

/** Khớp LanguageDetectionResult của Web API. */
export interface LanguageDetectionResult {
  /** Thẻ ngôn ngữ BCP 47 — 'vi', 'en', 'zh', 'ja'… hoặc 'und'. */
  detectedLanguage: string;
  /** 0..1 */
  confidence: number;
}

/** Khớp sự kiện `downloadprogress` của CreateMonitor. */
export interface DownloadProgressEvent {
  loaded: number;
  total: number;
}

/** Khớp CreateMonitor của Web API (một EventTarget). */
export interface CreateMonitor {
  addEventListener(
    type: 'downloadprogress',
    listener: (event: DownloadProgressEvent) => void
  ): void;
}

/**
 * Option riêng của backend native, KHÔNG có trong Web API.
 *
 * Đây là phần mở rộng có chủ ý: hợp đồng của repo là **superset** của Web API.
 * Một provider dùng API thật của trình duyệt vẫn chuyển nguyên object xuống được
 * — trình duyệt bỏ qua field lạ — nên thêm field ở đây không phá tính chất "cắm
 * thẳng vào, không cần adapter".
 *
 * Chỉ `NativeDetectorProvider` đọc tới nó.
 */
export interface NativeDetectorOptions {
  /** 1..16. Không truyền = để native xin tối đa, không có mặc định do app đặt. */
  maxResults?: number;

  /* macOS — Apple NaturalLanguage */
  /** `NLLanguageRecognizer.languageConstraints` — chỉ xét các thẻ BCP 47 này. */
  constraints?: string[];
  /** `NLLanguageRecognizer.languageHints` — prior, thẻ BCP 47 -> trọng số. */
  hints?: { [tag: string]: number };

  /* Windows — Extended Linguistic Services */
  /** `MAPPING_ENUM_OPTIONS.pszInputLanguage` — lọc DỊCH VỤ, không lọc kết quả. */
  inputLanguage?: string;
  /** `MAPPING_ENUM_OPTIONS.pszInputScript` — cũng lọc dịch vụ. */
  inputScript?: string;
  /** `MappingRecognizeText.dwIndex` — ký tự bắt đầu đọc. */
  startIndex?: number;
}

export interface LanguageDetectorCreateOptions {
  /** Thẻ BCP 47 mà caller dự kiến sẽ gặp, ví dụ ['en-US', 'vi']. */
  expectedInputLanguages?: string[];
  signal?: AbortSignal;
  /** Theo dõi tiến độ tải model; chỉ có ý nghĩa khi availability là downloadable. */
  monitor?: (monitor: CreateMonitor) => void;
  /** Mở rộng ngoài Web API — xem NativeDetectorOptions. */
  native?: NativeDetectorOptions;
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

  /** Trả về mảng đã sắp giảm dần theo confidence; phần tử cuối luôn là 'und'. */
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
  /**
   * Thẻ BCP 47 mà provider này chắc chắn kết luận được.
   *
   * `undefined` nghĩa là KHÔNG BIẾT, không phải "không hỗ trợ gì". Provider
   * native cố tình để trống: model của Apple/Microsoft nhận diện hàng chục ngôn
   * ngữ nhưng không API nào liệt kê ra được, nên bịa một danh sách là nói dối.
   * Chỉ provider tự dựng model mới khai được chính xác.
   */
  readonly supportedLanguages?: string[];

  availability(options?: LanguageDetectorCreateOptions): Promise<AvailabilityStatus | null>;

  /**
   * Confidence cho MỌI ngôn ngữ provider biết, sắp giảm dần, tổng bằng 1.
   *
   * Tương ứng `compute_language_confidence_values()` của lingua. Khác `detect()`
   * ở chỗ đây là ĐIỂM GỐC của engine, chưa qua phép quy đổi nào sang hợp đồng
   * Web API — không chèn phần tử 'und', không nhân thêm hệ số nào.
   *
   * `undefined` khi provider không moi ra được con số thô (ví dụ khi điểm đã
   * nằm sẵn ở một đường dữ liệu khác). Bên gọi phải chịu được việc thiếu nó.
   */
  computeConfidenceValues?(text: string): Promise<LanguageDetectionResult[]>;

  /**
   * LƯU Ý: theo spec, `create()` cần transient activation (user gesture) khi
   * model chưa sẵn sàng. Gọi lúc mount sẽ ném NotAllowedError — phải chờ người
   * dùng bấm. Xem lib/useLanguageDetector.ts.
   */
  create(options?: LanguageDetectorCreateOptions): Promise<LanguageDetector>;
}
