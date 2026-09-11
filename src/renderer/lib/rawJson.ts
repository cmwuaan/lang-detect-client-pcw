/**
 * Serialize JSON cho panel log raw, khác `JSON.stringify` đúng một điểm: số
 * không bao giờ in ở dạng khoa học.
 *
 * VÌ SAO CẦN: Apple NaturalLanguage trả xác suất THẬT, nên ngôn ngữ khó xảy ra
 * nhận giá trị cỡ `9.029301195617734e-10`. Đó là số đúng, nhưng `JSON.stringify`
 * in ra dạng mũ khiến nó trông như lỗi hiển thị, và mắt người không so được
 * `e-10` với `e-4` nhanh như so hai chuỗi thập phân thẳng hàng.
 *
 * KHÔNG làm tròn, KHÔNG rút gọn: đây là log raw, giá trị phải khớp bit-for-bit
 * với thứ native trả về. `expandExponent()` chỉ dịch dấu chấm thập phân —
 * `Number(kết quả) === giá trị gốc` luôn đúng. Không dùng `toFixed()` vì nó
 * chặn ở 100 chữ số và làm tròn khi thiếu chỗ.
 */

/** Viết lại '9.03e-10' thành '0.000000000903' — cùng một số, khác cách viết. */
export function expandExponent(text: string): string {
	const parts = /^(-?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/.exec(text);
	if (!parts) return text;

	const sign = parts[1];
	const intDigits = parts[2];
	const fracDigits = parts[3] || '';
	const exponent = parseInt(parts[4], 10);

	const digits = intDigits + fracDigits;
	// Vị trí dấu chấm tính từ đầu `digits` sau khi dịch theo số mũ.
	const pointAt = intDigits.length + exponent;

	if (pointAt <= 0) {
		return sign + '0.' + zeros(-pointAt) + digits;
	}
	if (pointAt >= digits.length) {
		return sign + digits + zeros(pointAt - digits.length);
	}
	return sign + digits.slice(0, pointAt) + '.' + digits.slice(pointAt);
}

function zeros(count: number): string {
	let out = '';
	for (let i = 0; i < count; i++) out += '0';
	return out;
}

function formatNumber(value: number): string {
	// NaN/Infinity không phải JSON hợp lệ; JSON.stringify biến chúng thành null.
	// Ở log raw thì in tên ra thật hơn là giấu đi thành null.
	if (value !== value) return 'NaN';
	if (value === Infinity) return 'Infinity';
	if (value === -Infinity) return '-Infinity';
	return expandExponent(String(value));
}

/**
 * Tự đi qua cấu trúc thay vì `JSON.stringify` rồi regex lại chuỗi kết quả: regex
 * không phân biệt được số nằm trong dữ liệu với số nằm trong một string
 * (`loadError` là câu lỗi của OS, chứa gì cũng được).
 */
export function formatRawJson(value: unknown, indent: string): string {
	if (value === null || value === undefined) return 'null';

	const type = typeof value;
	if (type === 'number') return formatNumber(value as number);
	if (type === 'boolean') return String(value);
	if (type === 'string') return JSON.stringify(value);

	const inner = indent + '\t';

	if (Object.prototype.toString.call(value) === '[object Array]') {
		const items = value as unknown[];
		if (items.length === 0) return '[]';
		const body = items.map(function (item) {
			return inner + formatRawJson(item, inner);
		});
		return '[\n' + body.join(',\n') + '\n' + indent + ']';
	}

	if (type === 'object') {
		const record = value as { [key: string]: unknown };
		const keys = Object.keys(record);
		if (keys.length === 0) return '{}';
		const body = keys.map(function (key) {
			return inner + JSON.stringify(key) + ': ' + formatRawJson(record[key], inner);
		});
		return '{\n' + body.join(',\n') + '\n' + indent + '}';
	}

	return String(value);
}
