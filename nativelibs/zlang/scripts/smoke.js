'use strict';

/**
 * Smoke test qua facade đã build (index.js), không gọi .node trực tiếp — để cũng
 * kiểm luôn phần chọn prebuilt và phần map dữ liệu.
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

function main() {
	const info = zlang.info();
	const status = zlang.availability();
	console.log('[zlang] info      ', JSON.stringify(info));
	console.log('[zlang] availability', JSON.stringify(status));

	if (!status.supported) {
		console.error('[zlang] backend không dùng được -> bỏ qua phần nhận diện');
		process.exit(1);
	}

	let failed = 0;
	const run = CASES.reduce(function (chain, testCase) {
		return chain.then(function () {
			const startedAt = process.hrtime.bigint();
			return zlang.detect(testCase.text, { maxResults: 3 }).then(function (results) {
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
						(best ? best.confidence.toFixed(4) : '     ') +
						'  ' +
						ms.toFixed(2) +
						'ms'
				);
			});
		});
	}, Promise.resolve());

	// Văn bản rỗng: phải là mảng rỗng, KHÔNG phải reject.
	run
		.then(function () {
			return zlang.detect('').then(function (results) {
				const ok = Array.isArray(results) && results.length === 0;
				if (!ok) failed++;
				console.log((ok ? '  ok  ' : ' FAIL ') + 'văn bản rỗng -> mảng rỗng');
			});
		})
		.then(function () {
			if (failed > 0) {
				console.error('[zlang] ' + failed + ' case sai');
				process.exit(1);
			}
			console.log('[zlang] tất cả case đúng');
		})
		.catch(function (err) {
			console.error('[zlang] lỗi:', err);
			process.exit(1);
		});
}

main();
