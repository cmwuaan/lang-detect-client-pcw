import { singleton } from 'tsyringe';

import { ElectronAPI, NativeDetectStatus, NativeLanguageHypothesis } from '@shared/ipc';

import {
	AvailabilityStatus,
	LanguageDetectionResult,
	LanguageDetector,
	LanguageDetectorCreateOptions,
	LanguageDetectorProvider,
	UNDETERMINED_LANGUAGE,
} from '../LanguageDetector';

/**
 * Nhận diện bằng model có sẵn của HỆ ĐIỀU HÀNH, qua nativelibs/zlang:
 *   macOS   — Apple NaturalLanguage (NLLanguageRecognizer)
 *   Windows — Extended Linguistic Services, "Microsoft Language Detection"
 *
 * Vì sao desktop KHÔNG dùng zdetect như bản web: model của hệ điều hành được
 * Apple/Microsoft huấn luyện trên dữ liệu lớn hơn nhiều lần corpus của repo, và
 * nó có sẵn trong máy nên không tốn byte nào trong bundle. Có native thì dùng
 * native.
 *
 * Lớp này không có thuật toán nào: nó gọi qua preload bridge sang main process,
 * và dịch kết quả sang hợp đồng Web API mà UI đang dùng.
 */
@singleton()
export class NativeDetectorProvider implements LanguageDetectorProvider {
	public readonly id = 'native';
	public readonly label = 'Operating system model';

	/** Trạng thái lần hỏi gần nhất, để mô tả cho người dùng biết backend nào đang chạy. */
	private lastStatus: NativeDetectStatus | null = null;

	/**
	 * Getter chứ không phải hằng: sau khi availability() hỏi xong thì mô tả nói
	 * rõ backend thật (apple-nl / windows-els) mà không phải sửa UI.
	 */
	public get description(): string {
		const base = 'Model built into the OS, nothing to download. Desktop build only.';
		if (!this.api) return base + ' The web build has no bridge to native.';
		if (!this.lastStatus) return base;
		if (!this.lastStatus.supported) {
			return base + ' Unavailable: ' + (this.lastStatus.reason || 'reason unknown') + '.';
		}
		const scoreNote =
			this.lastStatus.scoreKind === 'rank'
				? 'confidence is derived from rank'
				: 'confidence is the model probability';
		return base + ' Backend ' + this.lastStatus.backend + ', ' + scoreNote + '.';
	}

	/** undefined khi chạy bản web — không có preload bridge. */
	private get api(): ElectronAPI['nativeDetect'] | undefined {
		return window.electronAPI ? window.electronAPI.nativeDetect : undefined;
	}

	/**
	 * Model nằm trong OS nên không có bước tải: chỉ có 'available' hoặc
	 * 'unavailable', không bao giờ 'downloadable' — UI vì thế không hiện nút
	 * "Tải model" cho phương pháp này.
	 */
	public availability(
		_options?: LanguageDetectorCreateOptions
	): Promise<AvailabilityStatus | null> {
		const api = this.api;
		if (!api) return Promise.resolve('unavailable');

		const self = this;
		return api.status().then(
			function (status) {
				self.lastStatus = status;
				return status.supported ? 'available' : 'unavailable';
			},
			function () {
				self.lastStatus = null;
				return 'unavailable' as AvailabilityStatus;
			}
		);
	}

	public create(options?: LanguageDetectorCreateOptions): Promise<LanguageDetector> {
		const api = this.api;
		if (!api) {
			return Promise.reject(new Error('The web build has no native module to detect with'));
		}

		const expected = (options && options.expectedInputLanguages) || [];
		// Option native do caller đưa xuống nguyên trạng — lớp này không tự suy
		// ra constraint/hint từ `expectedInputLanguages`: hai khái niệm đó của Web
		// API và của Apple không trùng nghĩa, đoán bừa là bịa hành vi.
		const native = (options && options.native) || {};
		let destroyed = false;

		function assertAlive(): void {
			if (destroyed) throw new Error('LanguageDetector session was already destroyed');
		}

		return Promise.resolve({
			// Model của OS không có hạn mức input như model của trình duyệt.
			inputQuota: Number.POSITIVE_INFINITY,
			expectedInputLanguages: expected,

			detect: function (input: string): Promise<LanguageDetectionResult[]> {
				assertAlive();
				return api
					.detect({
						text: input,
						maxResults: native.maxResults,
						constraints: native.constraints,
						hints: native.hints,
						inputLanguage: native.inputLanguage,
						inputScript: native.inputScript,
						startIndex: native.startIndex,
					})
					.then(function (detection) {
						return detection.hypotheses;
					})
					.then(toWebApiShape)
					.then(withUndetermined);
			},

			measureInputUsage: function (input: string): Promise<number> {
				assertAlive();
				return Promise.resolve(input.length);
			},

			// Không có tài nguyên nào phải giải phóng: native tạo/hủy recognizer
			// trong từng lời gọi. Cờ này chỉ để phát hiện dùng session đã đóng.
			destroy: function (): void {
				destroyed = true;
			},
		});
	}
}

/**
 * nativelibs trả `confidence: null` khi backend chỉ xếp hạng (Windows/ELS —
 * `scoreKind === 'rank'`). Web API `LanguageDetectionResult` bắt buộc confidence
 * là number, nên phép quy đổi nằm Ở ĐÂY, tầng adapter.
 *
 * VÌ SAO KHÔNG ĐỂ TRONG nativelibs: ELS không hề cung cấp con số này. nativelibs
 * chỉ map những gì OS đưa ra, còn "hiển thị hạng thành mấy phần trăm" là quyết
 * định của app — đổi cách hiển thị thì sửa ở đây, không phải build lại native.
 *
 * Cách quy đổi: nghịch đảo hạng rồi chuẩn hoá cho tổng bằng 1. Giữ đúng thứ tự
 * OS đưa ra và không giả vờ là độ chắc chắn của model; UI phân biệt được nhờ
 * `status.scoreKind`.
 */
function toWebApiShape(results: NativeLanguageHypothesis[]): LanguageDetectionResult[] {
	let norm = 0;
	for (let i = 0; i < results.length; i++) {
		if (results[i].confidence === null) norm += 1 / (i + 1);
	}

	const out: LanguageDetectionResult[] = [];
	for (let i = 0; i < results.length; i++) {
		const given = results[i].confidence;
		out.push({
			detectedLanguage: results[i].detectedLanguage,
			confidence: given === null ? (norm > 0 ? 1 / (i + 1) / norm : 0) : given,
		});
	}
	return out;
}

/**
 * Theo hợp đồng Web API, phần tử CUỐI của mảng luôn là 'und' kèm xác suất văn
 * bản không thuộc ngôn ngữ nào model biết. zlang không trả phần tử đó, nên phần
 * dư được tính ở đây: 1 trừ tổng các giả thuyết.
 *
 * Văn bản quá ngắn -> native trả mảng rỗng -> ở đây thành [{ und, 1 }], và UI
 * hiện "Không xác định" thay vì gạch ngang.
 */
function withUndetermined(results: LanguageDetectionResult[]): LanguageDetectionResult[] {
	let sum = 0;
	for (let i = 0; i < results.length; i++) sum += results[i].confidence;

	const residual = Math.max(0, Math.min(1, 1 - sum));
	return results.concat([{ detectedLanguage: UNDETERMINED_LANGUAGE, confidence: residual }]);
}
