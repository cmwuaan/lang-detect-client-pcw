/**
 * Mô hình n-gram xác suất có điều kiện — port từ lingua-rs.
 * Xem `.claude/skills/lingua-architecture.md` để biết vì sao chọn cách này.
 *
 * Khác Cavnar–Trenkle (bản zdetect đầu tiên) ở chỗ căn bản: không so THỨ HẠNG
 * n-gram, mà tính **log P(ký tự cuối | các ký tự trước)** rồi cộng lại. Cavnar–
 * Trenkle cần đủ n-gram để xếp hạng cho ra hồn, nên văn bản ngắn là nó mù.
 */

import { ngramsOfOrder, tokenize } from './tokenize';

/** Bậc n-gram tối đa được train và tra cứu. */
export const MAX_ORDER = 5;

/**
 * Ngưỡng đổi chiến lược, lấy nguyên hằng số thực nghiệm của lingua
 * (`detector.rs`: `if character_count >= 120 { 3..4 } else { 1..6 }`).
 *
 * Dài hơn ngưỡng thì trigram đã đủ tín hiệu, chạy thêm bậc 4-5 chỉ tốn thời gian.
 */
export const LONG_TEXT_THRESHOLD = 120;

/** `ngram -> ln P(ngram)`. Một map phẳng cho mọi bậc, như FST của lingua. */
export type NgramModel = Record<string, number>;

export interface TrainedModel {
	/** Định dạng — đổi thì bump, để runtime từ chối model cũ thay vì đọc bừa. */
	version: 3;
	lang: string;
	maxOrder: number;
	/**
	 * Log-probability gán cho n-gram mà model KHÔNG biết, kể cả sau backoff.
	 *
	 * ĐÂY LÀ CHỖ PHẢI KHÁC lingua. lingua bỏ qua n-gram không khớp (cộng 0) vì
	 * model của nó train trên corpus khổng lồ — ngôn ngữ nào cũng phủ gần hết ký
	 * tự Latin nên số term khớp gần bằng nhau. Với corpus nhỏ thì không: đo được
	 * là model tiếng Anh chỉ khớp 15 term trên câu tiếng Việt trong khi model
	 * tiếng Việt khớp 22 — và vì term không khớp được cộng 0, BÊN DỐT HƠN LẠI
	 * THẮNG. Phạt n-gram lạ làm số hạng bằng nhau giữa các ngôn ngữ và xoá hẳn
	 * lợi thế ngược đó.
	 */
	floor: number;
	ngrams: NgramModel;
}

/* ------------------------------------------------------------------ train */

function countNgrams(tokens: string[], order: number): Map<string, number> {
	const counts = new Map<string, number>();

	for (const token of tokens) {
		const chars = Array.from(token);
		for (let i = 0; i + order <= chars.length; i++) {
			const gram = chars.slice(i, i + order).join('');
			counts.set(gram, (counts.get(gram) ?? 0) + 1);
		}
	}

	return counts;
}

/**
 * Train mô hình từ corpus.
 *
 * XÁC SUẤT CÓ ĐIỀU KIỆN, không phải tần suất thô:
 *
 *   P(gram) = count(gram) / count(tiền tố dài n-1)     với n >= 2
 *   P(gram) = count(gram) / tổng số unigram            với n = 1
 *
 * Lưu `ln()` để lúc chạy chỉ phải CỘNG (nhân xác suất trực tiếp là underflow
 * ngay với vài chục n-gram).
 *
 * `minCount` cắt n-gram hiếm ở bậc cao: corpus nhỏ thì gần như mọi 5-gram đều
 * xuất hiện đúng một lần, giữ hết chỉ là học thuộc corpus và phình model.
 */
export function trainModel(
	lang: string,
	text: string,
	options: { maxOrder?: number; minCount?: number } = {}
): TrainedModel {
	const maxOrder = options.maxOrder ?? MAX_ORDER;
	const minCount = options.minCount ?? 1;

	const tokens = tokenize(text);
	const ngrams: NgramModel = {};

	// Đếm từng bậc một lần, giữ lại để làm mẫu số cho bậc kế tiếp.
	const countsByOrder: Array<Map<string, number>> = [];
	for (let order = 1; order <= maxOrder; order++) {
		countsByOrder.push(countNgrams(tokens, order));
	}

	const totalUnigrams = Array.from(countsByOrder[0].values()).reduce(function (a, b) {
		return a + b;
	}, 0);
	if (totalUnigrams === 0) {
		return { version: 3, lang: lang, maxOrder: maxOrder, floor: 0, ngrams: ngrams };
	}

	for (let order = 1; order <= maxOrder; order++) {
		const counts = countsByOrder[order - 1];
		// Bậc 1 không có tiền tố; mẫu số là tổng số unigram.
		const lowerCounts = order === 1 ? null : countsByOrder[order - 2];

		counts.forEach(function (count, gram) {
			// Chỉ cắt từ bậc 3 trở lên: unigram/bigram hiếm vẫn là tín hiệu thật.
			if (order >= 3 && count < minCount) return;

			let denominator: number;
			if (lowerCounts === null) {
				denominator = totalUnigrams;
			} else {
				const prefix = Array.from(gram).slice(0, order - 1).join('');
				denominator = lowerCounts.get(prefix) ?? 0;
			}

			// Mẫu số 0 nghĩa là dữ liệu đếm không nhất quán — bỏ qua chứ không
			// chia cho 0 rồi nhét -Infinity vào model.
			if (denominator <= 0) return;

			ngrams[gram] = Math.log(count / denominator);
		});
	}

	/*
	 * Mức phạt: hiếm hơn thứ hiếm nhất từng thấy. Laplace kiểu add-one ở tầng
	 * unigram — một n-gram chưa từng gặp coi như có tần suất 1 trong corpus lớn
	 * hơn corpus thật một đơn vị.
	 */
	const floor = Math.log(1 / (totalUnigrams + 1));

	return { version: 3, lang: lang, maxOrder: maxOrder, floor: floor, ngrams: ngrams };
}

