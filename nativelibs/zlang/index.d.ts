/**
 * zlang — facade nhận diện ngôn ngữ dùng model có sẵn của hệ điều hành.
 *
 *   macOS   Apple NaturalLanguage (NLLanguageRecognizer) — xác suất của model.
 *   Windows Extended Linguistic Services, "Microsoft Language Detection" —
 *           chỉ có thứ hạng, confidence được suy ra từ hạng.
 *
 * Không tải model, không cần mạng, không asset nào đi kèm bản build, không
 * tiến trình phụ: mọi thứ nằm trong .node và trong OS.
 *
 * Tầng này giữ ba việc: chọn prebuilt đúng platform, dịch dữ liệu thô của
 * binding sang hình dạng công khai, và trả lời "có dùng được không" mà không ném
 * exception. Mọi logic nhận diện nằm ở native.
 */
/** Ý nghĩa con số `confidence` — không so sánh chéo hai loại này với nhau. */
export declare type ScoreKind = 'probability' | 'rank' | 'none' | 'unknown';
export declare type ZlangUnavailableReason = 'unsupported-platform' | 'native-binding-missing' | 'os-service-unavailable';
export interface LanguageHypothesis {
    /** Thẻ BCP 47: 'vi', 'en', 'zh-Hans'… */
    detectedLanguage: string;
    /** 0..1. Xem `info().scoreKind` trước khi diễn giải. */
    confidence: number;
}
export interface ZlangAvailability {
    supported: boolean;
    reason?: ZlangUnavailableReason;
}
export interface ZlangInfo {
    /** 'apple-nl' | 'windows-els' | 'none' */
    backend: string;
    scoreKind: ScoreKind;
    /** Version của native binding; null khi không nạp được. */
    version: string | null;
    /** `${process.platform}-${process.arch}` */
    slice: string;
    /** Lý do require() thất bại, để log. null khi không có lỗi. */
    loadError: string | null;
}
export interface DetectOptions {
    /** Số giả thuyết tối đa; chặn trong khoảng 1..16. Mặc định 3. */
    maxResults?: number;
}
/** Có nhận diện được ngay bây giờ không. Không bao giờ ném. */
export declare function availability(): ZlangAvailability;
/** Thông tin chẩn đoán — hiện lên UI/log, không dùng cho luồng nghiệp vụ. */
export declare function info(): ZlangInfo;
/**
 * Nhận diện ngôn ngữ của `text`.
 *
 * Trả về mảng đã sắp giảm dần theo confidence; mảng RỖNG khi văn bản quá ngắn
 * hoặc không kết luận được — đó là kết quả hợp lệ, không phải lỗi. Chỉ reject
 * khi backend không dùng được hoặc native báo lỗi thật.
 */
export declare function detect(text: string, options?: DetectOptions): Promise<LanguageHypothesis[]>;
