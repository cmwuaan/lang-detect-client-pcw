/**
 * LAYER 3 — phân loại thống kê + chấm độ tin cậy.
 *
 * Ba nguồn tín hiệu, ưu tiên theo thứ tự:
 *
 *   1. KÝ TỰ RIÊNG (rule) — ký tự chỉ một ngôn ngữ ứng viên có (ă, â, đ, ê, ô,
 *      ơ, ư và dấu thanh của tiếng Việt). Thấy là chốt, không cần thống kê.
 *      Tương ứng `detect_language_with_rules` của lingua.
 *
 *   2. LEXICON COVERAGE — tỉ lệ từ khớp lexicon vượt trội thì chốt. Đây là cách
 *      bắt teencode: khi mất dấu, luật (1) mù và thống kê ký tự dễ sai, nhưng
 *      từng từ trùng danh sách đã biết ("khong", "ko", "bit") vẫn chính xác.
 *      lingua KHÔNG có tầng này — nó tuyên bố không dùng từ điển.
 *
 *   3. N-GRAM BAYES + backoff — mô hình xác suất có điều kiện, port từ lingua.
 *      Xem `.claude/skills/lingua-architecture.md`.
 *
 * `decisionSource` nói rõ kết luận đến từ tầng nào — bắt buộc để audit được.
 */

import { NgramModel, scoreText, toConfidences, LanguageScore } from './ngram-model';
import { characterCount, tokenize } from './tokenize';
import { CandidateScore, ClassifierOptions, ClassifyResult } from './types';

const DEFAULTS = {
	minReliableLength: 8,
	lexiconCoverageThreshold: 0.25,
	lexiconDominanceRatio: 1.5,
};

/**
 * Lexicon dưới dạng Set để tra O(1).
 *
 * Cache vì lexicon là hằng số: dựng `new Set(...)` cho mỗi ngôn ngữ ở mỗi lời
 * gọi là rác sinh ra liên tục. WeakMap khoá theo chính mảng nguồn nên đổi
 * lexicon là cache tự rụng.
 */
const lexiconCache = new WeakMap<string[], Set<string>>();

function lexiconSet(words: string[] | undefined): Set<string> {
	if (!words || words.length === 0) return new Set();

	const cached = lexiconCache.get(words);
	if (cached) return cached;

	const set = new Set(words);
	lexiconCache.set(words, set);
	return set;
}

/**
 * Ký tự riêng cho từng ngôn ngữ, dùng cho luật (1).
 *
 * Cache theo chính object nguồn, giống lexicon.
 */
const uniqueCharCache = new WeakMap<Record<string, string>, Map<string, Set<string>>>();

function uniqueCharSets(source: Record<string, string>): Map<string, Set<string>> {
	const cached = uniqueCharCache.get(source);
	if (cached) return cached;

	const map = new Map<string, Set<string>>();
	for (const lang of Object.keys(source)) {
		map.set(lang, new Set(Array.from(source[lang])));
	}
	uniqueCharCache.set(source, map);
	return map;
}

/**
 * Luật ký tự riêng — bản rút gọn của `detect_language_with_rules`.
 *
 * Đếm ký tự riêng của từng ngôn ngữ trong toàn văn bản. Đúng MỘT ngôn ngữ có
 * mặt thì chốt luôn. Hai ngôn ngữ cùng có ký tự riêng nghĩa là văn bản trộn —
 * trả null để tầng thống kê xử lý, chứ không chọn bừa bên nhiều hơn.
 */
function detectByUniqueChars(
	text: string,
	candidates: string[],
	uniqueChars: Record<string, string> | undefined
): { lang: string; hits: number } | null {
	if (!uniqueChars) return null;

	const sets = uniqueCharSets(uniqueChars);
	const hits = new Map<string, number>();

	for (const ch of text.toLowerCase()) {
		for (const lang of candidates) {
			const set = sets.get(lang);
			if (set && set.has(ch)) hits.set(lang, (hits.get(lang) ?? 0) + 1);
		}
	}

	if (hits.size !== 1) return null;

	const entry = Array.from(hits.entries())[0];
	return { lang: entry[0], hits: entry[1] };
}

