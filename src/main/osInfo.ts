import * as os from 'os';

/**
 * Nhãn hệ điều hành đọc được: 'macOS 15.5', 'Windows 11 (build 22631)',
 * 'Linux 6.8.0'.
 *
 * Dùng `process.getSystemVersion()` (API của Electron) chứ không dùng
 * `os.release()`: trên macOS, `os.release()` trả về version của kernel Darwin
 * ('24.5.0') chứ không phải version macOS mà người dùng biết ('15.5').
 */

/** major.minor -> tên thương mại, cho các bản Windows trước Windows 10. */
const WINDOWS_LEGACY_NAMES: { [majorMinor: string]: string } = {
	'5.1': 'Windows XP',
	'6.0': 'Windows Vista',
	'6.1': 'Windows 7',
	'6.2': 'Windows 8',
	'6.3': 'Windows 8.1',
};

/** Windows 11 bắt đầu từ build này. */
const WINDOWS_11_MIN_BUILD = 22000;

/** Export để test được mà không cần chạy trên Windows thật. */
export function windowsLabel(version: string): string {
	const parts = version.split('.');
	const majorMinor = parts[0] + '.' + parts[1];

	const legacy = WINDOWS_LEGACY_NAMES[majorMinor];
	if (legacy) return legacy;

	if (majorMinor === '10.0') {
		// Windows 10 và 11 dùng CHUNG major.minor '10.0'; chỉ số build tách được
		// hai bản, nên không thể chỉ dựa vào major.minor.
		const build = Number(parts[2] || 0);
		const name = build >= WINDOWS_11_MIN_BUILD ? 'Windows 11' : 'Windows 10';
		return build > 0 ? name + ' (build ' + build + ')' : name;
	}

	// Bản Windows lạ/mới hơn -> hiện nguyên số, đừng đoán sai tên.
	return 'Windows ' + version;
}

/**
 * macOS luôn được viết là '26.5' / '10.15', nhưng getSystemVersion() trả về
 * '26.5.0' — bỏ đúng MỘT '.0' ở cuối. ('11.0.0' -> '11.0', giữ đúng cách viết
 * của Big Sur; '10.15.7' không đổi.)
 */
function trimTrailingZero(version: string): string {
	return version.replace(/\.0$/, '');
}

export function osLabel(): string {
	const version = process.getSystemVersion();

	switch (process.platform) {
		case 'darwin':
			return 'macOS ' + trimTrailingZero(version);
		case 'win32':
			return windowsLabel(version);
		case 'linux':
			// Không có cách đáng tin cậy để lấy tên distro từ Node, nên hiện version
			// kernel — đó là thứ duy nhất chắc chắn đúng.
			return 'Linux ' + os.release();
		default:
			return process.platform + ' ' + version;
	}
}
