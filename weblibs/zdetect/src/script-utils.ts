/**
 * LAYER 1 — phân loại theo hệ chữ viết (Unicode script). Thuần JS, không phụ
 * thuộc gì, chạy được cả browser lẫn Node.
 *
 * Layer này KHÔNG biết ngôn ngữ cụ thể nào — chỉ trả về category script.
 * Category nào map sang ngôn ngữ gì là việc của config. Nhờ vậy nó tái dùng
 * được cho bất kỳ tổ hợp ngôn ngữ nào.
 */

import { ScriptCategory, ScriptRun } from './types';

/** Xác định category script của một code point. */
export function getScriptCategory(char: string): ScriptCategory {
	const code = char.codePointAt(0);
	if (code === undefined) return 'other';

	// Hangul: Syllables, Jamo, Compatibility Jamo.
	if (
		(code >= 0xac00 && code <= 0xd7a3) ||
		(code >= 0x1100 && code <= 0x11ff) ||
		(code >= 0x3130 && code <= 0x318f)
	) {
		return 'hangul';
	}

	// Han: CJK Unified Ideographs + Extension A + Compatibility.
	if (
		(code >= 0x4e00 && code <= 0x9fff) ||
		(code >= 0x3400 && code <= 0x4dbf) ||
		(code >= 0xf900 && code <= 0xfaff)
	) {
		return 'han';
	}

	// Latin cơ bản + Extended. Dải 1E00–1EFF là chỗ chứa tổ hợp dấu thanh tiếng
	// Việt (ệ, ữ, ắ…) — thiếu nó thì tiếng Việt có dấu rơi vào 'other'.
	if (
		(code >= 0x0041 && code <= 0x005a) ||
		(code >= 0x0061 && code <= 0x007a) ||
		(code >= 0x00c0 && code <= 0x024f) ||
		(code >= 0x1e00 && code <= 0x1eff)
	) {
		return 'latin';
	}

	return 'other';
}

/**
 * Tách văn bản thành các run cùng script.
 *
 * Ký tự 'other' (số, dấu câu, khoảng trắng) KHÔNG tự tạo ranh giới — chúng gộp
 * vào run đang mở. Nếu không thì mỗi dấu cách lại cắt một run và n-gram mất
 * hết thông tin ranh giới từ.
 */
export function segmentByScript(text: string): ScriptRun[] {
	const runs: ScriptRun[] = [];
	let currentCategory: ScriptCategory | null = null;
	let buffer = '';

	// for…of duyệt theo code point, không phải UTF-16 unit — cần thiết cho ký
	// tự ngoài BMP (emoji, Han mở rộng) để không cắt đôi surrogate pair.
	for (const char of text) {
		const category = getScriptCategory(char);

		if (category === 'other') {
			buffer += char;
			continue;
		}

		if (category !== currentCategory) {
			if (buffer.length > 0) {
				runs.push({ category: currentCategory ?? 'other', text: buffer });
			}
			buffer = char;
			currentCategory = category;
		} else {
			buffer += char;
		}
	}

	if (buffer.length > 0) {
		runs.push({ category: currentCategory ?? 'other', text: buffer });
	}

	return runs;
}
