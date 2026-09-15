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

import type { ZLangNativeBinding, ZLangScoreKind } from './native';

/* Kiểu này do backend quyết định nên nó sống ở native.d.ts; re-export để bên
   dùng chỉ cần import từ 'zlang'. */
export type { ZLangScoreKind };

export type ZLangUnavailableReason =
	| 'unsupported-platform'
	| 'native-binding-missing'
	| 'os-service-unavailable';

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

enum SupportedPlatform {
	DARWIN_ARM64 = 'darwin-arm64',
	DARWIN_X64 = 'darwin-x64',
	WIN32_IA32 = 'win32-ia32',
	WIN32_X64 = 'win32-x64',
}

let nativeBinding: ZLangNativeBinding | null = null;
let loadError: Error | null = null;

const platform = `${process.platform}-${process.arch}`;

function asError(value: unknown): Error {
	return value instanceof Error ? value : new Error(String(value));
}

/**
 * Nạp trong try/catch: module phải `require` được cả khi thiếu .node, để app
 * không cần bọc try/catch quanh việc import và vẫn hỏi được availability().
 */
function load(dir: string): void {
	try {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		nativeBinding = require(`./${dir}/zlang.${dir}.node`);
	} catch (e) {
		loadError = asError(e);
	}
}

switch (platform) {
	case SupportedPlatform.DARWIN_ARM64:
	case SupportedPlatform.DARWIN_X64:
	case SupportedPlatform.WIN32_IA32:
	case SupportedPlatform.WIN32_X64:
		load(platform);
		break;
	default:
		loadError = new Error(`zlang is not supported on this OS platform: ${platform}`);
}

/**
 * Backend Windows phải hỏi OS mới biết dịch vụ có bật không, nên cache lại:
 * availability() có thể được gọi nhiều lần.
 */
let cachedUnavailableReason: ZLangUnavailableReason | null | undefined;

function getUnavailableReason(): ZLangUnavailableReason | null {
	if (cachedUnavailableReason !== undefined) return cachedUnavailableReason;

	cachedUnavailableReason = (function (): ZLangUnavailableReason | null {
		if (process.platform !== 'darwin' && process.platform !== 'win32') {
			return 'unsupported-platform';
		}
		if (!nativeBinding) {
			return 'native-binding-missing';
		}
		try {
			return nativeBinding.available() ? null : 'os-service-unavailable';
		} catch {
			return 'os-service-unavailable';
		}
	})();

	return cachedUnavailableReason;
}

/** Không bao giờ ném, trả lời được cả khi native hỏng. */
function availability(): ZLangAvailability {
	const reason = getUnavailableReason();
	return reason ? { supported: false, reason } : { supported: true };
}

/** Thông tin chẩn đoán, để log và hiển thị. */
function info(): ZLangInfo {
	let backend = 'none';
	let scoreKind: ZLangScoreKind = 'none';
	let version: string | null = null;

	if (nativeBinding) {
		try {
			backend = nativeBinding.backend();
			scoreKind = nativeBinding.scores();
			version = nativeBinding.version();
		} catch {
			// Nạp được nhưng gọi lỗi: giữ mặc định, lý do đã có ở loadError.
		}
	}

	return {
		backend,
		scoreKind,
		version,
		platform,
		loadError: loadError ? loadError.message : null,
	};
}

/**
 * Nhận diện ngôn ngữ của `text`.
 *
 * - Mảng đã sắp giảm dần theo mức độ khả năng — kể cả khi `confidence` là null,
 *   thứ tự vẫn do OS quyết định và vẫn đúng.
 * - Mảng rỗng khi văn bản quá ngắn hoặc không kết luận được: kết quả hợp lệ,
 *   không phải lỗi.
 * - Reject khi backend không dùng được hoặc khi native báo lỗi thật.
 */
function detect(text: string, options?: ZLangDetectOptions): Promise<ZLangHypothesis[]> {
	const reason = getUnavailableReason();
	if (reason) {
		return Promise.reject(new Error(`zlang: cannot detect (${reason})`));
	}

	// `reason` null nghĩa là binding chắc chắn đã nạp được: getUnavailableReason()
	// trả 'native-binding-missing' cho mọi trường hợp nativeBinding là null.
	const binding = nativeBinding as ZLangNativeBinding;

	return binding.detect(text, options ? options.maxResults : undefined).then(function (raw) {
		return raw.map(function (item) {
			return {
				detectedLanguage: item.tag,
				// `== null` bắt cả null lẫn undefined: napi có thể bỏ hẳn field khi
				// phía Rust là None, tuỳ phiên bản. Chuẩn hoá về đúng một giá trị.
				confidence: item.confidence == null ? null : item.confidence,
			};
		});
	});
}

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
function dominantLanguage(text: string): Promise<string | null> {
	return detect(text, { maxResults: 1 }).then(function (results) {
		return results.length > 0 ? results[0].detectedLanguage : null;
	});
}

export { availability, detect, dominantLanguage, info };
