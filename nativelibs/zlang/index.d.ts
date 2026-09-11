/**
 * zlang — nhận diện ngôn ngữ dùng native có sẵn của hệ điều hành.
 *
 *   macOS   Apple NaturalLanguage (NLLanguageRecognizer) — xác suất của model.
 *   Windows Extended Linguistic Services, "Microsoft Language Detection" —
 *           chỉ có thứ hạng, KHÔNG có điểm.
 *
 * Tầng này chỉ làm interface + mapping: chọn prebuilt theo platform, đổi tên
 * field thô của binding, và gate "có dùng được không". Không rule, không bảng
 * tra, không regex — cái gì OS không cung cấp thì trả `null` chứ không suy ra.
 */
export declare type ZLangDetectorScoreKind = 'probability' | 'rank' | 'none';
export declare type ZLangDetectorUnavailableReason = 'unsupported-platform' | 'native-binding-missing' | 'os-service-unavailable';
export interface ZLangDetectionAvailability {
    supported: boolean;
    reason?: ZLangDetectorUnavailableReason;
}
export interface ZLangDetectorHypothesis {
    /**
     * Thẻ BCP (Best Current Practice) 47: Là mã định danh ngôn ngữ chuẩn của IETF dùng để biểu diễn language tag.
     * - vi - Tiếng Việt
     * - en - Tiếng Anh
     * - ko - Tiếng Hàn
     * - zh - Tiếng Trung
     * - zh-Hans - Tiếng Trung, chữ Giản thể
     * - zh-Hant - Tiếng Trung, chữ Phồn thể
     */
    detectedLanguage: string;
    /**
     * 0..1 khi backend cho điểm thật, `null` khi backend không cho.
     *
     * `null` xảy ra với `scoreKind === 'rank'` (Windows/ELS): ELS chỉ trả về
     * danh sách đã xếp hạng, không có điểm số nào. Tầng này KHÔNG suy ra một con
     * số thay thế — thứ tự phần tử trong mảng chính là thông tin hạng. Bên dùng
     * muốn hiển thị phần trăm thì tự quyết cách quy đổi.
     *
     * Đọc `info().scoreKind` trước khi diễn giải, và đừng so sánh chéo con số
     * giữa hai nền tảng.
     */
    confidence: number | null;
}
/**
 * Option nào backend hiện tại thật sự hiểu.
 *
 * HỎI TRƯỚC KHI TRUYỀN: backend không hiểu thì `detect()` **reject**, không bỏ
 * qua im lặng — đặt constraint rồi tưởng nó có hiệu lực là lỗi nguy hiểm hơn
 * nhiều so với một lỗi rõ ràng.
 *
 * macOS (`apple-nl`) hỗ trợ cả ba; Windows (`windows-els`) không hỗ trợ cái nào
 * — ELS chỉ nhận văn bản.
 */
export interface ZLangDetectorCapabilities {
    /** Truyền được `constraints` không. (macOS) */
    constraints: boolean;
    /** Truyền được `hints` không. (macOS) */
    hints: boolean;
    /** Kết quả có `dominantLanguage` không. (macOS) */
    dominant: boolean;
    /** Truyền được `inputLanguage` không. (Windows/ELS) */
    inputLanguage: boolean;
    /** Truyền được `inputScript` không. (Windows/ELS) */
    inputScript: boolean;
    /** Truyền được `startIndex` không. (Windows/ELS) */
    startIndex: boolean;
}
/**
 * Option điều khiển kết quả — ánh xạ thẳng sang API của OS, không thêm tầng
 * diễn giải nào.
 *
 * **Không truyền field nào thì OS giữ mặc định của chính nó.** Module không tự
 * đặt ra giá trị mặc định: không truyền `constraints` thì `languageConstraints`
 * không bị đụng tới, không truyền `inputLanguage` thì `pszInputLanguage` là NULL.
 *
 * Hai nhóm option dưới đây KHÔNG thay thế cho nhau — xem `capabilities()`.
 */
