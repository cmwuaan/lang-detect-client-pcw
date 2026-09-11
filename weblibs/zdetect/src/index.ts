/**
 * zdetect — nhận diện ngôn ngữ thuần JavaScript, chạy được trong browser.
 *
 * Khác `nativelibs/zlang` ở chỗ: zlang mượn model có sẵn của hệ điều hành, còn
 * zdetect tự tính — script routing + n-gram + lexicon. Nhờ vậy bản web không
 * phụ thuộc `window.LanguageDetector` (chỉ có từ Chromium 138) và cho kết quả
 * giống nhau trên mọi trình duyệt.
 *
 * Không tải model qua mạng: profile n-gram được bundler inline thẳng vào bundle,
 * tổng cộng vài KB.
 */

import { detector } from './config';
import { LanguageHypothesis, MixedResult, RankedLanguage } from './types';

export { LanguageDetector } from './core-detector';
export { normalize } from './normalize';
export { stripDiacritics } from './diacritics';
export { getScriptCategory, segmentByScript } from './script-utils';
export { tokenize, ngramsOfOrder, characterCount } from './tokenize';
export { trainModel, scoreText, toConfidences, MAX_ORDER, LONG_TEXT_THRESHOLD } from './ngram-model';
export { classifyWithConfidence } from './classifier';
export * from './types';

/** Bộ detector đã cấu hình sẵn cho ko/zh/vi/en. */
export { detector };

/** Thông tin chẩn đoán — song song với `zlang.info()` để UI hiển thị đồng nhất. */
export interface ZDetectInfo {
	/** Định danh engine, hiện trên UI. */
	backend: 'zdetect-js';
	/**
	 * `'proportion'` — con số trả về là TỈ LỆ ký tự thuộc ngôn ngữ đó, không
	 * phải xác suất của một model. Đừng so trực tiếp với `scoreKind` của zlang.
	 */
	scoreKind: 'proportion';
	version: string;
	/** Ngôn ngữ engine có thể kết luận, theo config hiện tại. */
	languages: string[];
}

const VERSION = '1.0.0';

export function info(): ZDetectInfo {
	return {
		backend: 'zdetect-js',
		scoreKind: 'proportion',
		version: VERSION,
		languages: ['ko', 'zh', 'vi', 'en'],
	};
}

/** Engine chạy hoàn toàn cục bộ nên luôn dùng được — không có gì để tải. */
export function availability(): { supported: true } {
	return { supported: true };
}

/**
 * Nhận diện ngôn ngữ của `text`.
 *
 * Trả về nguyên trạng cấu trúc của engine: `ranked` đã sắp giảm dần theo
 * `proportion`, kèm `details` từng run để soi được vì sao ra kết quả đó. Tầng
 * gọi tự quyết cách quy đổi sang hình dạng UI của mình.
 *
 * `ranked` rỗng khi không kết luận được (văn bản rỗng, hoặc toàn ký tự thuộc
 * script chưa được config) — đó là kết quả hợp lệ, không phải lỗi.
 */
export function detect(props: { text: string }): MixedResult {
	return detector.detectMixed(props.text);
}

/** Ngôn ngữ khả năng cao nhất, giả định văn bản thuần một ngôn ngữ. */
export function detectTop(props: { text: string; minLength?: number }): RankedLanguage | null {
	return detector.detectTop(props.text, props.minLength ?? 2);
}

/**
 * Confidence cho MỌI ngôn ngữ engine biết, sắp giảm dần, tổng bằng 1.
 *
 * Tương ứng `compute_language_confidence_values()` của lingua, và trả về CÙNG
 * HÌNH DẠNG với `zlang.detect()` của bản desktop — nhờ vậy UI dùng chung một
 * component cho cả hai nền tảng.
 *
 * Khác `detect().ranked` ở chỗ: `ranked` chỉ liệt kê ngôn ngữ THỰC SỰ xuất hiện
 * trong văn bản kèm tỉ lệ ký tự, còn hàm này liệt kê đủ mọi ứng viên — ngôn ngữ
 * bị loại vẫn có mặt với confidence 0, để thấy được cả những gì engine đã cân
 * nhắc rồi bỏ.
 */
export function confidenceValues(props: { text: string }): LanguageHypothesis[] {
	return detector.detectMixed(props.text).hypotheses;
}
