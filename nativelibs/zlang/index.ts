/* eslint-disable global-require */

/**
 * zlang — facade nhận diện ngôn ngữ dùng model có sẵn của hệ điều hành.
 *
 *   macOS   Apple NaturalLanguage (NLLanguageRecognizer) — xác suất của model.
 *   Windows Extended Linguistic Services, "Microsoft Language Detection" —
 *           chỉ có thứ hạng, confidence được suy ra từ hạng.
 *
 * Không tải model, không cần mạng, không asset nào đi kèm bản build, không
 * tiến trình phụ: mọi thứ nằm trong .node và trong OS.
 *
 * Tầng này giữ ba việc: chọn prebuilt đúng platform, dịch dữ liệu thô của
 * binding sang hình dạng công khai, và trả lời "có dùng được không" mà không ném
 * exception. Mọi logic nhận diện nằm ở native.
 */

/** Ý nghĩa con số `confidence` — không so sánh chéo hai loại này với nhau. */
export type ScoreKind = 'probability' | 'rank' | 'none' | 'unknown';

export type ZlangUnavailableReason =
  /* OS không có backend nào (Linux). */
  | 'unsupported-platform'
  /* Có backend nhưng thiếu file .node cho platform-arch này. */
  | 'native-binding-missing'
  /* Có .node nhưng dịch vụ của OS không trả lời (ELS bị tắt, macOS quá cũ). */
  | 'os-service-unavailable';

export interface LanguageHypothesis {
  /** Thẻ BCP 47: 'vi', 'en', 'zh-Hans'… */
  detectedLanguage: string;
  /** 0..1. Xem `info().scoreKind` trước khi diễn giải. */
  confidence: number;
}

export interface ZlangAvailability {
  supported: boolean;
  reason?: ZlangUnavailableReason;
}

export interface ZlangInfo {
  /** 'apple-nl' | 'windows-els' | 'none' */
  backend: string;
  scoreKind: ScoreKind;
  /** Version của native binding; null khi không nạp được. */
  version: string | null;
  /** `${process.platform}-${process.arch}` */
  slice: string;
  /** Lý do require() thất bại, để log. null khi không có lỗi. */
  loadError: string | null;
}

export interface DetectOptions {
  /** Số giả thuyết tối đa; chặn trong khoảng 1..16. Mặc định 3. */
  maxResults?: number;
}

/** Hình dạng thô của .node — khớp src/lib.rs. */
interface NativeBinding {
  platform(): string;
  version(): string;
  backend(): string;
  available(): boolean;
  scores(): string;
  detect(text: string, maxResults?: number): Promise<Array<{ tag: string; confidence: number }>>;
}

const DEFAULT_MAX_RESULTS = 3;
/** Khớp ZLANG_MAX_RESULTS trong src/zlang_bridge.h. */
const MAX_RESULTS = 16;

const slice = process.platform + '-' + process.arch;

let binding: NativeBinding | null = null;
let loadError: Error | null = null;

/*
 * require() với đường dẫn hằng, không ghép chuỗi: bundler (webpack của
 * zalo-pc-app, esbuild ở repo này) đọc được đường dẫn tĩnh, và grep tìm ra file
 * nào được nạp ở đâu.
 */
switch (slice) {
  case 'darwin-arm64':
    try {
      binding = require('./darwin-arm64/zlang.darwin-arm64.node');
    } catch (e) {
      loadError = e;
    }
    break;
  case 'darwin-x64':
    try {
      binding = require('./darwin-x64/zlang.darwin-x64.node');
    } catch (e) {
      loadError = e;
    }
    break;
  case 'win32-ia32':
    try {
      binding = require('./win32-ia32/zlang.win32-ia32.node');
    } catch (e) {
      loadError = e;
    }
    break;
  case 'win32-x64':
    try {
      binding = require('./win32-x64/zlang.win32-x64.node');
    } catch (e) {
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
let cachedReason: ZlangUnavailableReason | null | undefined;

function unavailableReason(): ZlangUnavailableReason | null {
  if (cachedReason !== undefined) return cachedReason;

  cachedReason = (function (): ZlangUnavailableReason | null {
    if (slice.indexOf('darwin') !== 0 && slice.indexOf('win32') !== 0) {
      return 'unsupported-platform';
    }
    if (!binding) return 'native-binding-missing';
    try {
      return binding.available() ? null : 'os-service-unavailable';
    } catch (e) {
      return 'os-service-unavailable';
    }
  })();

  return cachedReason;
}

/** Có nhận diện được ngay bây giờ không. Không bao giờ ném. */
export function availability(): ZlangAvailability {
  const reason = unavailableReason();
  return reason ? { supported: false, reason: reason } : { supported: true };
}

/** Thông tin chẩn đoán — hiện lên UI/log, không dùng cho luồng nghiệp vụ. */
export function info(): ZlangInfo {
  let backend = 'none';
  let scoreKind: ScoreKind = 'none';
  let version: string | null = null;

  if (binding) {
    try {
      backend = binding.backend();
      scoreKind = binding.scores() as ScoreKind;
      version = binding.version();
    } catch (e) {
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

/**
 * Nhận diện ngôn ngữ của `text`.
 *
 * Trả về mảng đã sắp giảm dần theo confidence; mảng RỖNG khi văn bản quá ngắn
 * hoặc không kết luận được — đó là kết quả hợp lệ, không phải lỗi. Chỉ reject
 * khi backend không dùng được hoặc native báo lỗi thật.
 */
export function detect(text: string, options?: DetectOptions): Promise<LanguageHypothesis[]> {
  const reason = unavailableReason();
  if (reason || !binding) {
    return Promise.reject(new Error('zlang: không nhận diện được (' + (reason || 'unknown') + ')'));
  }

  const requested = options && options.maxResults ? options.maxResults : DEFAULT_MAX_RESULTS;
  const maxResults = Math.max(1, Math.min(MAX_RESULTS, Math.floor(requested)));

  return binding.detect(text, maxResults).then(function (raw) {
    const out: LanguageHypothesis[] = [];
    for (let i = 0; i < raw.length; i++) {
      out.push({ detectedLanguage: raw[i].tag, confidence: raw[i].confidence });
    }
    return out;
  });
}
