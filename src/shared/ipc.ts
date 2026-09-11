/*
 * `import type` — KHÔNG phải import thường. Kiểu bị xoá lúc biên dịch nên
 * renderer bundle vẫn có 0 tham chiếu tới nativelibs; đổi thành import thường là
 * esbuild sẽ kéo .node vào bundle và gãy.
 *
 * Lấy kiểu từ chính facade thay vì gõ lại: hợp đồng raw mà UI hiển thị phải là
 * hợp đồng thật của nativelibs, lệch một field là log raw nói dối.
 */
import type {
	ZLangDetectionAvailability,
	ZLangDetectorHypothesis,
	ZLangDetectorInfo,
} from '../../nativelibs/zlang';

export interface AppInfo {
	appVersion: string;
	electronVersion: string;
	chromeVersion: string;
	nodeVersion: string;
	/** `process.platform` thô — 'darwin' | 'win32' | 'linux'. Dùng cho logic. */
	platform: string;
	/** Nhãn để hiển thị: 'macOS 15.5', 'Windows 11 (build 22631)', 'Linux 6.8.0'. */
	osLabel: string;
	/** Kiến trúc CPU: 'x64' | 'arm64'. */
	arch: string;
}

/**
 * Một giả thuyết ngôn ngữ do native module trả về — nguyên trạng từ facade,
 * main process không biến đổi gì.
 *
 * `confidence` là `null` khi backend không cho điểm (`scoreKind === 'rank'`:
 * Windows/ELS chỉ xếp hạng). nativelibs không bịa số thay OS — thứ tự phần tử
 * chính là thông tin hạng.
 */
export type NativeLanguageHypothesis = ZLangDetectorHypothesis;

/**
 * Kết quả THÔ của facade `nativelibs/zlang`, đúng như ba hàm của nó trả về.
 *
 * Khác `NativeDetectStatus` ở chỗ: status là bản đã gộp/diễn giải cho UI, còn
 * đây là thứ chưa ai chạm vào — dùng cho phần log raw, để nhìn được chính xác
 * native nói gì.
 */
export interface NativeRawSnapshot {
	/** `zlang.info()` */
	info: ZLangDetectorInfo;
	/** `zlang.availability()` */
	availability: ZLangDetectionAvailability;
}

/**
 * Trạng thái của native module, hỏi một lần rồi UI nhớ lấy.
 * `supported` false thì `reason` cho biết vì sao.
 */
export interface NativeDetectStatus {
	supported: boolean;
	reason: string | null;
	/** 'apple-nl' | 'windows-els' | 'none' */
	backend: string;
	/** 'probability' — xác suất của model; 'rank' — chỉ có thứ hạng, confidence là null. */
	scoreKind: string;
	version: string | null;
}

export const IPC = {
	getAppInfo: 'app:get-info',
	nativeDetectStatus: 'native-detect:status',
	nativeDetect: 'native-detect:detect',
	nativeDetectRaw: 'native-detect:raw',
};

export interface ElectronAPI {
	getAppInfo(): Promise<AppInfo>;
	/** Nhận diện ngôn ngữ bằng model của hệ điều hành (nativelibs/zlang). */
	nativeDetect: {
		status(): Promise<NativeDetectStatus>;
		/** Kết quả thô của `zlang.detect()` — chưa qua adapter Web API nào. */
		detect(text: string): Promise<NativeLanguageHypothesis[]>;
		/** `zlang.info()` + `zlang.availability()` nguyên trạng. Reject nếu không nạp được module. */
		raw(): Promise<NativeRawSnapshot>;
	};
}
