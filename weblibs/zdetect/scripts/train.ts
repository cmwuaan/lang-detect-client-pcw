/**
 * Train mô hình n-gram + lexicon từ corpus. CHỈ chạy lúc dev — dùng `fs`, không
 * bao giờ được kéo vào bundle web.
 *
 *   npm run train -- vi              # corpus/vi.txt -> profiles/vi.model.json
 *   npm run train -- en
 *   npm run train -- vi --min-count=2
 *
 * Mô hình là **xác suất có điều kiện dạng log**, không phải danh sách n-gram xếp
 * hạng như Cavnar–Trenkle. Xem `.claude/skills/lingua-architecture.md`.
 */

import fs from 'node:fs';
import path from 'node:path';

import { stripDiacritics } from '../src/diacritics';
import { MAX_ORDER, trainModel } from '../src/ngram-model';
import { tokenize } from '../src/tokenize';

/**
 * Đường dẫn gốc của package, do `scripts/run-ts.js` bơm vào lúc build.
 * Không dùng `__dirname` được: file chạy thật nằm trong thư mục tạm.
 */
declare const __ZDETECT_ROOT__: string;

const ROOT = __ZDETECT_ROOT__;

function fail(message: string): never {
	console.error(message);
	process.exit(1);
}

const args = process.argv.slice(2);
const lang = args.filter(function (a) {
	return a.indexOf('--') !== 0;
})[0];
if (!lang) fail('Thiếu mã ngôn ngữ. Cách dùng: npm run train -- vi');

const minCountArg = args.filter(function (a) {
	return a.indexOf('--min-count=') === 0;
})[0];
const minCount = minCountArg ? Number(minCountArg.split('=')[1]) : 1;

const corpusPath = path.join(ROOT, 'corpus', lang + '.txt');
const modelPath = path.join(ROOT, 'profiles', lang + '.model.json');
const abbreviationsPath = path.join(ROOT, 'corpus', lang + '-abbreviations.txt');
const lexiconPath = path.join(ROOT, 'profiles', lang + '.lexicon.json');

if (!fs.existsSync(corpusPath)) {
	fail(
		'Không thấy corpus: ' +
			corpusPath +
			'\nTạo corpus/<mã>.txt chứa văn bản mẫu (càng nhiều càng chính xác) rồi chạy lại.'
	);
}

const text = fs.readFileSync(corpusPath, 'utf-8');

// --- 1. mô hình n-gram ---
const model = trainModel(lang, text, { maxOrder: MAX_ORDER, minCount: minCount });
const ngramCount = Object.keys(model.ngrams).length;

fs.mkdirSync(path.dirname(modelPath), { recursive: true });
/*
 * Làm tròn 4 chữ số thập phân trước khi ghi. Sai số log-prob cỡ 1e-4 không đổi
 * được thứ hạng ngôn ngữ nào, nhưng cắt được quá nửa kích thước file — mà file
 * này nằm trong bundle web nên từng KB đều tính.
 */
const rounded: Record<string, number> = {};
for (const gram of Object.keys(model.ngrams).sort()) {
	rounded[gram] = Math.round(model.ngrams[gram] * 10000) / 10000;
}
fs.writeFileSync(
	modelPath,
	JSON.stringify({
		version: 3,
		lang: lang,
		maxOrder: MAX_ORDER,
		floor: Math.round(model.floor * 10000) / 10000,
		ngrams: rounded,
	}) + '\n',
	'utf-8'
);
const sizeKb = (fs.statSync(modelPath).size / 1024).toFixed(1);
console.log('✔ model "' + lang + '": ' + ngramCount + ' n-gram, ' + sizeKb + ' KB -> ' + modelPath);

/*
 * --- 2. lexicon "không dấu" ---
 *
 * Lấy mọi từ trong corpus rồi bỏ dấu, để bắt kiểu gõ tắt dấu (không -> khong)
 * mà không phải liệt kê tay.
 *
 * HAI BỘ LỌC, cả hai đều bắt buộc:
 *
 *   a) Chỉ giữ từ mà bản bỏ dấu THỰC SỰ KHÁC bản gốc. Từ vốn đã không dấu có
 *      mặt ở mọi ngôn ngữ Latin.
 *
 *   b) Loại từ trùng với corpus ngôn ngữ KHÁC. Đây là bộ lọc đắt giá nhất và
 *      bản đầu tiên thiếu nó: với corpus nhỏ thì vô hại, nhưng khi corpus lớn
 *      lên, "can con the ban do la no ta..." (bỏ dấu từ "cần còn thế bạn đó lá
 *      nó tá") đều là từ tiếng Anh thật. Đo được: thiếu bộ lọc này, độ chính xác
 *      tiếng Anh tụt còn 45.5% vì lexicon nuốt luôn câu tiếng Anh.
 */
const strippedForms = new Set<string>();
for (const word of tokenize(text)) {
	const stripped = stripDiacritics(word);
	if (stripped !== word) strippedForms.add(stripped);
}

const otherLanguageWords = new Set<string>();
const corpusDir = path.join(ROOT, 'corpus');
for (const file of fs.readdirSync(corpusDir)) {
	if (!file.endsWith('.txt') || file === lang + '.txt') continue;
	if (file.indexOf('-abbreviations') !== -1) continue;
	const other = fs.readFileSync(path.join(corpusDir, file), 'utf-8');
	for (const word of tokenize(other)) {
		otherLanguageWords.add(word);
		// Bỏ dấu cả phía kia: "tiếng Anh bỏ dấu" vẫn là tiếng Anh.
		otherLanguageWords.add(stripDiacritics(word));
	}
}

let collisions = 0;
otherLanguageWords.forEach(function (word) {
	if (strippedForms.delete(word)) collisions++;
});

// Viết tắt thật (không chỉ là bỏ dấu) — danh sách nhỏ, ổn định, sửa tay.
const manualAbbreviations = fs.existsSync(abbreviationsPath)
	? fs.readFileSync(abbreviationsPath, 'utf-8').split(/\s+/).filter(Boolean)
	: [];

const lexicon = Array.from(new Set(Array.from(strippedForms).concat(manualAbbreviations))).sort();

if (lexicon.length > 0) {
	fs.writeFileSync(lexiconPath, JSON.stringify(lexicon) + '\n', 'utf-8');
	console.log(
		'✔ lexicon "' + lang + '": ' + lexicon.length + ' từ (đã loại ' + collisions +
			' từ trùng ngôn ngữ khác) -> ' + lexiconPath
	);
} else {
	console.log('· không sinh lexicon cho "' + lang + '" (corpus không có từ mang dấu)');
}