/* -------------------------------------------------------------------- run */

export interface LanguageScore {
	/** Tổng log-probability. Càng lớn (ít âm) càng giống. */
	logScore: number;
	/**
	 * Số n-gram đã chấm. Bằng nhau giữa mọi ngôn ngữ vì n-gram lạ cũng bị phạt
	 * chứ không bị bỏ qua — nên nó chỉ để lấy trung bình, không tạo thiên lệch.
	 */
	terms: number;
}

/**
 * BACKOFF: với mỗi n-gram, thử bậc cao nhất trước rồi cắt dần từ phải, lấy cái
 * ĐẦU TIÊN có trong model rồi dừng.
 *
 *   "abcde" -> "abcd" -> "abc" -> "ab" -> "a"
 *
 * Vì sao bắt buộc: corpus nhỏ thì 5-gram gần như luôn vắng mặt. Không backoff
 * thì hoặc phải bịa một hằng phạt, hoặc bỏ qua và mất tín hiệu. Backoff tự động
 * dùng bậc cao nhất còn quan sát được.
 */
function backoffLogProb(model: NgramModel, gram: string): number | null {
	let chars = Array.from(gram);

	while (chars.length > 0) {
		const value = model[chars.join('')];
		if (value !== undefined) return value;
		chars = chars.slice(0, chars.length - 1);
	}

	return null;
}

/**
 * Chấm điểm một văn bản với một model.
 *
 * Chạy đúng thứ tự của lingua: mỗi bậc trong dải là một lượt độc lập, mỗi n-gram
 * trong lượt đó đi qua chuỗi backoff riêng. Bậc 1 đồng thời đếm `unigramHits`.
 */
export function scoreText(
	tokens: string[],
	characterCount: number,
	model: NgramModel,
	floor: number
): LanguageScore {
	// Văn bản dài: chỉ trigram. Ngắn: dùng hết 1..5.
	const orders =
		characterCount >= LONG_TEXT_THRESHOLD ? [3] : [1, 2, 3, 4, 5].slice(0, MAX_ORDER);

	let logScore = 0;
	let terms = 0;

	for (const order of orders) {
		if (characterCount < order) continue;

		for (const gram of ngramsOfOrder(tokens, order)) {
			const value = backoffLogProb(model, gram);
			// null = cả chuỗi backoff đều lạ -> PHẠT, không bỏ qua.
			logScore += value === null ? floor : value;
			terms++;
		}
	}

	return { logScore: logScore, terms: terms };
}

/**
 * Đổi log-score thô của từng ngôn ngữ thành confidence cộng lại bằng 1.
 *
 * Hai bước, theo `detector.rs::sum_up_probabilities` + `compute_confidence_values`:
 *
 *   1. Chia log-score cho số n-gram đã chấm -> trung bình log-prob mỗi n-gram.
 *      lingua chia cho SỐ UNIGRAM KHỚP, nhưng cách đó chỉ đúng khi mọi model
 *      phủ ngang nhau; ở đây n-gram lạ đã bị phạt nên mẫu số bằng nhau và phép
 *      chia chỉ còn tác dụng chuẩn hoá độ dài.
 *   2. exp() rồi chia cho tổng — softmax.
 *
 * Bẫy đã xử lý: văn bản dài làm mọi exp() underflow về 0, tổng thành 0. Lúc đó
 * lấy log-score lớn nhất và gán 1.0, chứ không chia cho 0 ra NaN.
 */
export function toConfidences(scores: Map<string, LanguageScore>): Map<string, number> {
	const out = new Map<string, number>();
	if (scores.size === 0) return out;

	const normalized = new Map<string, number>();
	scores.forEach(function (score, lang) {
		if (score.terms === 0) return;
		// Trung bình log-prob mỗi n-gram. `terms` bằng nhau giữa các ngôn ngữ nên
		// phép chia này chỉ đưa số về thang exp() dùng được, không đổi thứ hạng.
		normalized.set(lang, score.logScore / score.terms);
	});

	if (normalized.size === 0) return out;

	let denominator = 0;
	const exponentiated = new Map<string, number>();
	normalized.forEach(function (value, lang) {
		const p = Math.exp(value);
		exponentiated.set(lang, p);
		denominator += p;
	});

	if (denominator === 0 || !isFinite(denominator)) {
		let bestLang: string | null = null;
		let best = -Infinity;
		normalized.forEach(function (value, lang) {
			if (value > best) {
				best = value;
				bestLang = lang;
			}
		});
		if (bestLang !== null) out.set(bestLang, 1);
		return out;
	}

	exponentiated.forEach(function (p, lang) {
		out.set(lang, p / denominator);
	});

	return out;
}
