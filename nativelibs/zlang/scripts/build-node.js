'use strict';

/**
 * Build .node cho một target rồi copy vào thư mục theo tên platform.
 *
 * Vì sao không dùng `napi build` của @napi-rs/cli: việc nó làm thêm ở đây chỉ là
 * đổi tên artifact và sinh binding.d.ts. Kiểu dữ liệu công khai đã do index.d.ts
 * mô tả, nên script này thay thế được mà không thêm một dev dependency (cùng
 * chuỗi cung ứng) vào repo. Link flag cho napi do napi-build lo trong build.rs.
 *
 *   node scripts/build-node.js                 # target mặc định của máy
 *   node scripts/build-node.js aarch64-apple-darwin
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

/** Target Rust -> thư mục đích, theo quy ước `${process.platform}-${process.arch}`. */
const TARGETS = {
	'aarch64-apple-darwin': 'darwin-arm64',
	'x86_64-apple-darwin': 'darwin-x64',
	'i686-pc-windows-msvc': 'win32-ia32',
	'x86_64-pc-windows-msvc': 'win32-x64',
};

function hostTarget() {
	const byPlatform = {
		'darwin-arm64': 'aarch64-apple-darwin',
		'darwin-x64': 'x86_64-apple-darwin',
		'win32-ia32': 'i686-pc-windows-msvc',
		'win32-x64': 'x86_64-pc-windows-msvc',
	};
	const key = process.platform + '-' + process.arch;
	const target = byPlatform[key];
	if (!target) throw new Error('Không có target Rust cho ' + key);
	return target;
}

/** Tên file cargo sinh ra cho crate-type = cdylib. */
function artifactName(target) {
	return target.indexOf('windows') !== -1 ? 'zlang.dll' : 'libzlang.dylib';
}

function main() {
	const target = process.argv[2] || hostTarget();
	const outDir = TARGETS[target];
	if (!outDir) {
		throw new Error(
			'Target không được hỗ trợ: ' + target + '\nCó: ' + Object.keys(TARGETS).join(', ')
		);
	}

	console.log('[zlang] cargo build --release --target ' + target);
	execFileSync('cargo', ['build', '--release', '--target', target], {
		cwd: ROOT,
		stdio: 'inherit',
	});

	const built = path.join(ROOT, 'target', target, 'release', artifactName(target));
	if (!fs.existsSync(built)) throw new Error('Không thấy artifact: ' + built);

	// Node nạp addon theo đuôi .node; nội dung vẫn là dylib/dll bình thường.
	const destDir = path.join(ROOT, outDir);
	const dest = path.join(destDir, 'zlang.' + outDir + '.node');
	fs.mkdirSync(destDir, { recursive: true });
	fs.copyFileSync(built, dest);

	const size = (fs.statSync(dest).size / 1024).toFixed(0);
	console.log('[zlang] -> ' + path.relative(ROOT, dest) + ' (' + size + ' KB)');
}

main();
