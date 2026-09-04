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
	'i686-win7-windows-msvc': 'win32-ia32',
	'x86_64-win7-windows-msvc': 'win32-x64',
	// Hai target thường: KHÔNG chạy được trên Windows 7 (xem assertWin7Safe).
	// Giữ lại để build thử, nhưng bản ship phải là target *-win7-*.
	'i686-pc-windows-msvc': 'win32-ia32',
	'x86_64-pc-windows-msvc': 'win32-x64',
};

/**
 * Target `*-win7-windows-msvc` là tier 3: rustup không có sẵn std dựng trước,
 * phải tự build std từ nguồn nên cần nightly + component rust-src.
 */
function isWin7Target(target) {
	return target.indexOf('-win7-windows-') !== -1;
}

function hostTarget() {
	const byPlatform = {
		'darwin-arm64': 'aarch64-apple-darwin',
		'darwin-x64': 'x86_64-apple-darwin',
		// Mặc định của máy Windows là target win7, không phải target thường:
		// Win7 nằm trong ma trận hỗ trợ, nên bản dựng "tình cờ" phải là bản chạy
		// được ở đó, chứ không phải bản phải nhớ mới chọn đúng.
		'win32-ia32': 'i686-win7-windows-msvc',
		'win32-x64': 'x86_64-win7-windows-msvc',
	};
	const key = process.platform + '-' + process.arch;
	const target = byPlatform[key];
	if (!target) throw new Error('Không có target Rust cho ' + key);
	return target;
}

// ------------------------------------------------------- kiểm tra Windows 7

/**
 * Đọc bảng import của một file PE. Trả về { 'kernel32.dll': ['...'], ... }.
 *
 * Windows resolve toàn bộ import ngay lúc LoadLibrary: thiếu một DLL hay một
 * export là hỏng cả file, `require()` ném lỗi, và UI chỉ nói được
 * 'native-binding-missing'. Đọc bảng import ở đây phát hiện ra chuyện đó ngay
 * trên máy build, thay vì sau khi đã bê 87MB sang máy ảo.
 */
function peImports(file) {
	const d = fs.readFileSync(file);
	// Gọi nhầm với Mach-O/ELF thì lỗi offset ở dưới rất khó hiểu; chặn sớm.
	if (d.readUInt16LE(0) !== 0x5a4d) throw new Error('Không phải file PE: ' + file);
	const pe = d.readUInt32LE(0x3c);
	const nsec = d.readUInt16LE(pe + 6);
	const optSize = d.readUInt16LE(pe + 20);
	const opt = pe + 24;
	const pe32Plus = d.readUInt16LE(opt) === 0x20b;
	const impRva = d.readUInt32LE(opt + (pe32Plus ? 112 : 96) + 8);

	const secs = [];
	for (let i = 0; i < nsec; i++) {
		const b = opt + optSize + 40 * i;
		secs.push({
			va: d.readUInt32LE(b + 12),
			size: Math.max(d.readUInt32LE(b + 8), d.readUInt32LE(b + 16)),
			raw: d.readUInt32LE(b + 20),
		});
	}
	function off(rva) {
		for (const s of secs) {
			if (rva >= s.va && rva < s.va + s.size) return s.raw + (rva - s.va);
		}
		return -1;
	}
	function str(at) {
		return d.slice(at, d.indexOf(0, at)).toString('latin1');
	}

	const out = {};
	for (let i = off(impRva); ; i += 20) {
		const oft = d.readUInt32LE(i);
		const nameRva = d.readUInt32LE(i + 12);
		const first = d.readUInt32LE(i + 16);
		if (nameRva === 0) break;

		const dll = str(off(nameRva));
		out[dll] = [];
		const step = pe32Plus ? 8 : 4;
		for (let t = off(oft || first); ; t += step) {
			const lo = d.readUInt32LE(t);
			const hi = pe32Plus ? d.readUInt32LE(t + 4) : 0;
			if (lo === 0 && hi === 0) break;
			const isOrdinal = pe32Plus ? (hi & 0x80000000) !== 0 : (lo & 0x80000000) !== 0;
			// Import theo ordinal không có tên; bỏ qua, danh sách cấm đều theo tên.
			if (!isOrdinal) out[dll].push(str(off(lo & 0x7fffffff) + 2));
		}
	}
	return out;
}

/**
 * API mà `std` của Rust >= 1.78 dùng, nhưng Windows 7 không có. Đây chính là
 * thứ làm `zlang.win32-ia32.node` không nạp được trên Win7 (README §Môi trường
 * ghi Windows >= 7).
 */
const WIN7_FORBIDDEN = [
	{
		dll: 'api-ms-win-core-synch-l1-2-0.dll',
		fn: null,
		why: 'API set chỉ có từ Windows 8 (thread parking của std)',
	},
	{
		dll: 'bcryptprimitives.dll',
		fn: 'ProcessPrng',
		why: 'export chỉ có từ Windows 10 (seed random của std)',
	},
];

function assertWin7Safe(file) {
	const imports = peImports(file);
	const bad = [];

	for (const rule of WIN7_FORBIDDEN) {
		const fns = imports[rule.dll] || imports[rule.dll.toLowerCase()];
		if (!fns) continue;
		if (rule.fn && fns.indexOf(rule.fn) === -1) continue;
		bad.push(rule.dll + (rule.fn ? '!' + rule.fn : '') + ' — ' + rule.why);
	}

	if (bad.length) {
		throw new Error(
			'Artifact KHÔNG chạy được trên Windows 7:\n  ' + bad.join('\n  ') + '\n\n' +
				'Dựng bằng target win7 + nightly:\n' +
				'  rustup toolchain install nightly\n' +
				'  rustup component add rust-src --toolchain nightly\n' +
				'  npm run build:node:win32-ia32'
		);
	}

	console.log('[zlang] kiểm tra Windows 7: đạt (' + Object.keys(imports).join(', ') + ')');
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

	const args = ['build', '--release', '--target', target];
	if (isWin7Target(target)) {
		// Tier 3 nên không có std dựng sẵn: `+nightly` và tự build std từ nguồn.
		args.unshift('+nightly');
		args.push('-Z', 'build-std=std,panic_abort');
	}

	console.log('[zlang] cargo ' + args.join(' '));
	execFileSync('cargo', args, { cwd: ROOT, stdio: 'inherit' });

	const built = path.join(ROOT, 'target', target, 'release', artifactName(target));
	if (!fs.existsSync(built)) throw new Error('Không thấy artifact: ' + built);

	// Node nạp addon theo đuôi .node; nội dung vẫn là dylib/dll bình thường.
	const destDir = path.join(ROOT, outDir);
	const dest = path.join(destDir, 'zlang.' + outDir + '.node');
	fs.mkdirSync(destDir, { recursive: true });
	fs.copyFileSync(built, dest);

	// Chặn ngay tại máy build: bản Windows không nạp được trên Win7 thì không
	// được nằm lại trong repo.
	if (outDir.indexOf('win32-') === 0) assertWin7Safe(dest);

	const size = (fs.statSync(dest).size / 1024).toFixed(0);
	console.log('[zlang] -> ' + path.relative(ROOT, dest) + ' (' + size + ' KB)');
}

main();
