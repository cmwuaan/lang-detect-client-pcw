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

/** Một giả thuyết ngôn ngữ do native module trả về. */
export interface NativeLanguageHypothesis {
	/** Thẻ BCP 47: 'vi', 'en', 'zh-Hans'… */
	detectedLanguage: string;
	/** 0..1. Ý nghĩa tuỳ `scoreKind`. */
	confidence: number;
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
	/** 'probability' — xác suất của model; 'rank' — chỉ suy ra từ thứ hạng. */
	scoreKind: string;
	version: string | null;
}

export const IPC = {
	getAppInfo: 'app:get-info',
	nativeDetectStatus: 'native-detect:status',
	nativeDetect: 'native-detect:detect',
};

export interface ElectronAPI {
	getAppInfo(): Promise<AppInfo>;
	/** Nhận diện ngôn ngữ bằng model của hệ điều hành (nativelibs/zlang). */
	nativeDetect: {
		status(): Promise<NativeDetectStatus>;
		detect(text: string, maxResults?: number): Promise<NativeLanguageHypothesis[]>;
	};
}
