"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.info = exports.detect = exports.availability = void 0;
var ZLangDetectorPlatformSupport;
(function (ZLangDetectorPlatformSupport) {
    // MacOS
    ZLangDetectorPlatformSupport["DARWIN_ARM64"] = "darwin-arm64";
    ZLangDetectorPlatformSupport["DARWIN_X64"] = "darwin-x64";
    // Windows OS
    ZLangDetectorPlatformSupport["WIN32_IA32"] = "win32-ia32";
    ZLangDetectorPlatformSupport["WIN32_X64"] = "win32-x64";
})(ZLangDetectorPlatformSupport || (ZLangDetectorPlatformSupport = {}));
let nativeBinding = null;
let loadError = null;
const platform = `${process.platform}-${process.arch}`;
function asError(value) {
    return value instanceof Error ? value : new Error(String(value));
}
switch (platform) {
    case ZLangDetectorPlatformSupport.DARWIN_ARM64:
        try {
            nativeBinding = require('./darwin-arm64/zlang.darwin-arm64.node');
        }
        catch (e) {
            loadError = asError(e);
        }
        break;
    case ZLangDetectorPlatformSupport.DARWIN_X64:
        try {
            nativeBinding = require('./darwin-x64/zlang.darwin-x64.node');
        }
        catch (e) {
            loadError = asError(e);
        }
        break;
    case ZLangDetectorPlatformSupport.WIN32_IA32:
        try {
            nativeBinding = require('./win32-ia32/zlang.win32-ia32.node');
        }
        catch (e) {
            loadError = asError(e);
        }
        break;
    case ZLangDetectorPlatformSupport.WIN32_X64:
        try {
            nativeBinding = require('./win32-x64/zlang.win32-x64.node');
        }
        catch (e) {
            loadError = asError(e);
        }
        break;
    default:
        loadError = new Error(`zlang is not supported on this OS platform: ${platform}`);
}
function isPlatformSupported() {
    return process.platform === 'darwin' || process.platform === 'win32';
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
        }
        catch (_a) {
            return 'os-service-unavailable';
        }
    })();
    return cachedUnavailableReason;
}
function availability() {
    const reason = getUnavailableReason();
    return reason ? { supported: false, reason: reason } : { supported: true };
}
exports.availability = availability;
// Thông tin chẩn đoán
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
        backend: backend,
        scoreKind: scoreKind,
        version: version,
        platform: platform,
        loadError: loadError ? loadError.message : null,
    };
}
exports.info = info;
/**
 * Nhận diện ngôn ngữ của `text`.
 *
 * - Trả về mảng đã sắp giảm dần theo mức độ khả năng — kể cả khi `confidence`
 * là null, thứ tự vẫn do OS quyết định và vẫn đúng.
 * - Mảng rỗng khi văn bản quá ngắn hoặc không kết luận được — đó là kết quả
 * hợp lệ, không phải lỗi.
 * - Chỉ reject khi backend không dùng được hoặc native báo lỗi thật.
 */
function detect(props) {
    const { text } = props;
    const reason = getUnavailableReason();
    if (reason) {
        return Promise.reject(new Error(`zlang: cannot detect (${reason})`));
    }
    // `reason` null nghĩa là binding chắc chắn đã nạp được: getUnavailableReason()
    // trả 'native-binding-missing' cho mọi trường hợp `nativeBinding` là null.
    // Khẳng định kiểu ở đây thay cho một lần kiểm tra không bao giờ đúng.
    const binding = nativeBinding;
    return binding.detect(text).then(function (raw) {
        const results = [];
        for (let i = 0; i < raw.length; i++) {
            // `== null` bắt cả null lẫn undefined: napi có thể bỏ hẳn field khi
            // phía Rust là None, tuỳ phiên bản. Chuẩn hoá về đúng một giá trị.
            const confidence = raw[i].confidence == null ? null : raw[i].confidence;
            results.push({ detectedLanguage: raw[i].tag, confidence: confidence });
        }
        return results;
    });
}
exports.detect = detect;
