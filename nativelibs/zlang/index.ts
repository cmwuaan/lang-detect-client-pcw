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
	// Version của native binding; null khi không nạp được.
	version: string | null;
	// `${process.platform}-${process.arch}`
	platform: string;
	loadError: string | null;
}

enum ZLangDetectorPlatformSupport {
	// MacOS
	DARWIN_ARM64 = 'darwin-arm64',
	DARWIN_X64 = 'darwin-x64',
	// Windows OS
	WIN32_IA32 = 'win32-ia32',
	WIN32_X64 = 'win32-x64',
}

// Hình dạng thô của .node — khớp bề mặt napi sẽ thêm ở src/lib.rs.
interface NativeBinding {
	available(): boolean;
	backend(): string;
	version(): string;
	scores(): string;
	// `confidence` là null/undefined khi backend không cho điểm — xem
	// ZLangDetectorHypothesis.confidence.
	detect(text: string): Promise<Array<{ tag: string; confidence: number | null }>>;
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

	if (nativeBinding) {
		try {
			backend = nativeBinding.backend();
			scoreKind = nativeBinding.scores() as ZLangDetectorScoreKind;
			version = nativeBinding.version();
		} catch {
			// Nạp được nhưng gọi lỗi: giữ mặc định, lý do đã có ở loadError.
		}
	}

	return {
		backend: backend,
		scoreKind: scoreKind,
		version: version,
		platform: platform,
		loadError: loadError ? loadError.message : null,
	};
}

/**
 * Nhận diện ngôn ngữ của `text`.
 *
 * - Trả về mảng đã sắp giảm dần theo mức độ khả năng — kể cả khi `confidence`
 * là null, thứ tự vẫn do OS quyết định và vẫn đúng.
 * - Mảng rỗng khi văn bản quá ngắn hoặc không kết luận được — đó là kết quả
 * hợp lệ, không phải lỗi.
 * - Chỉ reject khi backend không dùng được hoặc native báo lỗi thật.
 */
function detect(props: { text: string }): Promise<ZLangDetectorHypothesis[]> {
	const { text } = props;

	const reason = getUnavailableReason();

	if (reason) {
		return Promise.reject(new Error(`zlang: cannot detect (${reason})`));
	}

	// `reason` null nghĩa là binding chắc chắn đã nạp được: getUnavailableReason()
	// trả 'native-binding-missing' cho mọi trường hợp `nativeBinding` là null.
	// Khẳng định kiểu ở đây thay cho một lần kiểm tra không bao giờ đúng.
	const binding = nativeBinding as NativeBinding;

	return binding.detect(text).then(function (raw) {
		const results: ZLangDetectorHypothesis[] = [];

		for (let i = 0; i < raw.length; i++) {
			// `== null` bắt cả null lẫn undefined: napi có thể bỏ hẳn field khi
			// phía Rust là None, tuỳ phiên bản. Chuẩn hoá về đúng một giá trị.
			const confidence = raw[i].confidence == null ? null : raw[i].confidence;
			results.push({ detectedLanguage: raw[i].tag, confidence: confidence });
		}

		return results;
	});
}

export { availability, detect, info };