export function classifyWithConfidence(
	text: string,
	candidateLangs: string[],
	models: Record<string, { ngrams: NgramModel; floor: number }>,
	options: ClassifierOptions = {}
): ClassifyResult {
	const minReliableLength = options.minReliableLength ?? DEFAULTS.minReliableLength;
	const lexicons = options.lexicons ?? {};
	const coverageThreshold =
		options.lexiconCoverageThreshold ?? DEFAULTS.lexiconCoverageThreshold;
	const dominanceRatio = options.lexiconDominanceRatio ?? DEFAULTS.lexiconDominanceRatio;

	const available = candidateLangs.filter(function (lang) {
		return models[lang];
	});
	if (available.length === 0) {
		return { lang: null, confidence: 0, decisionSource: null, scores: [] };
	}

	/** Tầng luật chốt được thì gán trọn 1.0 — đúng hành vi rule engine của lingua. */
	function certain(lang: string): Record<string, number> {
		const dist: Record<string, number> = {};
		for (const candidate of available) dist[candidate] = candidate === lang ? 1 : 0;
		return dist;
	}

	const tokens = tokenize(text);
	const charCount = characterCount(tokens);
	if (charCount === 0) {
		return { lang: null, confidence: 0, decisionSource: null, scores: [] };
	}

	// Chặn trên độ tin cậy theo độ dài: hai ký tự thì tín hiệu nào cũng mỏng.
	const lengthFactor = Math.min(1, charCount / minReliableLength);

	// --- (1) ký tự riêng ---
	const unique = detectByUniqueChars(text, available, options.uniqueCharacters);
	if (unique) {
		return {
			lang: unique.lang,
			confidence: lengthFactor,
			decisionSource: 'unique-chars',
			scores: [{ lang: unique.lang, score: unique.hits }],
			distribution: certain(unique.lang),
		};
	}

	// --- (2) lexicon coverage ---
	const totalWords = tokens.length || 1;
	const coverage: CandidateScore[] = available
		.map(function (lang) {
			const set = lexiconSet(lexicons[lang]);
			let matches = 0;
			for (const token of tokens) {
				if (set.has(token)) matches++;
			}
			return { lang: lang, score: matches / totalWords };
		})
		.sort(function (a, b) {
			return b.score - a.score;
		});

	const topLex = coverage[0];
	const secondCoverage = coverage.length > 1 ? coverage[1].score : 0;

	if (
		topLex &&
		topLex.score >= coverageThreshold &&
		(secondCoverage === 0 || topLex.score >= secondCoverage * dominanceRatio)
	) {
		return {
			lang: topLex.lang,
			confidence: Math.max(0, Math.min(1, topLex.score * 2 * lengthFactor)),
			decisionSource: 'lexicon',
			scores: coverage,
			distribution: certain(topLex.lang),
		};
	}

	// --- (3) n-gram Bayes ---
	const rawScores = new Map<string, LanguageScore>();
	for (const lang of available) {
		rawScores.set(lang, scoreText(tokens, charCount, models[lang].ngrams, models[lang].floor));
	}

	const confidences = toConfidences(rawScores);
	if (confidences.size === 0) {
		return { lang: null, confidence: 0, decisionSource: null, scores: [] };
	}

	const ranked: CandidateScore[] = Array.from(confidences.entries())
		.map(function (entry) {
			return { lang: entry[0], score: entry[1] };
		})
		.sort(function (a, b) {
			return b.score - a.score;
		});

	// Softmax thô, chưa nhân lengthFactor: đây là phân phối giữa các ứng viên,
	// còn lengthFactor nói về độ tin của cả phán đoán — trộn hai thứ vào nhau thì
	// tổng không còn bằng 1.
	const distribution: Record<string, number> = {};
	confidences.forEach(function (value, lang) {
		distribution[lang] = value;
	});

	return {
		lang: ranked[0].lang,
		// Nhân lengthFactor để văn bản quá ngắn không tuyên bố chắc chắn chỉ vì
		// hai ứng viên chênh nhau tí xíu.
		confidence: Math.max(0, Math.min(1, ranked[0].score * lengthFactor)),
		decisionSource: 'ngram',
		scores: ranked,
		distribution: distribution,
	};
}