export interface ZLangDetectOptions {
    /** Văn bản cần nhận diện, UTF-8. */
    text: string;
    /**
     * Số giả thuyết tối đa, chặn trong `1..16`.
     * → `languageHypotheses(withMaximum:)` (macOS) / cắt danh sách ELS (Windows)
     *
     * Không truyền = xin tối đa sức chứa (16), không phải một con số do module
     * tự chọn.
     */
    maxResults?: number;
    /**
     * Chỉ xét các thẻ BCP 47 này. → `NLLanguageRecognizer.languageConstraints`
     *
     * Lưu ý Apple coi đây là **ràng buộc mềm**: kết quả vẫn có thể chứa ngôn ngữ
     * ngoài danh sách, nhưng với confidence bằng 0.
     */
    constraints?: string[];
    /**
     * Prior của caller: thẻ BCP 47 -> trọng số.
     * → `NLLanguageRecognizer.languageHints`
     *
     * Ví dụ `{ vi: 0.9, en: 0.1 }` khi đã biết hội thoại chủ yếu là Việt/Anh.
     */
    hints?: {
        [tag: string]: number;
    };
    /**
     * Thẻ IETF giới hạn ngôn ngữ đầu vào.
     * → `MAPPING_ENUM_OPTIONS.pszInputLanguage`
     *
     * **KHÔNG phải `constraints` của Apple.** Nó lọc ở bước *chọn dịch vụ* —
     * "chỉ dùng engine nào nhận được đầu vào này" — chứ không lọc kết quả trả về.
     */
    inputLanguage?: string;
    /**
     * Giới hạn theo hệ chữ viết đầu vào, dùng khi biết trước văn bản chỉ thuộc
     * một script. → `MAPPING_ENUM_OPTIONS.pszInputScript`. Cũng lọc dịch vụ.
     */
    inputScript?: string;
    /**
     * Vị trí ký tự bắt đầu đọc trong văn bản (tính theo ký tự UTF-16).
     * → `MappingRecognizeText.dwIndex`
     *
     * macOS không có tham số tương đương — `processString()` luôn đọc cả chuỗi.
     * Cần hành vi này trên macOS thì tự cắt chuỗi trước khi gọi.
     */
    startIndex?: number;
}
/** Kết quả một lần `detect()`. */
export interface ZLangDetection {
    /** Đã sắp giảm dần theo mức độ khả năng. Rỗng khi không kết luận được. */
    hypotheses: ZLangDetectorHypothesis[];
    /**
     * `NLLanguageRecognizer.dominantLanguage` — ngôn ngữ trội do model tự chọn.
     *
     * `null` khi backend không có khái niệm đó (Windows/ELS) hoặc model không
     * kết luận được. Không phải lúc nào cũng trùng `hypotheses[0]`: Apple tính
     * hai thứ này độc lập.
     */
    dominantLanguage: string | null;
}
export interface ZLangDetectorInfo {
    /**
     * Thông tin phần core chi tiết
     * - 'apple-nl': Apple NaturalLanguage (NLLanguageRecognizer)
     * - 'windows-els': Windows Extended Linguistic Services, "Microsoft Language Detection"
     * - 'none'
     **/
    backend: string;
    scoreKind: ZLangDetectorScoreKind;
    /** Option nào truyền được vào `detect()` trên nền tảng này. */
    capabilities: ZLangDetectorCapabilities;
    version: string | null;
    platform: string;
    loadError: string | null;
}
declare function availability(): ZLangDetectionAvailability;
declare function info(): ZLangDetectorInfo;
/**
 * Nhận diện ngôn ngữ của `text`, có thể kèm option điều khiển kết quả.
 *
 * - `hypotheses` đã sắp giảm dần theo mức độ khả năng — kể cả khi `confidence`
 * là null, thứ tự vẫn do OS quyết định và vẫn đúng.
 * - Mảng rỗng khi văn bản quá ngắn hoặc không kết luận được — đó là kết quả
 * hợp lệ, không phải lỗi.
 * - Reject khi backend không dùng được, khi native báo lỗi thật, hoặc khi
 * truyền option mà backend không hỗ trợ (xem `info().capabilities`).
 */
declare function detect(props: ZLangDetectOptions): Promise<ZLangDetection>;
/** Ngắn gọn cho `info().capabilities` — hỏi trước khi truyền option. */
declare function capabilities(): ZLangDetectorCapabilities;
export { availability, capabilities, detect, info };
