'use strict';

/**
 * Build .node cho một target rồi copy vào thư mục theo tên platform.
 *
 * Lớp keo napi là Rust: src/lib.rs + src/backend.rs, dựng qua cargo, dùng bridge
 * và ABI ở src/. Toolchain đã ghim trong rust-toolchain.toml — xem README về
 * ràng buộc Windows 7. Xuất xứ của artifact nằm ở
 * <thư-mục-nền-tảng>/build-info.json.
 *
 *   node scripts/build-node.js                              # target của máy
 *   node scripts/build-node.js i686-pc-windows-msvc         # ia32
 *
 * Vì sao không dùng `napi build` của @napi-rs/cli: việc nó làm thêm
 * ở đây chỉ là đổi tên artifact và sinh binding.d.ts. Kiểu dữ liệu công khai đã
 * do index.d.ts mô tả, nên script này thay thế được mà không thêm một dev
 * dependency (cùng chuỗi cung ứng) vào repo. Link flag cho napi do napi-build lo
 * trong build.rs.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { assertWin7Safe } = require('./win7-guard');

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

function parseArgs() {
	const args = process.argv.slice(2);
	let target = null;

	for (const arg of args) {
		if (arg.indexOf('--') === 0) throw new Error('Cờ không hiểu: ' + arg);
		target = arg;
	}

	return { target: target || hostTarget() };
}

/**
 * rust-toolchain.toml ghim 1.77.2 nhưng `profile = "minimal"` chỉ kéo std của
 * máy host. Tự thêm target còn thiếu, thay vì để cargo báo một lỗi mà cách sửa
 * nằm ở chỗ khác.
 */
function ensureTarget(target) {
	const installed = execFileSync('rustup', ['target', 'list', '--installed'], {
		cwd: ROOT,
		encoding: 'utf8',
	});
	if (installed.split(/\r?\n/).indexOf(target) !== -1) return;

	console.log('[zlang] rustup target add ' + target);
	execFileSync('rustup', ['target', 'add', target], { cwd: ROOT, stdio: 'inherit' });
}

/** Tên file cargo sinh ra cho crate-type = cdylib. */
function artifactName(target) {
	return target.indexOf('windows') !== -1 ? 'zlang.dll' : 'libzlang.dylib';
}

function buildRust(target) {
	ensureTarget(target);

	console.log('[zlang] cargo build --release --target ' + target);
	execFileSync('cargo', ['build', '--release', '--target', target], {
		cwd: ROOT,
		stdio: 'inherit',
	});

	const built = path.join(ROOT, 'target', target, 'release', artifactName(target));
	if (!fs.existsSync(built)) throw new Error('Không thấy artifact: ' + built);
	return built;
}

/** Phiên bản toolchain, ghi vào build-info.json để artifact không thành hộp đen. */
function toolchainVersion() {
	try {
		return execFileSync('rustc', ['--version'], { cwd: ROOT, encoding: 'utf8' }).trim();
	} catch (err) {
		return 'unknown';
	}
}

/**
 * Xuất xứ đi cùng artifact.
 *
 * Bài học từ `zwalker` trong nativelibs thật: binary commit vào repo mà không có
 * source lẫn thông tin toolchain là hộp đen — không ai trả lời được nó dựng bằng
 * gì, và hoá ra nó mang sẵn lỗi Windows 7 mà không ai biết.
 */
function writeBuildInfo(destDir, target) {
	fs.writeFileSync(
		path.join(destDir, 'build-info.json'),
		JSON.stringify(
			{
				target: target,
				toolchain: toolchainVersion(),
				builtOn: process.platform + '-' + process.arch,
				builtAt: new Date().toISOString(),
			},
			null,
			'\t'
		) + '\n'
	);
}

function main() {
	const { target } = parseArgs();
	const outDir = TARGETS[target];
	if (!outDir) {
		throw new Error(
			'Target không được hỗ trợ: ' + target + '\nCó: ' + Object.keys(TARGETS).join(', ')
		);
	}

	console.log('[zlang] target=' + target);

	const built = buildRust(target);

	// Node nạp addon theo đuôi .node; nội dung vẫn là dylib/dll bình thường.
	const destDir = path.join(ROOT, outDir);
	const dest = path.join(destDir, 'zlang.' + outDir + '.node');
	fs.mkdirSync(destDir, { recursive: true });
	fs.copyFileSync(built, dest);

	// Chặn ngay tại máy build: bản Windows không nạp được trên Win7 thì không
	// được nằm lại trong repo.
	if (outDir.indexOf('win32-') === 0) {
		assertWin7Safe(
			dest,
			'Gần như chắc chắn cargo đã dùng toolchain khác 1.77.2. Kiểm tra:\n' +
				'  rustc -vV        (phải là 1.77.2)\n' +
				'  cat rust-toolchain.toml\n' +
				'Rust >= 1.78 không dựng được binary chạy trên Win7.'
		);
	}

	writeBuildInfo(destDir, target);

	const size = (fs.statSync(dest).size / 1024).toFixed(0);
	console.log('[zlang] -> ' + path.relative(ROOT, dest) + ' (' + size + ' KB)');
}

main();
