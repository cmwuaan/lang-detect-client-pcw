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

// Ý nghĩa con số `confidence` — không so sánh chéo hai loại này.
export type ZLangDetectorScoreKind = 'probability' | 'rank' | 'none';

export type ZLangDetectorUnavailableReason =
	// OS không có backend nào (Linux).
	| 'unsupported-platform'
	// Có backend nhưng thiếu file .node cho platform-arch này.
	| 'native-binding-missing'
	// Có .node nhưng dịch vụ của OS không trả lời (ELS bị tắt, macOS quá cũ).
	| 'os-service-unavailable';

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

	/* --- macOS: Apple NaturalLanguage --- */

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
	hints?: { [tag: string]: number };

	/* --- Windows: Extended Linguistic Services --- */

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

// Thông tin chẩn đoán, support cho log
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
	// Version của native binding; null khi không nạp được.
	version: string | null;
	// `${process.platform}-${process.arch}`
	platform: string;
	loadError: string | null;
}

/** Không nạp được native thì không có option nào dùng được. */
const NO_CAPABILITIES: ZLangDetectorCapabilities = {
	constraints: false,
	hints: false,
	dominant: false,
	inputLanguage: false,
	inputScript: false,
	startIndex: false,
};

enum ZLangDetectorPlatformSupport {
	// MacOS
	DARWIN_ARM64 = 'darwin-arm64',
	DARWIN_X64 = 'darwin-x64',
	// Windows OS
	WIN32_IA32 = 'win32-ia32',
	WIN32_X64 = 'win32-x64',
}

// Hình dạng thô của .node — khớp bề mặt napi ở src/lib.rs.
interface NativeBinding {
	available(): boolean;
	backend(): string;
	version(): string;
	scores(): string;
	capabilities(): ZLangDetectorCapabilities;
	detect(
		text: string,
		options?: {
			maxResults?: number;
			constraints?: string[];
			hints?: Array<{ tag: string; weight: number }>;
			inputLanguage?: string;
			inputScript?: string;
			startIndex?: number;
		}
	): Promise<{
		// `confidence` là null/undefined khi backend không cho điểm — xem
		// ZLangDetectorHypothesis.confidence.
		hypotheses: Array<{ tag: string; confidence: number | null }>;
		dominant?: string | null;
	}>;
}

let nativeBinding: NativeBinding | null = null;
let loadError: Error | null = null;

const platform = `${process.platform}-${process.arch}` as ZLangDetectorPlatformSupport;

function asError(value: unknown): Error {
	return value instanceof Error ? value : new Error(String(value));
}

switch (platform) {
	case ZLangDetectorPlatformSupport.DARWIN_ARM64:
		try {
			nativeBinding = require('./darwin-arm64/zlang.darwin-arm64.node');
		} catch (e) {
			loadError = asError(e);
		}
		break;
	case ZLangDetectorPlatformSupport.DARWIN_X64:
		try {
			nativeBinding = require('./darwin-x64/zlang.darwin-x64.node');
		} catch (e) {
			loadError = asError(e);
		}
		break;
	case ZLangDetectorPlatformSupport.WIN32_IA32:
		try {
			nativeBinding = require('./win32-ia32/zlang.win32-ia32.node');
		} catch (e) {
			loadError = asError(e);
		}
		break;
	case ZLangDetectorPlatformSupport.WIN32_X64:
		try {
			nativeBinding = require('./win32-x64/zlang.win32-x64.node');
		} catch (e) {
			loadError = asError(e);
		}
		break;
	default:
		loadError = new Error(`zlang is not supported on this OS platform: ${platform}`);
}

function isPlatformSupported(): boolean {
	return process.platform === 'darwin' || process.platform === 'win32';
}

/**
 * Backend Windows phải hỏi OS mới biết dịch vụ có bật không, nên cache lại:
 * availability() có thể được gọi nhiều lần.
 */
let cachedUnavailableReason: ZLangDetectorUnavailableReason | null | undefined;

