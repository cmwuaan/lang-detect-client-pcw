/**
 * Bỏ dấu — dùng để TỰ SINH lexicon "không dấu" từ corpus tiếng Việt có sẵn,
 * thay vì gõ tay danh sách teencode.
 *
 * Nguyên lý: teencode phần lớn không phải từ vựng khác, mà là cách gõ thiếu dấu
 * của chính từ bình thường (không -> khong, được -> duoc). Lấy corpus sẵn có bỏ
 * dấu đi là ra ngay lexicon khá đầy đủ, không phải bảo trì thủ công.
 */

/**
 * Combining Diacritical Marks (U+0300–U+036F). Viết bằng escape chứ không dán
 * ký tự thật: ký tự tổ hợp trần vô hình trong editor và rất dễ bị công cụ khác
 * làm hỏng khi copy qua lại.
 */
const COMBINING_MARKS = /[\u0300-\u036f]/g;

/**
 * NFD tách ký tự gốc khỏi dấu rồi loại combining mark. `đ/Đ` phải xử lý riêng
 * vì nó là một chữ cái độc lập, NFD không tách ra được.
 */
export function stripDiacritics(text: string): string {
	return text
		.normalize('NFD')
		.replace(COMBINING_MARKS, '')
		.replace(/đ/g, 'd')
		.replace(/Đ/g, 'D');
}
