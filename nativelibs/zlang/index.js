"use strict";
/* eslint-disable global-require */
Object.defineProperty(exports, "__esModule", { value: true });
exports.detect = exports.info = exports.availability = void 0;
const DEFAULT_MAX_RESULTS = 3;
/** Khớp ZLANG_MAX_RESULTS trong src/zlang_bridge.h. */
const MAX_RESULTS = 16;
const slice = process.platform + '-' + process.arch;
let binding = null;
let loadError = null;
/*
 * require() với đường dẫn hằng, không ghép chuỗi: bundler (webpack của
 * zalo-pc-app, esbuild ở repo này) đọc được đường dẫn tĩnh, và grep tìm ra file
 * nào được nạp ở đâu.
 */
switch (slice) {
    case 'darwin-arm64':
        try {
            binding = require('./darwin-arm64/zlang.darwin-arm64.node');
        }
        catch (e) {
            loadError = e;
        }
        break;
    case 'darwin-x64':
        try {
            binding = require('./darwin-x64/zlang.darwin-x64.node');
        }
        catch (e) {
            loadError = e;
        }
        break;
    case 'win32-ia32':
        try {
            binding = require('./win32-ia32/zlang.win32-ia32.node');
        }
        catch (e) {
            loadError = e;
        }
        break;
    case 'win32-x64':
        try {
            binding = require('./win32-x64/zlang.win32-x64.node');
        }
        catch (e) {
            loadError = e;
        }
        break;
    default:
        loadError = new Error('zlang: không hỗ trợ ' + slice);
}
/**
 * Backend Windows phải hỏi OS mới biết dịch vụ có bật không, nên cache lại:
 * availability() được gọi mỗi lần UI đổi provider.
 */
let cachedReason;
function unavailableReason() {
    if (cachedReason !== undefined)
        return cachedReason;
    cachedReason = (function () {
        if (slice.indexOf('darwin') !== 0 && slice.indexOf('win32') !== 0) {
            return 'unsupported-platform';
        }
        if (!binding)
            return 'native-binding-missing';
        try {
            return binding.available() ? null : 'os-service-unavailable';
        }
        catch (e) {
            return 'os-service-unavailable';
        }
    })();
    return cachedReason;
}
/** Có nhận diện được ngay bây giờ không. Không bao giờ ném. */
function availability() {
    const reason = unavailableReason();
    return reason ? { supported: false, reason: reason } : { supported: true };
}
exports.availability = availability;
/** Thông tin chẩn đoán — hiện lên UI/log, không dùng cho luồng nghiệp vụ. */
function info() {
    let backend = 'none';
    let scoreKind = 'none';
    let version = null;
    if (binding) {
        try {
            backend = binding.backend();
            scoreKind = binding.scores();
            version = binding.version();
        }
        catch (e) {
            /* Binding nạp được nhưng gọi lỗi: giữ giá trị mặc định, báo qua loadError. */
        }
    }
    return {
        backend: backend,
        scoreKind: scoreKind,
        version: version,
        slice: slice,
        loadError: loadError ? loadError.message : null,
    };
}
exports.info = info;
/**
 * Nhận diện ngôn ngữ của `text`.
 *
 * Trả về mảng đã sắp giảm dần theo confidence; mảng RỖNG khi văn bản quá ngắn
 * hoặc không kết luận được — đó là kết quả hợp lệ, không phải lỗi. Chỉ reject
 * khi backend không dùng được hoặc native báo lỗi thật.
 */
function detect(text, options) {
    const reason = unavailableReason();
    if (reason || !binding) {
        return Promise.reject(new Error('zlang: không nhận diện được (' + (reason || 'unknown') + ')'));
    }
    const requested = options && options.maxResults ? options.maxResults : DEFAULT_MAX_RESULTS;
    const maxResults = Math.max(1, Math.min(MAX_RESULTS, Math.floor(requested)));
    return binding.detect(text, maxResults).then(function (raw) {
        const out = [];
        for (let i = 0; i < raw.length; i++) {
            out.push({ detectedLanguage: raw[i].tag, confidence: raw[i].confidence });
        }
        return out;
    });
}
exports.detect = detect;