function getUnavailableReason(): ZLangDetectorUnavailableReason | null {
	if (cachedUnavailableReason !== undefined) return cachedUnavailableReason;

	cachedUnavailableReason = (function (): ZLangDetectorUnavailableReason | null {
		if (!isPlatformSupported()) {
			return 'unsupported-platform';
		}

		if (!nativeBinding) {
			return 'native-binding-missing';
		}

		try {
			if (!nativeBinding.available()) {
				return 'os-service-unavailable';
			}
			return null;
		} catch {
			return 'os-service-unavailable';
		}
	})();

	return cachedUnavailableReason;
}

function availability(): ZLangDetectionAvailability {
	const reason = getUnavailableReason();
	return reason ? { supported: false, reason: reason } : { supported: true };
}

// Thông tin chẩn đoán
function info(): ZLangDetectorInfo {
	let backend = 'none';
	let scoreKind: ZLangDetectorScoreKind = 'none';
	let version: string | null = null;
	let capabilities: ZLangDetectorCapabilities = NO_CAPABILITIES;

	if (nativeBinding) {
		try {
			backend = nativeBinding.backend();
			scoreKind = nativeBinding.scores() as ZLangDetectorScoreKind;
			version = nativeBinding.version();
			capabilities = nativeBinding.capabilities();
		} catch {
			// Nạp được nhưng gọi lỗi: giữ mặc định, lý do đã có ở loadError.
		}
	}

	return {
		backend: backend,
		scoreKind: scoreKind,
		capabilities: capabilities,
		version: version,
		platform: platform,
		loadError: loadError ? loadError.message : null,
	};
}

/** `{ vi: 0.9 }` -> `[{ tag: 'vi', weight: 0.9 }]` cho bề mặt napi. */
function toHintList(hints: { [tag: string]: number }): Array<{ tag: string; weight: number }> {
	return Object.keys(hints).map(function (tag) {
		return { tag: tag, weight: hints[tag] };
	});
}

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
function detect(props: ZLangDetectOptions): Promise<ZLangDetection> {
	const { text, maxResults, constraints, hints, inputLanguage, inputScript, startIndex } = props;

	const reason = getUnavailableReason();

	if (reason) {
		return Promise.reject(new Error(`zlang: cannot detect (${reason})`));
	}

	// `reason` null nghĩa là binding chắc chắn đã nạp được: getUnavailableReason()
	// trả 'native-binding-missing' cho mọi trường hợp `nativeBinding` là null.
	// Khẳng định kiểu ở đây thay cho một lần kiểm tra không bao giờ đúng.
	const binding = nativeBinding as NativeBinding;

	return binding
		.detect(text, {
			// undefined ở đây nghĩa là "không truyền" — native sẽ để OS tự quyết.
			maxResults: maxResults,
			constraints: constraints,
			hints: hints ? toHintList(hints) : undefined,
			inputLanguage: inputLanguage,
			inputScript: inputScript,
			startIndex: startIndex,
		})
		.then(function (raw) {
			const hypotheses: ZLangDetectorHypothesis[] = [];

			for (let i = 0; i < raw.hypotheses.length; i++) {
				// `== null` bắt cả null lẫn undefined: napi có thể bỏ hẳn field khi
				// phía Rust là None, tuỳ phiên bản. Chuẩn hoá về đúng một giá trị.
				const confidence =
					raw.hypotheses[i].confidence == null ? null : raw.hypotheses[i].confidence;
				hypotheses.push({ detectedLanguage: raw.hypotheses[i].tag, confidence: confidence });
			}

			return {
				hypotheses: hypotheses,
				dominantLanguage: raw.dominant == null ? null : raw.dominant,
			};
		});
}

/** Ngắn gọn cho `info().capabilities` — hỏi trước khi truyền option. */
function capabilities(): ZLangDetectorCapabilities {
	return info().capabilities;
}

export { availability, capabilities, detect, info };
