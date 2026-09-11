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
export interface ZLangDetectorInfo {
    /**
     * Thông tin phần core chi tiết
     * - 'apple-nl': Apple NaturalLanguage (NLLanguageRecognizer)
     * - 'windows-els': Windows Extended Linguistic Services, "Microsoft Language Detection"
     * - 'none'
     **/
    backend: string;
    scoreKind: ZLangDetectorScoreKind;
    version: string | null;
    platform: string;
    loadError: string | null;
}
declare function availability(): ZLangDetectionAvailability;
declare function info(): ZLangDetectorInfo;
/**
 * Nhận diện ngôn ngữ của `text`.
 *
 * - Trả về mảng đã sắp giảm dần theo mức độ khả năng — kể cả khi `confidence`
 * là null, thứ tự vẫn do OS quyết định và vẫn đúng.
 * - Mảng rỗng khi văn bản quá ngắn hoặc không kết luận được — đó là kết quả
 * hợp lệ, không phải lỗi.
 * - Chỉ reject khi backend không dùng được hoặc native báo lỗi thật.
 */
declare function detect(props: {
    text: string;
}): Promise<ZLangDetectorHypothesis[]>;
export { availability, detect, info };
