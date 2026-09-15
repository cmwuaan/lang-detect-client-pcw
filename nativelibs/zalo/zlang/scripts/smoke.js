'use strict';

/**
 * Smoke test qua facade đã build (index.js), KHÔNG gọi .node trực tiếp — để
 * kiểm luôn phần chọn prebuilt theo platform và phần đổi tên field.
 *
 *   node scripts/smoke.js
 *
 * Thoát khác 0 nếu backend không dùng được hoặc có mẫu bị nhận sai.
 */

const zlang = require('..');

/** Mẫu đủ dài để model kết luận được; ngắn hơn ~15 ký tự là không đáng tin. */
const CASES = [
	{ expect: 'vi', text: 'Xin chào, hôm nay trời đẹp quá, tôi muốn đi dạo ở công viên.' },
	{ expect: 'en', text: 'The quick brown fox jumps over the lazy dog near the river bank.' },
	{ expect: 'ja', text: '今日はいい天気ですね。公園を散歩したいです。' },
	{ expect: 'ko', text: '오늘 날씨가 정말 좋네요. 공원에서 산책하고 싶어요.' },
	{ expect: 'th', text: 'วันนี้อากาศดีมาก ฉันอยากไปเดินเล่นที่สวนสาธารณะ' },
	{ expect: 'ru', text: 'Сегодня прекрасная погода, я хочу погулять в парке.' },
	{ expect: 'fr', text: "Il fait très beau aujourd'hui, je veux me promener dans le parc." },
	/* zh trả về 'zh-Hans'/'zh-Hant' nên so bằng tiền tố. */
	{ expect: 'zh', text: '今天天气很好，我想去公园散步。' },
];

function formatConfidence(value) {
	// null là hợp lệ: backend chỉ xếp hạng, không cho điểm (Windows/ELS).
	return value === null ? '  (rank)' : value.toFixed(4);
}

async function main() {
	console.log('[zlang] info        ', JSON.stringify(zlang.info()));
	console.log('[zlang] availability', JSON.stringify(zlang.availability()));
	console.log('');

	if (!zlang.availability().supported) {
		console.error('[zlang] backend không dùng được -> bỏ qua phần nhận diện');
		process.exit(1);
	}

	let failed = 0;

	for (const testCase of CASES) {
		const startedAt = process.hrtime.bigint();
		const results = await zlang.detect(testCase.text, { maxResults: 3 });
		const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;

		const best = results.length > 0 ? results[0] : null;
		const tag = best ? best.detectedLanguage : '(rỗng)';
		const ok = best !== null && tag.split('-')[0] === testCase.expect;
		if (!ok) failed++;

		console.log(
			(ok ? '  ok  ' : ' FAIL ') +
				testCase.expect.padEnd(4) +
				'-> ' +
				tag.padEnd(9) +
				formatConfidence(best ? best.confidence : null) +
				'  ' +
				ms.toFixed(2) +
				'ms'
		);
	}

	// Biên: những thứ dễ bị coi là lỗi nhưng thực ra là kết quả hợp lệ.
	console.log('');
	const empty = await zlang.detect('', { maxResults: 3 });
	console.log('chuỗi rỗng       ->', JSON.stringify(empty), empty.length === 0 ? 'ok' : 'FAIL');
	if (empty.length !== 0) failed++;

	const capped = await zlang.detect('Xin chào các bạn', { maxResults: 1 });
	console.log('maxResults=1     ->', capped.length, 'kết quả', capped.length === 1 ? 'ok' : 'FAIL');
	if (capped.length !== 1) failed++;

	const uncapped = await zlang.detect('Xin chào các bạn');
	console.log('không maxResults ->', uncapped.length, 'kết quả (sức chứa buffer)');

	// dominantLanguage(): phải khớp phần tử đầu của detect() và trả null ở đúng
	// chỗ detect() trả mảng rỗng.
	console.log('');
	for (const testCase of CASES) {
		const tag = await zlang.dominantLanguage(testCase.text);
		const ok = tag !== null && tag.split('-')[0] === testCase.expect;
		if (!ok) failed++;
		console.log(
			(ok ? '  ok  ' : ' FAIL ') +
				'dominant ' +
				testCase.expect.padEnd(4) +
				'-> ' +
				(tag === null ? '(null)' : tag)
		);
	}

	const dominantEmpty = await zlang.dominantLanguage('');
	console.log(
		'dominant chuỗi rỗng ->',
		JSON.stringify(dominantEmpty),
		dominantEmpty === null ? 'ok' : 'FAIL'
	);
	if (dominantEmpty !== null) failed++;

	console.log('');
	if (failed) {
		console.error('FAILED: ' + failed);
		process.exit(1);
	}
	console.log('✅ tất cả đạt');
}

main().catch(function (err) {
	console.error(err);
	process.exit(1);
});
