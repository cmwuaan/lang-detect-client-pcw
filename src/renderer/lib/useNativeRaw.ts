import * as React from 'react';

import { NativeDetection, NativeRawSnapshot } from '@shared/ipc';

import { NativeDetectorOptions } from '../services/detection/LanguageDetector';

/** Một lời gọi facade: hoặc có giá trị, hoặc có lỗi — không bao giờ cả hai. */
export interface RawCall<T> {
	value: T | null;
	error: string | null;
	pending: boolean;
}

export interface NativeRawState {
	/** false khi chạy bản web: không có bridge sang native để mà log. */
	hasBridge: boolean;
	/** `zlang.info()` */
	info: RawCall<NativeRawSnapshot['info']>;
	/** `zlang.availability()` */
	availability: RawCall<NativeRawSnapshot['availability']>;
	/** `zlang.detect({ text, ...options })` */
	detect: RawCall<NativeDetection>;
}

function idle<T>(): RawCall<T> {
	return { value: null, error: null, pending: false };
}

function messageOf(err: unknown): string {
	const asError = err as { message?: string } | null;
	return asError && asError.message ? asError.message : String(err);
}

/**
 * Đọc kết quả THÔ của ba hàm facade `nativelibs/zlang` để hiển thị nguyên trạng.
 *
 * VÌ SAO GỌI THẲNG NATIVE, KHÔNG TÁI SỬ DỤNG KẾT QUẢ CỦA PROVIDER: kết quả đi
 * qua `NativeDetectorProvider` đã bị adapter Web API chỉnh (quy đổi hạng thành
 * số, chèn phần tử 'und'). Panel này tồn tại để thấy đúng thứ native trả ra,
 * nên nó phải tự gọi. Cái giá là một lời gọi detect() thêm cho mỗi lần text đổi
 * — detect() tốn dưới 1ms nên chấp nhận được.
 *
 * `info` và `availability` chỉ đọc một lần: cả hai được cache trong facade
 * (availability hỏi OS đúng một lần rồi nhớ), gọi lại cũng ra cùng giá trị.
 *
 * `options` đi thẳng xuống native. Effect phụ thuộc bản JSON của nó chứ không
 * phải chính object: caller dựng object mới mỗi lần render, so sánh tham chiếu
 * sẽ gọi lại native ở MỌI render.
 */
export function useNativeRaw(text: string, options: NativeDetectorOptions): NativeRawState {
	const api = window.electronAPI ? window.electronAPI.nativeDetect : undefined;
	const hasBridge = !!api;
	const optionsKey = JSON.stringify(options);

	const [snapshot, setSnapshot] = React.useState<RawCall<NativeRawSnapshot>>(idle);
	const [detect, setDetect] = React.useState<RawCall<NativeDetection>>(idle);

	React.useEffect(
		function () {
			if (!api) return undefined;
			let alive = true;

			setSnapshot({ value: null, error: null, pending: true });
			api.raw().then(
				function (value) {
					if (alive) setSnapshot({ value: value, error: null, pending: false });
				},
				function (err) {
					if (alive) setSnapshot({ value: null, error: messageOf(err), pending: false });
				}
			);

			return function () {
				alive = false;
			};
		},
		[api]
	);

	React.useEffect(
		function () {
			if (!api) return undefined;
			let alive = true;

			setDetect(function (prev) {
				// Giữ giá trị cũ trong lúc chờ: panel không nhấp nháy khi đang gõ.
				return { value: prev.value, error: null, pending: true };
			});

			const parsed = JSON.parse(optionsKey) as NativeDetectorOptions;

			api
				.detect({
					text: text,
					maxResults: parsed.maxResults,
					constraints: parsed.constraints,
					hints: parsed.hints,
					inputLanguage: parsed.inputLanguage,
					inputScript: parsed.inputScript,
					startIndex: parsed.startIndex,
				})
				.then(
					function (value) {
						if (alive) setDetect({ value: value, error: null, pending: false });
					},
					function (err) {
						if (alive) setDetect({ value: null, error: messageOf(err), pending: false });
					}
				);

			return function () {
				alive = false;
			};
		},
		[api, text, optionsKey]
	);

	return {
		hasBridge: hasBridge,
		info: {
			value: snapshot.value ? snapshot.value.info : null,
			error: snapshot.error,
			pending: snapshot.pending,
		},
		availability: {
			value: snapshot.value ? snapshot.value.availability : null,
			error: snapshot.error,
			pending: snapshot.pending,
		},
		detect: detect,
	};
}
