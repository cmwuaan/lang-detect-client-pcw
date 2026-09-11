/**
 * LAYER 0 — chuẩn hoá văn bản trước khi đưa vào các layer phân loại.
 *
 * Bỏ phần không mang tín hiệu ngôn ngữ (URL, email, số) và đưa Unicode về dạng
 * composed (NFC). Thiếu NFC thì cùng một ký tự có dấu bị encode hai cách khác
 * nhau ("ệ" liền vs "e" + dấu tổ hợp) và bị đếm thành hai n-gram khác nhau.
 */

const URL_PATTERN = /https?:\/\/\S+/g;
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const DIGITS_PATTERN = /\d+/g;

export function normalize(text: string): string {
	return text
		.normalize('NFC')
		.replace(URL_PATTERN, ' ')
		.replace(EMAIL_PATTERN, ' ')
		.replace(DIGITS_PATTERN, ' ');
}
