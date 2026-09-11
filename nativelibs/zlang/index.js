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
exports.info = exports.detect = exports.capabilities = exports.availability = void 0;
/** Không nạp được native thì không có option nào dùng được. */
const NO_CAPABILITIES = {
    constraints: false,
    hints: false,
    dominant: false,
    inputLanguage: false,
    inputScript: false,
    startIndex: false,
};
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
    let capabilities = NO_CAPABILITIES;
    if (nativeBinding) {
        try {
            backend = nativeBinding.backend();
            scoreKind = nativeBinding.scores();
            version = nativeBinding.version();
            capabilities = nativeBinding.capabilities();
        }
        catch (_a) {
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
exports.info = info;
/** `{ vi: 0.9 }` -> `[{ tag: 'vi', weight: 0.9 }]` cho bề mặt napi. */
function toHintList(hints) {
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
function detect(props) {
    const { text, maxResults, constraints, hints, inputLanguage, inputScript, startIndex } = props;
    const reason = getUnavailableReason();
    if (reason) {
        return Promise.reject(new Error(`zlang: cannot detect (${reason})`));
    }
    // `reason` null nghĩa là binding chắc chắn đã nạp được: getUnavailableReason()
    // trả 'native-binding-missing' cho mọi trường hợp `nativeBinding` là null.
    // Khẳng định kiểu ở đây thay cho một lần kiểm tra không bao giờ đúng.
    const binding = nativeBinding;
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
        const hypotheses = [];
        for (let i = 0; i < raw.hypotheses.length; i++) {
            // `== null` bắt cả null lẫn undefined: napi có thể bỏ hẳn field khi
            // phía Rust là None, tuỳ phiên bản. Chuẩn hoá về đúng một giá trị.
            const confidence = raw.hypotheses[i].confidence == null ? null : raw.hypotheses[i].confidence;
            hypotheses.push({ detectedLanguage: raw.hypotheses[i].tag, confidence: confidence });
        }
        return {
            hypotheses: hypotheses,
            dominantLanguage: raw.dominant == null ? null : raw.dominant,
        };
    });
}
exports.detect = detect;
/** Ngắn gọn cho `info().capabilities` — hỏi trước khi truyền option. */
function capabilities() {
    return info().capabilities;
}
exports.capabilities = capabilities;
