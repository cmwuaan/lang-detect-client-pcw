/**
 * So sánh mô hình CŨ (Cavnar–Trenkle rank distance) với mô hình MỚI
 * (Naive Bayes + backoff + phạt n-gram lạ, port từ lingua).
 *
 *   npm run bench                # min-count mặc định
 *   npm run bench -- --sweep     # quét min-count để chọn ngưỡng cắt
 *
 * Train trên `corpus/<lang>.txt` (80%), đo trên `corpus/eval/<lang>.txt` (20%
 * còn lại) — HELD-OUT thật, không câu nào dùng cả hai lần.
 *
 * Đo RIÊNG tầng thống kê: chỉ vi vs en, TẮT luật ký tự riêng và lexicon. Bật hai
 * tầng đó thì chúng giải quyết gần hết và con số không nói gì về mô hình.
 *
 * Bản cũ dựng lại ngay trong file này chứ không lấy từ src/: nó đã bị xoá khỏi
 * thư viện, nhưng muốn nói "mới tốt hơn cũ" thì phải đo được, không được phép
 * chỉ tuyên bố.
 */

import fs from 'node:fs';
import path from 'node:path';

import { scoreText, toConfidences, trainModel, LanguageScore } from '../src/ngram-model';
import { characterCount, tokenize } from '../src/tokenize';
import { stripDiacritics } from '../src/diacritics';

declare const __ZDETECT_ROOT__: string;
const ROOT = __ZDETECT_ROOT__;

/* ------------------------------------------------ mô hình CŨ: Cavnar–Trenkle */

function oldTokenize(text: string): string[] {
	return text
		.toLowerCase()
		.replace(/[^\p{L}\p{N}\s]/gu, ' ')
		.split(/\s+/)
		.filter(Boolean);
}

function oldBuildProfile(text: string, maxSize = 300): string[] {
	const freq = new Map<string, number>();
	for (const word of oldTokenize(text)) {
		for (const n of [1, 2, 3]) {
			const pad = ' '.repeat(n - 1);
			const padded = pad + word + pad;
			for (let i = 0; i <= padded.length - n; i++) {
				const gram = padded.slice(i, i + n);
				freq.set(gram, (freq.get(gram) ?? 0) + 1);
			}
		}
	}
	return Array.from(freq.entries())
		.sort(function (a, b) {
			return b[1] - a[1];
		})
		.slice(0, maxSize)
		.map(function (e) {
			return e[0];
		});
}

function oldDistance(unknown: string[], known: string[]): number {
	const rank = new Map<string, number>();
	known.forEach(function (g, i) {
		if (!rank.has(g)) rank.set(g, i);
	});
	let total = 0;
	unknown.forEach(function (g, i) {
		total += Math.abs(i - (rank.get(g) ?? known.length));
	});
	return total;
}

/* --------------------------------------------------------------- dữ liệu */

function readLines(file: string): string[] {
	return fs
		.readFileSync(path.join(ROOT, file), 'utf-8')
		.split('\n')
		.map(function (l) {
			return l.trim();
		})
		.filter(Boolean);
}

/** Lấy `n` từ đầu câu — mô phỏng tin nhắn ngắn. */
function firstWords(text: string, n: number): string {
	return text.split(/\s+/).slice(0, n).join(' ');
}

const trainText = {
	vi: fs.readFileSync(path.join(ROOT, 'corpus/vi.txt'), 'utf-8'),
	en: fs.readFileSync(path.join(ROOT, 'corpus/en.txt'), 'utf-8'),
};
const evalLines = { vi: readLines('corpus/eval/vi.txt'), en: readLines('corpus/eval/en.txt') };

const oldProfiles = {
	vi: oldBuildProfile(trainText.vi),
	en: oldBuildProfile(trainText.en),
};

