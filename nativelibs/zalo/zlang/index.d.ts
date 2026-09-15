/**
 * zlang — nhận diện ngôn ngữ dùng native có sẵn của hệ điều hành.
 *
 *   macOS   Apple NaturalLanguage (NLLanguageRecognizer) — xác suất của model.
 *   Windows Extended Linguistic Services — chỉ có thứ hạng, KHÔNG có điểm. (V2)
 *
 * Tầng này chỉ làm interface + mapping: chọn prebuilt theo platform, đổi tên
 * field thô của binding, và gate "có dùng được không". Không rule, không bảng
 * tra, không regex — cái gì OS không cung cấp thì trả `null` chứ không suy ra.
 */
import type { ZLangScoreKind } from './native';
export type { ZLangScoreKind };
export declare type ZLangUnavailableReason = 'unsupported-platform' | 'native-binding-missing' | 'os-service-unavailable';
export interface ZLangAvailability {
    supported: boolean;
    reason?: ZLangUnavailableReason;
}
export interface ZLangHypothesis {
    /**
     * Thẻ BCP 47 do OS trả về, chuyển thẳng ra ngoài không chỉnh sửa:
     * 'vi', 'en', 'ko', 'zh-Hans', 'zh-Hant'…
     *
     * Hai backend có thể dùng thẻ khác nhau cho cùng một ngôn ngữ. Tầng này
     * KHÔNG normalize — muốn thống nhất thì làm ở tầng trên.
     */
    detectedLanguage: string;
    /**
     * 0..1 khi backend cho điểm thật, `null` khi backend không cho.
     *
     * `null` xảy ra với `scoreKind === 'rank'`: backend chỉ trả về danh sách đã
     * xếp hạng, không có điểm số nào. Tầng này KHÔNG suy ra một con số thay thế
     * — thứ tự phần tử trong mảng chính là thông tin hạng.
     */
    confidence: number | null;
}
export interface ZLangDetectOptions {
    /**
     * Số giả thuyết tối đa, chặn trong `1..16`.
     *
     * Không truyền = xin tối đa sức chứa (16), không phải một con số do module
     * tự chọn.
     */
    maxResults?: number;
}
export interface ZLangInfo {
    /** 'apple-nl' | 'windows-els' | 'none' */
    backend: string;
    scoreKind: ZLangScoreKind;
    version: string | null;
    platform: string;
    loadError: string | null;
}
/** Không bao giờ ném, trả lời được cả khi native hỏng. */
declare function availability(): ZLangAvailability;
/** Thông tin chẩn đoán, để log và hiển thị. */
declare function info(): ZLangInfo;
/**
 * Nhận diện ngôn ngữ của `text`.
 *
 * - Mảng đã sắp giảm dần theo mức độ khả năng — kể cả khi `confidence` là null,
 *   thứ tự vẫn do OS quyết định và vẫn đúng.
 * - Mảng rỗng khi văn bản quá ngắn hoặc không kết luận được: kết quả hợp lệ,
 *   không phải lỗi.
 * - Reject khi backend không dùng được hoặc khi native báo lỗi thật.
 */
declare function detect(text: string, options?: ZLangDetectOptions): Promise<ZLangHypothesis[]>;
/**
 * Ngôn ngữ khả năng cao nhất của `text` — chỉ thẻ BCP 47, không kèm điểm.
 *
 * Lớp mỏng trên `detect()`, không hỏi OS theo đường khác: vẫn cùng một gate
 * availability, vẫn thẻ thô của OS chuyển thẳng ra không normalize.
 *
 * - `null` khi văn bản quá ngắn hoặc không kết luận được — đúng chỗ `detect()`
 *   trả mảng rỗng. Kết quả hợp lệ, không phải lỗi.
 * - Reject trong đúng những trường hợp `detect()` reject: backend không dùng
 *   được, hoặc native báo lỗi thật.
 *
 * Xin đúng 1 giả thuyết vì mảng của `detect()` luôn sắp giảm dần trên cả hai
 * nền tảng: phần tử đầu là kết quả tốt nhất, phần còn lại không dùng tới.
 */
declare function dominantLanguage(text: string): Promise<string | null>;
export { availability, detect, dominantLanguage, info };
