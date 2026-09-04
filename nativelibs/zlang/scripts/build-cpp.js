'use strict';

/**
 * Build bản C++ (src-cpp/) bằng node-gyp.
 *
 * Được gọi từ scripts/build-node.js với `--impl=cpp`; không chạy trực tiếp.
 *
 * Hai việc gyp không tự làm được, script này lo:
 *   1. Biên dịch bridge Swift thành static archive (gyp không có luật cho Swift).
 *   2. Đổi tên và copy artifact vào thư mục theo nền tảng, giống bản Rust.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
/** Nằm NGOÀI build/ vì `node-gyp rebuild` xoá sạch build/ trước khi dựng lại. */
const SWIFT_OUT = path.join(ROOT, '.build-cpp');

/**
 * Phải khớp MACOSX_DEPLOYMENT_TARGET trong binding.gyp, nếu không .node mang
 * LC_BUILD_VERSION lệch giữa phần Swift và phần C++.
 */
const MACOS_DEPLOYMENT_TARGET = '10.15';

function run(cmd, args) {
	console.log('[zlang] ' + cmd + ' ' + args.join(' '));
	execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });
}

/**
 * node-gyp là công cụ bắt buộc của đường C++, nhưng npm ship sẵn một bản bên
 * trong. Ưu tiên bản khai trong devDependencies; không có thì dùng bản của npm,
 * để không bắt ai cài thêm chỉ để build một lần.
 */
function resolveNodeGyp() {
	try {
		return require.resolve('node-gyp/bin/node-gyp.js', { paths: [ROOT] });
	} catch (err) {
		/* Chưa khai trong devDependencies — thử bản npm ship kèm. */
	}

	/*
	 * Bố cục npm khác nhau giữa hai hệ, phải thử cả hai:
	 *   POSIX   <node>/lib/node_modules/npm/...
	 *   Windows <node>/node_modules/npm/...      (KHÔNG có lib/)
	 * Chỉ dò một bố cục là trên Windows ghép ra "C:\Program Files\lib\..." —
	 * đường không tồn tại, và lỗi hiện ra dưới dạng "không tìm thấy node-gyp".
	 */
	const nodeDir = path.dirname(process.execPath);
	const tail = ['node_modules', 'npm', 'node_modules', 'node-gyp', 'bin', 'node-gyp.js'];
	const candidates = [
		path.join(nodeDir, ...tail),
		path.join(nodeDir, '..', 'lib', ...tail),
	];

	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) return candidate;
	}

	throw new Error(
		'Không tìm thấy node-gyp. Cài đúng bản đã ghim:\n' +
			'  npm install --save-dev node-gyp@8.4.1\n\n' +
			'ĐỪNG lấy `latest`: bản >= 10 bỏ hỗ trợ Node 14, mà zalo-pc-app build\n' +
			'bằng Node 14. 8.4.1 là bản `mp4thumb` trong nativelibs thật đang dùng\n' +
			'(xem README §Phiên bản node-gyp và Visual Studio).\n\n' +
			'Đã thử các đường sau:\n  ' + candidates.join('\n  ') + '\n\n' +
			'node-gyp cũng cần Python 3 — đó là dependency mà đường Rust không có.'
	);
}

/**
 * swiftc -> libzlang_bridge.a (tĩnh).
 *
 * Vì sao TĨNH chứ không phải dylib: zlang không có consumer nào ngoài Node, nên
 * link tĩnh để chỉ phải ship đúng một file .node — không rpath cho archive,
 * không install_name, không phải ký thêm binary thứ hai. Đây là bản dịch của
 * build_swift_bridge() trong build.rs.
 */
function buildSwiftBridge(arch) {
	fs.mkdirSync(SWIFT_OUT, { recursive: true });
	const archive = path.join(SWIFT_OUT, 'libzlang_bridge.a');
	const triple = arch + '-apple-macosx' + MACOS_DEPLOYMENT_TARGET;

	run('swiftc', [
		'-emit-library',
		'-static',
		'-module-name',
		'zlang_bridge',
		'-target',
		triple,
		// Nạp ABI dùng chung để Swift thấy ZlangHypothesis, ZLANG_TAG_CAP, ZLANG_ERR_*.
		'-import-objc-header',
		'src/zlang_bridge.h',
		// -O + whole-module để hàm @_cdecl không bị bỏ qua khi tối ưu.
		'-O',
		'-wmo',
		'-o',
		archive,
		'src/bridge_darwin.swift',
	]);

	if (!fs.existsSync(archive)) throw new Error('swiftc không sinh ra ' + archive);
	return archive;
}

/**
 * `outDir` là tên thư mục nền tảng ('win32-ia32', 'darwin-arm64'…), và cũng là
 * thứ quyết định arch mà node-gyp phải dựng.
 */
function build(outDir) {
	const arch = outDir.slice(outDir.indexOf('-') + 1);

	if (process.platform === 'darwin') {
		// gyp không biết build Swift; phải có archive TRƯỚC khi nó link.
		buildSwiftBridge(arch === 'arm64' ? 'arm64' : 'x86_64');
	}

	const nodeGyp = resolveNodeGyp();
	// `rebuild` = clean + configure + build: tránh cấu hình cũ của arch trước
	// còn sót lại, thứ sinh ra lỗi link rất khó hiểu khi đổi qua lại ia32/x64.
	try {
		run(process.execPath, [nodeGyp, 'rebuild', '--arch=' + arch, '--release']);
	} catch (err) {
		if (process.platform === 'win32') {
			/*
			 * Lỗi hay gặp nhất và khó đoán nhất: node-gyp dò Visual Studio qua
			 * bảng ánh xạ CỨNG (15->2017, 16->2019, 17->2022) trong
			 * lib/find-visualstudio.js. Máy chỉ có VS mới hơn sẽ báo
			 * `unknown version "undefined"` — nghe như thiếu Visual Studio, thật
			 * ra là node-gyp quá cũ để đọc phiên bản đó. Chạy từ Developer
			 * Command Prompt KHÔNG cứu được: VCINSTALLDIR chỉ lọc bản nào được
			 * dùng, không bỏ qua bảng ánh xạ.
			 */
			console.error(
				'\n[zlang] Nếu log phía trên có `find VS unknown version "undefined"`:\n' +
					'  node-gyp 8.4.1 chỉ nhận ra Visual Studio 2017/2019/2022.\n' +
					'  Cách sửa: cài Build Tools for Visual Studio 2022, kèm component\n' +
					'  `MSVC v141 - VS 2017 C++ x64/x86 build tools` cho việc target Win7,\n' +
					'  rồi `set ZLANG_MSVS_TOOLSET=v141`.\n\n' +
					'  Hoặc dùng đường Rust — nó dò MSVC bằng logic không giới hạn phiên bản\n' +
					'  nên chạy được với bản Visual Studio mới nhất:\n' +
					'    npm run build:node:win32-' + arch + '\n'
			);
		}
		throw err;
	}

	const built = path.join(ROOT, 'build', 'Release', 'zlang.node');
	if (!fs.existsSync(built)) throw new Error('Không thấy artifact: ' + built);
	return built;
}

module.exports = { build, MACOS_DEPLOYMENT_TARGET };
