/**
 * File DUY NHẤT biết về bốn ngôn ngữ cụ thể của project (ko/zh/vi/en).
 * `core-detector.ts` hoàn toàn generic — đổi/thêm ngôn ngữ chỉ sửa ở đây.
 *
 * MÔ HÌNH ĐƯỢC IMPORT, KHÔNG ĐỌC BẰNG fs. Bản JS cũ dùng `node:fs` +
 * `import.meta.url` nên không chạy được trong browser. `import` JSON để bundler
 * inline thẳng vào bundle: không I/O, không đường dẫn lúc chạy, không fetch.
 */

import { LanguageDetector } from './core-detector';
import enModel from '../profiles/en.model.json';
import viModel from '../profiles/vi.model.json';
import viLexicon from '../profiles/vi.lexicon.json';

/**
 * Ký tự CHỈ tiếng Việt có, trong cặp ứng viên {vi, en}.
 *
 * Gồm nguyên âm có dấu phụ (ă â ê ô ơ ư), `đ`, và toàn bộ nguyên âm mang dấu
 * thanh. Tiếng Anh không có ký tự nào trong danh sách này, nên thấy một ký tự
 * là chốt được ngay — không cần chạy mô hình thống kê.
 *
 * Tương ứng `Language::unique_characters()` của lingua. Đây là tầng luật rẻ
 * nhất và chắc nhất; chỉ khi văn bản MẤT DẤU (teencode) nó mới mù, và lúc đó
 * lexicon coverage tiếp quản.
 */
const VIETNAMESE_UNIQUE_CHARS =
	'ăâđêôơư' +
	'áàảãạ' +
	'ắằẳẵặ' +
	'ấầẩẫậ' +
	'éèẻẽẹ' +
	'ếềểễệ' +
	'íìỉĩị' +
	'óòỏõọ' +
	'ốồổỗộ' +
	'ớờởỡợ' +
	'úùủũụ' +
	'ứừửữự' +
	'ýỳỷỹỵ';

export const detector = new LanguageDetector({
	// Script map thẳng — độ chính xác gần như tuyệt đối, không cần Layer 3.
	scriptDirectMap: {
		hangul: 'ko',
		han: 'zh',
	},

	// Script cần Layer 3 để tách các ngôn ngữ dùng chung hệ chữ.
	scriptGroups: {
		latin: ['vi', 'en'],
	},

	// Mô hình xác suất có điều kiện dạng log, sinh bởi scripts/train.ts.
	models: {
		vi: viModel,
		en: enModel,
	},

	classifierOptions: {
		minReliableLength: 8,

		uniqueCharacters: {
			vi: VIETNAMESE_UNIQUE_CHARS,
		},

		// Lexicon booster — GENERIC, ngôn ngữ nào trong scriptGroups cũng đăng ký
		// được. Bắt teencode/viết tắt mà cả luật ký tự lẫn n-gram đều khó nhận.
		lexicons: {
			vi: viLexicon,
		},
		lexiconCoverageThreshold: 0.25,
		lexiconDominanceRatio: 1.5,
	},
});
