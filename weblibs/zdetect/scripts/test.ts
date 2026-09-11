/**
 * Smoke test cho zdetect.
 *
 * Bản gốc (`test.mjs`, `test-teencode.mjs`) chỉ `console.log` kết quả rồi để
 * người đọc tự nhìn — tức là nó KHÔNG BAO GIỜ fail được, kể cả khi detector sai
 * hoàn toàn. Bản này assert thật và trả exit code khác 0 khi hỏng, để còn cắm
 * vào CI được.
 *
 *   npm test
 */

import { detector, detect, info } from '../src/index';

let failed = 0;
let passed = 0;

function check(label: string, actual: unknown, expected: unknown): void {
	const ok = JSON.stringify(actual) === JSON.stringify(expected);
	if (ok) {
		passed++;
		console.log('  ok   ' + label);
	} else {
		failed++;
		console.log('  SAI  ' + label);
		console.log('       mong đợi: ' + JSON.stringify(expected));
		console.log('       nhận về : ' + JSON.stringify(actual));
	}
}

function topLang(text: string): string | null {
	const result = detector.detectTop(text);
	return result ? result.lang : null;
}

console.log('— Ngôn ngữ thuần —');
check('hangul -> ko', topLang('한국어를 배우는 것은 정말 재미있습니다'), 'ko');
check('han -> zh', topLang('我今天去公园散步，天气非常好'), 'zh');
check('việt có dấu -> vi', topLang('Xin chào các bạn, hôm nay trời đẹp quá'), 'vi');
check('anh -> en', topLang('Hello everyone, how are you today'), 'en');

console.log('\n— Teencode: bỏ dấu + viết tắt, phải vẫn ra vi —');
const teencode = [
	'e ko bit phai lam j nua, chi mai lam sao day',
	'hom nay troi dep wa, di choi ko?',
	'may gio r ban oi, toi di ngu day',
	'thui de mk tinh lai da nhe',
	'cam on ny nhieu lam, iu ban qua',
];
for (const text of teencode) {
	check(JSON.stringify(text.slice(0, 32)), topLang(text), 'vi');
}

console.log('\n— Không được false positive sang vi —');
const english = [
	'ok man, see you later then',
	'lol that is so funny bro',
	'wait for me pls, be there soon',
];
for (const text of english) {
	check(JSON.stringify(text), topLang(text), 'en');
}

console.log('\n— Biên —');
check('chuỗi rỗng -> ranked rỗng', detect({ text: '' }).ranked.length, 0);
check('chỉ khoảng trắng -> ranked rỗng', detect({ text: '   ' }).ranked.length, 0);
check('detectTop dưới minLength -> null', detector.detectTop('a'), null);
check('emoji thuần -> ranked rỗng', detect({ text: '🎉🎉' }).ranked.length, 0);

console.log('\n— Layer 0: URL/email/số bị loại —');
check(
	'câu tiếng Việt lẫn URL và số vẫn ra vi',
	topLang('Xin chào, xem thêm tại https://example.com hoặc gọi 0912345678 nhé'),
	'vi'
);

console.log('\n— Văn bản trộn —');
const mixed = detect({ text: 'Hello 안녕하세요 xin chào 你好, rất vui được gặp mọi người!' });
const langs = mixed.ranked.map(function (r) {
	return r.lang;
});
check('nhận ra cả ko và zh', [langs.indexOf('ko') !== -1, langs.indexOf('zh') !== -1], [true, true]);
const total = mixed.ranked.reduce(function (sum, r) {
	return sum + r.proportion;
}, 0);
check('proportion cộng lại bằng 1', Math.abs(total - 1) < 1e-9, true);

console.log('\n— info() —');
check('scoreKind', info().scoreKind, 'proportion');
check('backend', info().backend, 'zdetect-js');

console.log('\n' + passed + ' đạt, ' + failed + ' sai');
if (failed > 0) process.exit(1);
