/**
 * ENGINE TỔNG QUÁT — không hardcode ngôn ngữ nào. Toàn bộ "kiến thức" về ngôn
 * ngữ nằm ở config truyền vào constructor, nên đổi sang bộ ngôn ngữ khác hẳn
 * (Nhật + Thái + Đức…) chỉ sửa config, không đụng file này.
 *
 * Trách nhiệm: L1 tách run theo script, routing, L4 tổng hợp theo trọng số.
 *
 * Routing theo thứ tự ưu tiên:
 *   1. customClassifiers[category] — hook can thiệp sâu
 *   2. scriptDirectMap[category]   — map 1-1, không cần phân loại
 *   3. scriptGroups[category]      — n-gram + lexicon
 */

import { classifyWithConfidence } from './classifier';
import { normalize } from './normalize';
import { segmentByScript } from './script-utils';
import {
	ClassifierOptions,
	DetectorConfig,
	LanguageHypothesis,
	MixedResult,
	RankedLanguage,
	RunDetail,
	RunVerdict,
	ScriptRun,
} from './types';

export class LanguageDetector {
	private readonly scriptDirectMap: Record<string, string>;
	private readonly scriptGroups: Record<string, string[]>;
	private readonly models: Record<string, { ngrams: Record<string, number>; floor: number }>;
	private readonly classifierOptions: ClassifierOptions;
	private readonly customClassifiers: Record<string, (runText: string) => RunVerdict>;

	/**
	 * Mọi ngôn ngữ engine có thể kết luận, theo config. Tính một lần lúc dựng:
	 * `confidenceValues()` phải liệt kê đủ cả những ngôn ngữ KHÔNG xuất hiện
	 * trong văn bản (confidence 0), giống lingua khởi tạo 0.0 cho từng ngôn ngữ.
	 */
	private readonly allLanguages: string[];

	public constructor(config: DetectorConfig) {
		this.scriptDirectMap = config.scriptDirectMap ?? {};
		this.scriptGroups = config.scriptGroups ?? {};
		this.models = config.models ?? {};
		this.classifierOptions = config.classifierOptions ?? {};
		this.customClassifiers = config.customClassifiers ?? {};

		const seen = new Set<string>();
		for (const lang of Object.keys(this.scriptDirectMap)) seen.add(this.scriptDirectMap[lang]);
		for (const category of Object.keys(this.scriptGroups)) {
			for (const lang of this.scriptGroups[category]) seen.add(lang);
		}
		this.allLanguages = Array.from(seen);
	}

	/** Ngôn ngữ engine có thể kết luận, theo config hiện tại. */
	public languages(): string[] {
		return this.allLanguages.slice();
	}

	/** Route + phân loại một run. Không quan tâm run đến từ đâu, chỉ theo config. */
	private classifyRun(run: ScriptRun): RunVerdict {
		const custom = this.customClassifiers[run.category];
		if (custom) return custom(run.text);

		const direct = this.scriptDirectMap[run.category];
		// Script chỉ thuộc đúng một ngôn ngữ -> không có gì để phân vân.
		if (direct) {
			const dist: Record<string, number> = {};
			dist[direct] = 1;
			return { lang: direct, confidence: 1, decisionSource: 'script-map', distribution: dist };
		}

		const candidates = this.scriptGroups[run.category];
		if (candidates) {
			return classifyWithConfidence(run.text, candidates, this.models, this.classifierOptions);
		}

		// Script chưa được config -> không kết luận, và KHÔNG đoán bừa.
		return { lang: null, confidence: 0, decisionSource: null };
	}

