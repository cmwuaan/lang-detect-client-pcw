import { singleton } from 'tsyringe';

import { confidenceValues, detect, info, RankedLanguage } from '@zdetect';

import {
	AvailabilityStatus,
	LanguageDetectionResult,
	LanguageDetector,
	LanguageDetectorCreateOptions,
	LanguageDetectorProvider,
	UNDETERMINED_LANGUAGE,
} from '../LanguageDetector';

/**
 * Nhận diện bằng `weblibs/zdetect` — bộ detector thuần JS của repo này.
 *
 * Vì sao bản web dùng cái này thay vì Web API `LanguageDetector` của trình
 * duyệt: API đó cần Chromium >= 138, và ngay cả khi có thì hành vi khác nhau
 * giữa các máy. zdetect cho kết quả GIỐNG NHAU ở mọi trình duyệt và không phải
 * tải model — profile n-gram đã inline sẵn trong bundle, tổng ~18KB.
 *
 * Import `@zdetect` là alias trỏ vào `weblibs/zdetect/dist/index.js` — BẢN ĐÃ
 * BUILD, không phải source. Sửa source thì phải chạy lại
 * `cd weblibs/zdetect && npm run build`.
 *
 * Lớp này không có thuật toán nào: chỉ dịch kết quả của engine sang hợp đồng
 * Web API mà UI đang dùng.
 */
@singleton()
export class ZDetectProvider implements LanguageDetectorProvider {
	public readonly id = 'zdetect';
	public readonly label = 'Built-in detector';
	public readonly description =
		'Pure-JavaScript detector bundled with the app: Unicode script routing, conditional n-gram probabilities and a Vietnamese lexicon. No model download, no network, identical results on every browser.';

	/** Lấy thẳng từ engine — không gõ lại, để không bao giờ lệch với config thật. */
	public readonly supportedLanguages = info().languages;

	/** Engine chạy hoàn toàn cục bộ — không có gì để tải, không bao giờ 'downloadable'. */
	public availability(
		_options?: LanguageDetectorCreateOptions
	): Promise<AvailabilityStatus | null> {
		return Promise.resolve('available');
	}

	/**
	 * Điểm gốc của engine cho mọi ngôn ngữ — cùng hình dạng với `zlang.detect()`
	 * của bản desktop, nên UI dùng chung một component cho cả hai nền tảng.
	 *
	 * KHÔNG đi qua `toWebApiShape`: chỗ đó nhân `proportion × confidence` và chèn
	 * 'und' cho hợp đồng Web API, còn đây phải là số engine thật sự tính ra.
	 */
	public computeConfidenceValues(text: string): Promise<LanguageDetectionResult[]> {
		return Promise.resolve(confidenceValues({ text: text }));
	}

	public create(_options?: LanguageDetectorCreateOptions): Promise<LanguageDetector> {
		let destroyed = false;

		function assertAlive(): void {
			if (destroyed) throw new Error('LanguageDetector session was already destroyed');
		}

		return Promise.resolve({
			// Engine chạy trong tiến trình, không có hạn mức như model trình duyệt.
			inputQuota: Number.POSITIVE_INFINITY,
			expectedInputLanguages: info().languages,

			detect: function (input: string): Promise<LanguageDetectionResult[]> {
				assertAlive();
				// detect() đồng bộ; bọc vào Promise cho khớp hợp đồng Web API.
				return Promise.resolve(toWebApiShape(detect({ text: input }).ranked));
			},

			measureInputUsage: function (input: string): Promise<number> {
				assertAlive();
				return Promise.resolve(input.length);
			},

			destroy: function (): void {
				destroyed = true;
			},
		});
	}
}

/**
 * Đổi kết quả của engine sang hình dạng Web API.
 *
 * Engine trả về HAI con số độc lập cho mỗi ngôn ngữ:
 *   `proportion` — bao nhiêu phần văn bản thuộc ngôn ngữ đó (cộng lại = 1)
 *   `confidence` — chắc chắn đến đâu về phán đoán đó
 *
 * Web API chỉ có MỘT trường `confidence`, nên phải gộp: `proportion × confidence`.
 * Phần hụt lại rơi vào `und` — đúng ngữ nghĩa "văn bản không thuộc ngôn ngữ nào
 * model biết". Nhờ vậy câu quá ngắn như "Hi" ra `vi 0.44 / und 0.56` thay vì
 * tuyên bố chắc nịch 1.00.
 *
 * Phép gộp này nằm Ở ĐÂY, tầng adapter — `weblibs/zdetect` vẫn trả về nguyên
 * hai con số, giống cách `nativelibs/zlang` không tự bịa confidence cho ELS.
 */
function toWebApiShape(ranked: RankedLanguage[]): LanguageDetectionResult[] {
	const out: LanguageDetectionResult[] = [];
	let claimed = 0;

	for (const item of ranked) {
		const confidence = item.proportion * item.confidence;
		claimed += confidence;
		out.push({ detectedLanguage: item.lang, confidence: confidence });
	}

	// Hợp đồng Web API: phần tử CUỐI luôn là 'und'.
	out.push({
		detectedLanguage: UNDETERMINED_LANGUAGE,
		confidence: Math.max(0, Math.min(1, 1 - claimed)),
	});

	return out;
}
