import { IpcMain } from 'electron';
import * as path from 'path';

import {
	NativeDetection,
	NativeDetectOptions,
	NativeDetectStatus,
	NativeRawSnapshot,
	IPC,
} from '@shared/ipc';

import type NativeLibs from '../../nativelibs';

/**
 * Cầu nối giữa main process và nativelibs/zlang.
 *
 * Cùng cách zalo-pc-app dùng nativelibs: main/preload gọi `require('nativelibs')`
 * rồi lấy module theo tên (`.zlang()`), native module không bao giờ được bundle
 * vào bundle JS — nó phải nằm ngoài để `.node` còn nạp được.
 *
 * Ở repo này đường dẫn là tương đối tới thư mục nativelibs/ cạnh dist/, khớp với
 * external `commonjs2 ../native/nativelibs` mà webpack của zalo-pc-app dùng.
 */

/** dist/main/main.js -> <root>/nativelibs. Giữ đúng cả khi đã đóng gói. */
const NATIVELIBS_DIR = path.join(__dirname, '..', '..', 'nativelibs');

type Zlang = ReturnType<typeof NativeLibs.zlang>;

let zlang: Zlang | null = null;
let loadError: Error | null = null;

/**
 * Nạp trễ và chỉ nạp một lần. Native module lỗi thì app vẫn chạy, chỉ phương
 * pháp này báo không khả dụng — nên không có require nào ở top level.
 */
function nativeModule(): Zlang | null {
	if (zlang || loadError) return zlang;
	try {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const nativelibs = require(NATIVELIBS_DIR) as typeof NativeLibs;
		zlang = nativelibs.zlang();
	} catch (err) {
		loadError = err instanceof Error ? err : new Error(String(err));
		console.error('[nativeDetect] không nạp được nativelibs/zlang:', loadError.message);
	}
	return zlang;
}

function status(): NativeDetectStatus {
	const module = nativeModule();

	if (!module) {
		return {
			supported: false,
			reason: loadError ? 'load-failed: ' + loadError.message : 'native-binding-missing',
			backend: 'none',
			scoreKind: 'none',
			capabilities: {
				constraints: false,
				hints: false,
				dominant: false,
				inputLanguage: false,
				inputScript: false,
				startIndex: false,
			},
			version: null,
		};
	}

	const availability = module.availability();
	const info = module.info();

	/*
	 * `reason` của zlang là mã phân loại ('native-binding-missing'), còn câu lỗi
	 * thật của OS nằm ở `info.loadError` — và trước đây nó bị vứt đi. Trên
	 * Windows 7 UI chỉ hiện 'native-binding-missing', trong khi loadError nói rõ
	 * "The specified module could not be found": đủ để biết là thiếu DLL phụ
	 * thuộc chứ không phải thiếu file .node. Ghép cả hai vào.
	 */
	const reason = availability.reason
		? availability.reason + (info.loadError ? ': ' + info.loadError : '')
		: null;

	return {
		supported: availability.supported,
		reason: reason,
		backend: info.backend,
		scoreKind: info.scoreKind,
		capabilities: info.capabilities,
		version: info.version,
	};
}

/**
 * `options` đi thẳng xuống facade, không lọc không sửa: renderer là nơi quyết
 * định truyền gì, và zlang đã tự reject khi backend không hỗ trợ.
 */
async function detect(options: NativeDetectOptions): Promise<NativeDetection> {
	const module = nativeModule();
	if (!module) throw new Error('nativelibs/zlang không nạp được');

	return module.detect(options);
}

/**
 * Ba hàm của facade, trả về **nguyên trạng** — không gộp, không diễn giải.
 *
 * `status()` ở trên cố tình gộp `availability.reason` với `info.loadError` cho
 * UI dễ đọc; hàm này thì không được làm vậy, vì nó tồn tại để nhìn thấy đúng thứ
 * native nói. Ném lỗi khi module không nạp được: câu lỗi đó cũng là thông tin.
 */
function rawSnapshot(): NativeRawSnapshot {
	const module = nativeModule();
	if (!module) {
		throw new Error(
			'nativelibs/zlang không nạp được' + (loadError ? ': ' + loadError.message : '')
		);
	}
	return { info: module.info(), availability: module.availability() };
}

export function registerNativeDetectHandlers(ipcMain: IpcMain): void {
	ipcMain.handle(IPC.nativeDetectStatus, function (): NativeDetectStatus {
		return status();
	});

	ipcMain.handle(IPC.nativeDetect, function (
		_event,
		options: NativeDetectOptions
	): Promise<NativeDetection> {
		return detect(options);
	});

	ipcMain.handle(IPC.nativeDetectRaw, function (): NativeRawSnapshot {
		return rawSnapshot();
	});
}