	/**
	 * Kết quả chi tiết: từng run kèm ngôn ngữ + confidence, và bảng tổng hợp tỉ
	 * lệ theo trọng số ký tự. `details` giữ lại để soi được vì sao ra kết quả đó.
	 */
	public detectMixed(text: string): MixedResult {
		const runs = segmentByScript(normalize(text));

		const weightByLang = new Map<string, number>();
		const confidenceSumByLang = new Map<string, number>();
		const details: RunDetail[] = [];
		let totalWeight = 0;

		for (const run of runs) {
			const verdict = this.classifyRun(run);
			// Trọng số theo ký tự có nghĩa; run toàn khoảng trắng dùng độ dài thô
			// để không thành 0 và biến mất khỏi phép chia.
			const weight = run.text.trim().length || run.text.length;

			details.push({
				text: run.text,
				category: run.category,
				lang: verdict.lang,
				confidence: verdict.confidence,
				decisionSource: verdict.decisionSource,
				distribution: verdict.distribution,
			});

			if (!verdict.lang) continue;

			weightByLang.set(verdict.lang, (weightByLang.get(verdict.lang) ?? 0) + weight);
			confidenceSumByLang.set(
				verdict.lang,
				(confidenceSumByLang.get(verdict.lang) ?? 0) + verdict.confidence * weight
			);
			totalWeight += weight;
		}

		if (totalWeight === 0) {
			return { ranked: [], hypotheses: this.emptyHypotheses(), details: details };
		}

		const ranked: RankedLanguage[] = Array.from(weightByLang.entries())
			.map(function (entry) {
				const lang = entry[0];
				const weight = entry[1];
				return {
					lang: lang,
					proportion: weight / totalWeight,
					confidence: (confidenceSumByLang.get(lang) ?? 0) / weight,
				};
			})
			.sort(function (a, b) {
				return b.proportion - a.proportion;
			});

		return {
			ranked: ranked,
			hypotheses: this.aggregateHypotheses(details),
			details: details,
		};
	}

	/** Mọi ngôn ngữ với confidence 0 — dùng khi không kết luận được gì. */
	private emptyHypotheses(): LanguageHypothesis[] {
		return this.allLanguages.map(function (lang) {
			return { detectedLanguage: lang, confidence: 0 };
		});
	}

	/**
	 * Gộp phân phối của từng run thành confidence cho MỌI ngôn ngữ, tổng bằng 1.
	 * Tương ứng `compute_language_confidence_values()` của lingua.
	 *
	 * Trọng số là số ký tự của run: một câu 90% chữ Hán, 10% Latin thì tiếng
	 * Trung phải chiếm ưu thế tương ứng, chứ không phải mỗi run một phiếu bằng
	 * nhau.
	 */
	private aggregateHypotheses(details: RunDetail[]): LanguageHypothesis[] {
		const totals = new Map<string, number>();
		for (const lang of this.allLanguages) totals.set(lang, 0);

		let totalWeight = 0;

		for (const detail of details) {
			const dist = detail.distribution;
			if (!dist) continue;

			const weight = detail.text.trim().length || detail.text.length;
			if (weight === 0) continue;

			let contributed = false;
			for (const lang of Object.keys(dist)) {
				if (!totals.has(lang)) continue;
				totals.set(lang, (totals.get(lang) ?? 0) + dist[lang] * weight);
				contributed = true;
			}
			if (contributed) totalWeight += weight;
		}

		if (totalWeight === 0) return this.emptyHypotheses();

		return this.allLanguages
			.map(function (lang) {
				return { detectedLanguage: lang, confidence: (totals.get(lang) ?? 0) / totalWeight };
			})
			.sort(function (a, b) {
				// Bằng điểm thì sắp theo thẻ để thứ tự ổn định giữa các lần chạy.
				if (b.confidence !== a.confidence) return b.confidence - a.confidence;
				return a.detectedLanguage < b.detectedLanguage ? -1 : 1;
			});
	}

	/** Ngôn ngữ khả năng cao nhất, giả định văn bản thuần một ngôn ngữ. */
	public detectTop(text: string, minLength = 2): RankedLanguage | null {
		if (!text || text.trim().length < minLength) return null;
		return this.detectMixed(text).ranked[0] ?? null;
	}
}
