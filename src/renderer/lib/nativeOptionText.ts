/**
 * Đọc/ghi option native dưới dạng text cho ô nhập trên UI.
 *
 * Đây là parse INPUT CỦA NGƯỜI DÙNG, không phải rule nhận diện ngôn ngữ: thẻ gõ
 * vào được chuyển thẳng xuống `NLLanguageRecognizer`, không có bảng tra hay
 * chuẩn hoá nào. Apple tự từ chối thẻ nó không biết.
 */

/** `'en, fr , zh-Hant'` -> `['en','fr','zh-Hant']`. Rỗng -> `[]`. */
export function parseTagList(text: string): string[] {
	return text
		.split(',')
		.map(function (part) {
			return part.trim();
		})
		.filter(function (part) {
			return part.length > 0;
		});
}

/**
 * `'vi:0.9, en:0.1'` -> `{ vi: 0.9, en: 0.1 }`.
 *
 * Bỏ qua mục không có số hợp lệ thay vì ném: người dùng đang gõ dở
 * (`'vi:'`) không phải lỗi, chỉ là chưa xong.
 */
export function parseHints(text: string): { [tag: string]: number } {
	const out: { [tag: string]: number } = {};

	parseTagList(text).forEach(function (entry) {
		const at = entry.indexOf(':');
		if (at === -1) return;

		const tag = entry.slice(0, at).trim();
		const weight = Number(entry.slice(at + 1).trim());
		if (!tag || isNaN(weight)) return;

		out[tag] = weight;
	});

	return out;
}

/**
 * Chặn maxResults trong 1..16 (khớp ZLANG_MAX_RESULTS).
 *
 * Ô rỗng -> `undefined` = KHÔNG truyền, để native tự quyết. Không thay bằng một
 * con số mặc định nào ở tầng này.
 */
export function parseMaxResults(text: string): number | undefined {
	const value = Number(text.trim());
	if (!text.trim() || isNaN(value)) return undefined;
	return Math.max(1, Math.min(16, Math.floor(value)));
}

/** Ô rỗng -> `undefined` = không truyền. Không tự chuyển thành chuỗi rỗng. */
export function parseText(text: string): string | undefined {
	const trimmed = text.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

/** Ô rỗng/không số -> `undefined` = không truyền. Âm bị kẹp về 0. */
export function parseStartIndex(text: string): number | undefined {
	const value = Number(text.trim());
	if (!text.trim() || isNaN(value)) return undefined;
	return Math.max(0, Math.floor(value));
}
