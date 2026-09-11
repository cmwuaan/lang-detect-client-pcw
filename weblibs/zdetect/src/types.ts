/**
 * Kiểu dùng chung cho cả engine. Tách riêng để không file nào phải import
 * ngược lên `index.ts` chỉ để lấy một interface.
 */

/** Category do Layer 1 trả về. Engine không biết category nào là ngôn ngữ gì. */
export type ScriptCategory = 'hangul' | 'han' | 'latin' | 'other';

/** Một đoạn liên tục cùng script. */
export interface ScriptRun {
	category: ScriptCategory;
	text: string;
}

/** Nguồn ra quyết định — cần cho audit, đừng bỏ. */
export type DecisionSource =
	| 'unique-chars'
	| 'lexicon'
	| 'ngram'
	| 'script-map'
	| 'custom'
	| null;

/** Kết quả phân loại một run. */
export interface RunVerdict {
	lang: string | null;
	confidence: number;
	decisionSource: DecisionSource;
	/**
	 * Phân phối xác suất trên tập ứng viên CỦA RUN NÀY, cộng lại bằng 1.
	 *
	 * Theo đúng lingua: tầng luật (script-map / unique-chars / lexicon) chốt thì
	 * gán 1.0 cho ngôn ngữ đó và 0 cho phần còn lại; chỉ tầng thống kê mới cho
	 * phân phối mềm. Nhờ trường này mà tổng hợp lên được confidence cho MỌI ngôn
	 * ngữ, thay vì chỉ biết ngôn ngữ thắng.
	 */
	distribution?: Record<string, number>;
}

/** Điểm của từng ứng viên, giữ lại để debug. */
export interface CandidateScore {
	lang: string;
	/** Khoảng cách n-gram (thấp hơn = giống hơn) hoặc tỉ lệ khớp lexicon. */
	score: number;
}

export interface ClassifyResult extends RunVerdict {
	scores: CandidateScore[];
}

/** Một run đã phân loại, kèm văn bản gốc — dùng để soi vì sao ra kết quả đó. */
export interface RunDetail extends RunVerdict {
	text: string;
	category: ScriptCategory;
}

/** Một ngôn ngữ trong kết quả tổng hợp. */
export interface RankedLanguage {
	lang: string;
	/**
	 * Tỉ lệ ký tự thuộc về ngôn ngữ này, cộng lại bằng 1 trên các run đã nhận
	 * diện được. KHÔNG phải "độ chắc chắn đây là ngôn ngữ đó".
	 */
	proportion: number;
	/**
	 * Trung bình có trọng số độ chắc chắn của các run thuộc ngôn ngữ này.
	 * Độc lập với `proportion` — văn bản ngắn có thể proportion 1 mà confidence thấp.
	 */
	confidence: number;
}

/** Một ngôn ngữ kèm điểm — CÙNG HÌNH DẠNG với hypothesis của nativelibs/zlang. */
export interface LanguageHypothesis {
	/** Thẻ BCP 47. */
	detectedLanguage: string;
	/** 0..1. Cộng lại trên cả mảng bằng 1. */
	confidence: number;
}

export interface MixedResult {
	ranked: RankedLanguage[];
	/**
	 * MỌI ngôn ngữ engine biết, kèm confidence, sắp giảm dần, tổng bằng 1 —
	 * tương ứng `compute_language_confidence_values()` của lingua và cùng hình
	 * dạng với `zlang.detect()`. Ngôn ngữ không xuất hiện trong văn bản vẫn có
	 * mặt với confidence 0, để bên gọi thấy được cả những ứng viên bị loại.
	 */
	hypotheses: LanguageHypothesis[];
	details: RunDetail[];
}

export interface ClassifierOptions {
	/** Dưới ngưỡng này thì hạ confidence vì chưa đủ n-gram để tin. */
	minReliableLength?: number;
	/** Margin giữa top-1 và top-2 đạt mức này thì confidence tối đa. */
	marginScale?: number;
	/** Lexicon theo ngôn ngữ — generic, không riêng tiếng Việt. */
	lexicons?: Record<string, string[]>;
	/** Tỉ lệ từ khớp lexicon tối thiểu để coi là tín hiệu mạnh. */
	lexiconCoverageThreshold?: number;
	/** Phải vượt ứng viên nhì bấy nhiêu lần mới quyết định luôn theo lexicon. */
	lexiconDominanceRatio?: number;
	/**
	 * Ký tự CHỈ ngôn ngữ đó có, trong tập ứng viên cùng script.
	 * Ví dụ `{ vi: 'ăâđêôơư…' }` — tiếng Anh không có ký tự nào trong đó.
	 * Tương ứng `Language::unique_characters()` của lingua.
	 */
	uniqueCharacters?: Record<string, string>;
}

export interface DetectorConfig {
	/** Script map thẳng sang ngôn ngữ, không cần phân loại thêm. */
	scriptDirectMap?: Record<string, string>;
	/** Script cần Layer 3 để phân biệt giữa các ứng viên cùng script. */
	scriptGroups?: Record<string, string[]>;
	/**
	 * Mô hình n-gram (`ngram -> ln P`) cho ngôn ngữ trong `scriptGroups`.
	 * Sinh bởi `scripts/train.ts`; xem src/ngram-model.ts.
	 */
	models?: Record<string, { ngrams: Record<string, number>; floor: number }>;
	classifierOptions?: ClassifierOptions;
	/** Hook can thiệp sâu, ghi đè logic mặc định cho một script category. */
	customClassifiers?: Record<string, (runText: string) => RunVerdict>;
}
