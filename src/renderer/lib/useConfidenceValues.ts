import * as React from 'react';

import {
	LanguageDetectionResult,
	LanguageDetectorProvider,
} from '../services/detection/LanguageDetector';

/**
 * Điểm gốc của engine cho MỌI ngôn ngữ nó biết — tương ứng
 * `compute_language_confidence_values()` của lingua.
 *
 * Chỉ chạy khi provider có `computeConfidenceValues`. Provider native KHÔNG có:
 * điểm thô của nó đã về qua đường `useNativeRaw` rồi, gọi thêm lần nữa là một
 * lời gọi IPC thừa cho mỗi nhịp gõ.
 *
 * Trả mảng RỖNG khi không lấy được — bên gọi phải chịu được, và mảng rỗng hiển
 * thị thành "không có giả thuyết" chứ không phải số 0 giả.
 */
export function useConfidenceValues(
	provider: LanguageDetectorProvider,
	text: string
): LanguageDetectionResult[] {
	const [values, setValues] = React.useState<LanguageDetectionResult[]>([]);

	React.useEffect(
		function () {
			if (!provider.computeConfidenceValues) {
				setValues([]);
				return undefined;
			}

			let alive = true;
			provider.computeConfidenceValues(text).then(
				function (next) {
					if (alive) setValues(next);
				},
				function () {
					if (alive) setValues([]);
				}
			);

			return function () {
				alive = false;
			};
		},
		[provider, text]
	);

	return values;
}