function predictOld(text: string): string {
	const unknown = oldBuildProfile(text);
	return oldDistance(unknown, oldProfiles.vi) <= oldDistance(unknown, oldProfiles.en)
		? 'vi'
		: 'en';
}

function makePredictNew(minCount: number): {
	predict: (text: string) => string;
	ngramCount: number;
} {
	const models = {
		vi: trainModel('vi', trainText.vi, { minCount: minCount }),
		en: trainModel('en', trainText.en, { minCount: minCount }),
	};

	return {
		ngramCount: Object.keys(models.vi.ngrams).length + Object.keys(models.en.ngrams).length,
		predict: function (text: string): string {
			const tokens = tokenize(text);
			const chars = characterCount(tokens);
			const scores = new Map<string, LanguageScore>();
			scores.set('vi', scoreText(tokens, chars, models.vi.ngrams, models.vi.floor));
			scores.set('en', scoreText(tokens, chars, models.en.ngrams, models.en.floor));

			let best = '';
			let bestValue = -Infinity;
			toConfidences(scores).forEach(function (value, lang) {
				if (value > bestValue) {
					bestValue = value;
					best = lang;
				}
			});
			return best;
		},
	};
}

/* ------------------------------------------------------------- lát cắt đo */

interface Slice {
	label: string;
	transform: (text: string, lang: 'vi' | 'en') => string;
}

const SLICES: Slice[] = [
	{ label: 'Câu đầy đủ', transform: function (t) { return t; } },
	{ label: '8 từ đầu', transform: function (t) { return firstWords(t, 8); } },
	{ label: '4 từ đầu', transform: function (t) { return firstWords(t, 4); } },
	{ label: '2 từ đầu', transform: function (t) { return firstWords(t, 2); } },
	{
		// Chỉ bỏ dấu phía tiếng Việt — mô phỏng teencode. Tiếng Anh giữ nguyên.
		label: '4 từ đầu, vi BỎ DẤU',
		transform: function (t, lang) {
			const short = firstWords(t, 4);
			return lang === 'vi' ? stripDiacritics(short) : short;
		},
	},
];

function accuracy(predict: (t: string) => string, slice: Slice): number {
	let ok = 0;
	let total = 0;
	for (const lang of ['vi', 'en'] as const) {
		for (const line of evalLines[lang]) {
			const input = slice.transform(line, lang);
			if (!input.trim()) continue;
			total++;
			if (predict(input) === lang) ok++;
		}
	}
	return total === 0 ? 0 : ok / total;
}

/* --------------------------------------------------------------- chạy đo */

const sweep = process.argv.indexOf('--sweep') !== -1;
const minCounts = sweep ? [1, 2, 3, 5, 8] : [3];

console.log(
	'Train: corpus/*.txt (80%) · Đo: corpus/eval/*.txt (20% held-out, ' +
		(evalLines.vi.length + evalLines.en.length) +
		' câu)'
);
console.log('Chỉ tầng thống kê vi vs en — tắt luật ký tự riêng và lexicon.\n');

const pct = function (v: number): string {
	return (v * 100).toFixed(1).padStart(5) + '%';
};

const header = 'Lát cắt'.padEnd(24) + 'CŨ  ' + minCounts.map(function (m) {
	return ('MỚI mc=' + m).padStart(11);
}).join('');
console.log(header);
console.log('-'.repeat(header.length));

const newModels = minCounts.map(makePredictNew);

for (const slice of SLICES) {
	const oldAcc = accuracy(predictOld, slice);
	const row = newModels.map(function (m) {
		return pct(accuracy(m.predict, slice)).padStart(11);
	});
	console.log(slice.label.padEnd(24) + pct(oldAcc) + row.join(''));
}

console.log('');
console.log(
	'Số n-gram: cũ ' + (oldProfiles.vi.length + oldProfiles.en.length) +
		'   mới ' + newModels.map(function (m, i) {
			return 'mc=' + minCounts[i] + ':' + m.ngramCount;
		}).join('  ')
);
