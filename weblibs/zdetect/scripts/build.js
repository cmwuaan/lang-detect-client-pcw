/**
 * Build zdetect thành một bundle duy nhất.
 *
 *   dist/index.js          ESM đã bundle, profile JSON inline sẵn
 *   dist/types/src/*.d.ts  khai báo kiểu, do `tsc` phát (xem npm run build)
 *
 * Vì sao commit dist/: giống nativelibs/zlang — bên tiêu thụ (renderer của app,
 * sau này là zalo-pc-app) dùng thẳng artifact, không phải dựng lại. Alias trong
 * scripts/build.js ở repo root trỏ vào đúng dist/index.js, nên bản web chạy
 * artifact đã build chứ không phải source.
 *
 * KHÔNG minify: bundle chỉ ~14KB và nó được commit — diff đọc được đáng giá hơn
 * vài KB. App bundle lại lần nữa và tự minify ở đó.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTFILE = path.join(ROOT, 'dist/index.js');

async function main() {
	const result = await esbuild.build({
		entryPoints: [path.join(ROOT, 'src/index.ts')],
		outfile: OUTFILE,
		bundle: true,
		format: 'esm',
		platform: 'neutral',
		// Khớp Chromium 108 của Electron 22.3.9 — bản web phải chạy được ở đó.
		target: ['es2018'],
		sourcemap: false,
		minify: false,
		// JSON loader chính là thứ thay thế fs.readFileSync của bản cũ.
		loader: { '.json': 'json' },
		logLevel: 'warning',
		metafile: true,
	});

	/*
	 * `dist/index.d.ts` nằm CẠNH `dist/index.js`, đúng kiểu một package bình
	 * thường. `tsc` phát khai báo vào dist/types/ theo cây thư mục nguồn, nên nếu
	 * để `types` trỏ thẳng vào đó thì JS và type nằm hai nơi khác nhau — trình
	 * soạn thảo hay resolve nhầm, và lỗi hiện ra dưới dạng "has no exported
	 * member" rất khó đoán. Một dòng re-export xoá hẳn lớp lệch đó.
	 */
	fs.writeFileSync(
		path.join(ROOT, 'dist/index.d.ts'),
		"export * from './types/src/index';\n",
		'utf-8'
	);

	const key = Object.keys(result.metafile.outputs)[0];
	const bytes = key ? result.metafile.outputs[key].bytes : 0;
	console.log('[zdetect] -> dist/index.js (' + (bytes / 1024).toFixed(1) + ' KB) + dist/index.d.ts');
}

main().catch(function (err) {
	console.error(err);
	process.exit(1);
});
