/**
 * Tách văn bản thành token theo kiểu lingua-rs (`constant.rs::TOKENS_WITHOUT_WHITESPACE`).
 *
 * Điểm mấu chốt: **chữ Hán tách TỪNG KÝ TỰ**, các hệ chữ khác gom thành cụm.
 * Tiếng Trung/Nhật không có khoảng trắng giữa từ, nên gom cả câu Hán thành một
 * token sẽ khiến n-gram bắt ngẫu nhiên qua ranh giới từ và vô nghĩa.
 *
 * Khác `tokenizeWords` của ngram-utils ở hai chỗ: không tách theo khoảng trắng
 * (dùng lớp ký tự Unicode), và không giữ chữ số — chữ số không mang tín hiệu
 * ngôn ngữ nào.
 */

/**
 * `\p{sc=Han}` một ký tự; Hangul/Hiragana/Katakana/chữ cái khác gom cụm.
 *
 * Thứ tự nhánh quan trọng: `\p{L}+` phải đứng CUỐI, nếu không nó nuốt luôn cả
 * Hangul và Han trước khi các nhánh riêng kịp khớp.
 */
const TOKEN_PATTERN =
	/\p{sc=Han}|\p{sc=Hangul}+|\p{sc=Hiragana}+|\p{sc=Katakana}+|\p{sc=Thai}+|\p{L}+/gu;

/** Token đã hạ chữ thường, không chứa khoảng trắng, dấu câu hay chữ số. */
export function tokenize(text: string): string[] {
	const matches = text.toLowerCase().match(TOKEN_PATTERN);
	return matches === null ? [] : matches;
}

/**
 * Mọi n-gram độ dài `order` có trong danh sách token, KHÔNG trùng lặp.
 *
 * Không đệm khoảng trắng hai đầu như Cavnar–Trenkle: ranh giới từ đã do
 * tokenizer lo, mã hoá lại vào n-gram chỉ làm loãng thống kê.
 *
 * Dùng Set vì lingua cũng vậy — một n-gram lặp 10 lần trong câu không nên được
 * tính 10 lần vào tổng log-probability.
 */
export function ngramsOfOrder(tokens: string[], order: number): string[] {
	const seen = new Set<string>();

	for (const token of tokens) {
		// Array.from để đếm theo code point, không phải UTF-16 unit.
		const chars = Array.from(token);
		for (let i = 0; i + order <= chars.length; i++) {
			seen.add(chars.slice(i, i + order).join(''));
		}
	}

	return Array.from(seen);
}

/** Tổng số ký tự của mọi token — dùng để chọn dải bậc n-gram. */
export function characterCount(tokens: string[]): number {
	let count = 0;
	for (const token of tokens) count += Array.from(token).length;
	return count;
}
