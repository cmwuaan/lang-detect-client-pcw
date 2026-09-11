/**
 * Chạy một file TypeScript bằng Node mà không cần ts-node.
 *
 * Repo không có ts-node và cố tình không thêm — mỗi dev dependency là một mắt
 * xích chuỗi cung ứng nữa. esbuild đã có sẵn, nên: bundle file TS ra file tạm
 * rồi `import()` nó. Tốn ~30ms, đổi lại script train/test viết bằng TypeScript
 * như phần còn lại của package.
 *
 *   node scripts/run-ts.js scripts/train.ts vi
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
	const entry = process.argv[2];
	if (!entry) {
		throw new Error('Thiếu đường dẫn file TS. Ví dụ: node scripts/run-ts.js scripts/test.ts');
	}

	// mkdtemp chứ không dùng tên cố định: hai lần chạy song song không giẫm lên
	// nhau, và không để lại rác trong repo.
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zdetect-'));
	const outfile = path.join(tmpDir, 'entry.mjs');

	try {
		await esbuild.build({
			entryPoints: [path.resolve(ROOT, entry)],
			outfile: outfile,
			bundle: true,
			format: 'esm',
			platform: 'node',
			target: ['node14'],
			loader: { '.json': 'json' },
			logLevel: 'warning',
			/*
			 * File đã bundle nằm trong thư mục TẠM, nên `__dirname`/`import.meta.url`
			 * lúc chạy trỏ vào tmpdir chứ không phải package. Bơm thẳng đường dẫn
			 * gốc vào lúc build — script train dựa vào nó để tìm corpus/profiles.
			 */
			define: { __ZDETECT_ROOT__: JSON.stringify(ROOT) },
		});

		// Đối số sau tên file được chuyển tiếp nguyên vẹn cho script.
		process.argv = [process.argv[0], outfile].concat(process.argv.slice(3));
		await import(pathToFileURL(outfile).href);
	} finally {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	}
}

main().catch(function (err) {
	console.error(err);
	process.exit(1);
});
