"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.info = exports.dominantLanguage = exports.detect = exports.availability = void 0;
var SupportedPlatform;
(function (SupportedPlatform) {
    SupportedPlatform["DARWIN_ARM64"] = "darwin-arm64";
    SupportedPlatform["DARWIN_X64"] = "darwin-x64";
    SupportedPlatform["WIN32_IA32"] = "win32-ia32";
    SupportedPlatform["WIN32_X64"] = "win32-x64";
})(SupportedPlatform || (SupportedPlatform = {}));
let nativeBinding = null;
let loadError = null;
const platform = `${process.platform}-${process.arch}`;
function asError(value) {
    return value instanceof Error ? value : new Error(String(value));
}
/**
 * Nạp trong try/catch: module phải `require` được cả khi thiếu .node, để app
 * không cần bọc try/catch quanh việc import và vẫn hỏi được availability().
 */
function load(dir) {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        nativeBinding = require(`./${dir}/zlang.${dir}.node`);
    }
    catch (e) {
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
let cachedUnavailableReason;
function getUnavailableReason() {
    if (cachedUnavailableReason !== undefined)
        return cachedUnavailableReason;
    cachedUnavailableReason = (function () {
        if (process.platform !== 'darwin' && process.platform !== 'win32') {
            return 'unsupported-platform';
        }
        if (!nativeBinding) {
            return 'native-binding-missing';
        }
        try {
            return nativeBinding.available() ? null : 'os-service-unavailable';
        }
        catch (_a) {
            return 'os-service-unavailable';
        }
    })();
    return cachedUnavailableReason;
}
/** Không bao giờ ném, trả lời được cả khi native hỏng. */
function availability() {
    const reason = getUnavailableReason();
    return reason ? { supported: false, reason } : { supported: true };
}
exports.availability = availability;
/** Thông tin chẩn đoán, để log và hiển thị. */
function info() {
    let backend = 'none';
    let scoreKind = 'none';
    let version = null;
    if (nativeBinding) {
        try {
            backend = nativeBinding.backend();
            scoreKind = nativeBinding.scores();
            version = nativeBinding.version();
        }
        catch (_a) {
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
exports.info = info;
/**
 * Nhận diện ngôn ngữ của `text`.
 *
 * - Mảng đã sắp giảm dần theo mức độ khả năng — kể cả khi `confidence` là null,
 *   thứ tự vẫn do OS quyết định và vẫn đúng.
 * - Mảng rỗng khi văn bản quá ngắn hoặc không kết luận được: kết quả hợp lệ,
 *   không phải lỗi.
 * - Reject khi backend không dùng được hoặc khi native báo lỗi thật.
 */
function detect(text, options) {
    const reason = getUnavailableReason();
    if (reason) {
        return Promise.reject(new Error(`zlang: cannot detect (${reason})`));
    }
    // `reason` null nghĩa là binding chắc chắn đã nạp được: getUnavailableReason()
    // trả 'native-binding-missing' cho mọi trường hợp nativeBinding là null.
    const binding = nativeBinding;
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
exports.detect = detect;
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
function dominantLanguage(text) {
    return detect(text, { maxResults: 1 }).then(function (results) {
        return results.length > 0 ? results[0].detectedLanguage : null;
    });
}
exports.dominantLanguage = dominantLanguage;
