/**
 * Đo ĐƯỜNG CHẠY THẬT — toàn bộ pipeline như bản web dùng: script routing, luật
 * ký tự riêng, lexicon, rồi mới tới n-gram.
 *
 *   npm run eval
 *
 * Khác `bench.ts` ở chỗ đó: bench tắt hết các tầng luật để cô lập mô hình thống
 * kê, còn file này đo thứ người dùng thật sự nhận được. Cả hai đều cần: bench
 * nói mô hình tốt lên hay xấu đi, eval nói sản phẩm tốt lên hay xấu đi.
 *
 * Dữ liệu: `corpus/eval/*.txt` — 20% held-out, không câu nào có trong tập train.
 */

import fs from 'node:fs';
import path from 'node:path';

import { detector } from '../src/config';
import { stripDiacritics } from '../src/diacritics';

declare const __ZDETECT_ROOT__: string;
const ROOT = __ZDETECT_ROOT__;

const LANGS = ['vi', 'en', 'ko', 'zh'] as const;
type Lang = (typeof LANGS)[number];

function readLines(lang: Lang): string[] {
	const file = path.join(ROOT, 'corpus/eval', lang + '.txt');
	if (!fs.existsSync(file)) return [];
	return fs
		.readFileSync(file, 'utf-8')
		.split('\n')
		.map(function (l) {
			return l.trim();
		})
		.filter(Boolean);
}

function firstWords(text: string, n: number): string {
	return text.split(/\s+/).slice(0, n).join(' ');
}

/** Với tiếng Trung không có khoảng trắng: cắt theo ký tự. */
function firstChars(text: string, n: number): string {
	return Array.from(text).slice(0, n).join('');
}

function shorten(text: string, words: number, lang: Lang): string {
	return lang === 'zh' ? firstChars(text, words * 2) : firstWords(text, words);
}

const evalLines: Record<Lang, string[]> = {
	vi: readLines('vi'),
	en: readLines('en'),
	ko: readLines('ko'),
	zh: readLines('zh'),
};

interface Slice {
	label: string;
	transform: (text: string, lang: Lang) => string;
}

const SLICES: Slice[] = [
	{ label: 'Câu đầy đủ', transform: function (t) { return t; } },
	{ label: '4 từ đầu', transform: function (t, l) { return shorten(t, 4, l); } },
	{ label: '2 từ đầu', transform: function (t, l) { return shorten(t, 2, l); } },
	{
		label: '4 từ đầu, vi BỎ DẤU',
		transform: function (t, l) {
			const short = shorten(t, 4, l);
			return l === 'vi' ? stripDiacritics(short) : short;
		},
	},
];

const pct = function (v: number): string {
	return (v * 100).toFixed(1).padStart(6) + '%';
};

console.log(
	'Pipeline đầy đủ · đo trên ' +
		LANGS.map(function (l) {
			return l + ':' + evalLines[l].length;
		}).join(' ') +
		' câu held-out\n'
);

const header = 'Lát cắt'.padEnd(24) + LANGS.map(function (l) {
	return l.padStart(8);
}).join('') + '   tổng';
console.log(header);
console.log('-'.repeat(header.length));

for (const slice of SLICES) {
	let allOk = 0;
	let allTotal = 0;
	const cells: string[] = [];

	for (const lang of LANGS) {
		let ok = 0;
		let total = 0;
		for (const line of evalLines[lang]) {
			const input = slice.transform(line, lang);
			if (!input.trim()) continue;
			total++;
			const top = detector.detectTop(input);
			if (top && top.lang === lang) ok++;
		}
		allOk += ok;
		allTotal += total;
		cells.push((total === 0 ? '    n/a' : ((ok / total) * 100).toFixed(1)).padStart(8));
	}

	console.log(slice.label.padEnd(24) + cells.join('') + '  ' + pct(allOk / allTotal));
}

/* Nguồn ra quyết định — cho thấy tầng nào đang gánh việc. */
console.log('\nNguồn quyết định trên lát "4 từ đầu, vi BỎ DẤU":');
const sources = new Map<string, number>();
for (const lang of LANGS) {
	for (const line of evalLines[lang]) {
		const short = shorten(line, 4, lang);
		const input = lang === 'vi' ? stripDiacritics(short) : short;
		if (!input.trim()) continue;
		for (const detail of detector.detectMixed(input).details) {
			const key = String(detail.decisionSource);
			sources.set(key, (sources.get(key) ?? 0) + 1);
		}
	}
}
Array.from(sources.entries())
	.sort(function (a, b) {
		return b[1] - a[1];
	})
	.forEach(function (e) {
		console.log('  ' + e[0].padEnd(14) + e[1]);
	});
