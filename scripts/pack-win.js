'use strict';

/**
 * Đóng gói bản Windows để CHẠY THỬ — không phải installer.
 *
 *   node scripts/pack-win.js              # cả ia32 lẫn x64
 *   node scripts/pack-win.js --arch=ia32  # chỉ 32-bit
 *
 * Cách làm: tải prebuilt Electron của Windows (đúng version đang pin trong
 * devDependencies), giải nén, rồi thả app vào `resources/app/`. Đó chính xác là
 * việc electron-builder/@electron/packager làm ở bước `--dir`, chỉ khác là
 * không cần cài thêm gì (npm install ở máy này chậm không dùng được) và không
 * cần Wine để cross-build từ macOS.
 *
 * Không có asar: .node phải nằm ngoài asar mới require được, mà đang chạy thử
 * thì thư mục phẳng dễ soi hơn.
 *
 * Kết quả: pc-dist/win32-<arch>/LangDetect.exe — copy nguyên thư mục sang máy
 * Windows rồi chạy. zlang gọi Extended Linguistic Services của OS nên bắt buộc
 * phải thử trên Windows thật, chạy qua Wine không nói lên điều gì.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'pc-dist');
const CACHE = path.join(OUT, '.cache');

const MIRROR = process.env.ELECTRON_MIRROR || 'https://github.com/electron/electron/releases/download/';

/** Version lấy từ node_modules để bản đóng gói khớp đúng bản `npm start` chạy. */
function electronVersion() {
	const file = path.join(ROOT, 'node_modules/electron/dist/version');
	if (!fs.existsSync(file)) {
		throw new Error('Chưa có node_modules/electron. Cài dependencies trước đã.');
	}
	return fs.readFileSync(file, 'utf8').trim();
}

function parseArchs() {
	const arg = process.argv.find(function (a) {
		return a.indexOf('--arch=') === 0;
	});
	if (!arg) return ['ia32', 'x64'];
	const archs = arg.slice('--arch='.length).split(',');
	archs.forEach(function (a) {
		if (a !== 'ia32' && a !== 'x64') throw new Error('arch không hợp lệ: ' + a + ' (chỉ ia32|x64)');
	});
	return archs;
}

function run(cmd, args, opts) {
	execFileSync(cmd, args, Object.assign({ stdio: 'inherit' }, opts));
}

// ------------------------------------------------------------------ download

/**
 * Tải zip + đối chiếu SHASUMS256.txt của chính release đó. Zip ~80MB, tải một
 * lần rồi cache lại; hỏng giữa chừng mà không check thì lỗi sẽ hiện ra dưới
 * dạng "app trắng trên Windows", tốn cả buổi để lần ra.
 */
function fetchElectronZip(version, arch) {
	const name = 'electron-v' + version + '-win32-' + arch + '.zip';
	const zip = path.join(CACHE, name);
	const base = MIRROR.replace(/\/?$/, '/') + 'v' + version + '/';

	fs.mkdirSync(CACHE, { recursive: true });

	if (!fs.existsSync(zip)) {
		console.log('[pack] tải ' + name);
		run('curl', ['-fSL', '--retry', '3', '-o', zip + '.part', base + name]);
		fs.renameSync(zip + '.part', zip);
	} else {
		console.log('[pack] dùng lại cache ' + name);
	}

	const sums = path.join(CACHE, 'SHASUMS256-' + version + '.txt');
	if (!fs.existsSync(sums)) {
		run('curl', ['-fSL', '--retry', '3', '-o', sums, base + 'SHASUMS256.txt']);
	}

	const want = fs
		.readFileSync(sums, 'utf8')
		.split('\n')
		.map(function (line) {
			return line.trim().split(/\s+\*?/);
		})
		.find(function (parts) {
			return parts[1] === name;
		});
	if (!want) throw new Error('Không thấy ' + name + ' trong SHASUMS256.txt');

	const got = execFileSync('shasum', ['-a', '256', zip], { encoding: 'utf8' }).trim().split(/\s+/)[0];
	if (got !== want[0]) {
		fs.unlinkSync(zip);
		throw new Error('Checksum sai cho ' + name + ' (đã xoá cache, chạy lại). ' + got + ' != ' + want[0]);
	}

	return zip;
}

// ------------------------------------------------------------------- copy app

function copyDir(from, to, filter) {
	fs.mkdirSync(to, { recursive: true });
	fs.readdirSync(from, { withFileTypes: true }).forEach(function (entry) {
		const src = path.join(from, entry.name);
		const dst = path.join(to, entry.name);
		if (filter && !filter(src, entry)) return;
		if (entry.isDirectory()) copyDir(src, dst, filter);
		else fs.copyFileSync(src, dst);
	});
}

/**
 * package.json cho bản đóng gói: chỉ giữ thứ Electron đọc lúc runtime. Bỏ
 * scripts/devDependencies để không ai tưởng thư mục này chạy được npm, và bỏ
 * dependencies vì esbuild đã bundle hết vào dist/ (chỉ `electron` là external).
 */
function writeAppManifest(appDir) {
	const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
	fs.writeFileSync(
		path.join(appDir, 'package.json'),
		JSON.stringify(
			{
				name: pkg.name,
				productName: 'Lang Detect',
				version: pkg.version,
				description: pkg.description,
				author: pkg.author,
				main: pkg.main,
			},
			null,
			'\t'
		) + '\n'
	);
}

/**
 * Chỉ copy slice .node đúng arch. `nativelibs/zlang/target/` là output build của
 * Rust (~77MB) — không bao giờ được đi kèm.
 */
function copyNativelibs(appDir, arch) {
	const src = path.join(ROOT, 'nativelibs');
	const dst = path.join(appDir, 'nativelibs');
	const slice = 'win32-' + arch;

	fs.mkdirSync(path.join(dst, 'zlang'), { recursive: true });
	fs.copyFileSync(path.join(src, 'index.js'), path.join(dst, 'index.js'));

	['index.js', 'index.d.ts', 'package.json'].forEach(function (f) {
		fs.copyFileSync(path.join(src, 'zlang', f), path.join(dst, 'zlang', f));
	});

	const node = path.join(src, 'zlang', slice, 'zlang.' + slice + '.node');
	if (!fs.existsSync(node)) {
		throw new Error(
			'Thiếu ' + path.relative(ROOT, node) + '.\n' +
				'Build trên máy Windows: npm run build:node:' + slice + ' (trong nativelibs/zlang)'
		);
	}
	copyDir(path.join(src, 'zlang', slice), path.join(dst, 'zlang', slice));
}

// ------------------------------------------------------------------------ run

function pack(version, arch) {
	const dest = path.join(OUT, 'win32-' + arch);
	const zip = fetchElectronZip(version, arch);

	fs.rmSync(dest, { recursive: true, force: true });
	fs.mkdirSync(dest, { recursive: true });

	console.log('[pack] giải nén -> ' + path.relative(ROOT, dest));
	run('unzip', ['-q', zip, '-d', dest]);

	// default_app.asar là app demo của Electron; có app thật rồi thì bỏ đi.
	fs.rmSync(path.join(dest, 'resources', 'default_app.asar'), { force: true });

	const appDir = path.join(dest, 'resources', 'app');
	fs.mkdirSync(appDir, { recursive: true });

	if (!fs.existsSync(path.join(ROOT, 'dist', 'main', 'main.js'))) {
		throw new Error('Chưa có dist/. Chạy `npm run build` trước.');
	}
	copyDir(path.join(ROOT, 'dist'), path.join(appDir, 'dist'));
	copyNativelibs(appDir, arch);
	writeAppManifest(appDir);

	// Đổi tên exe được vô tư — Electron tìm app qua resources/, không qua tên
	// file. Icon vẫn là icon Electron: đổi icon cần rcedit (chỉ chạy trên
	// Windows/Wine) mà chạy thử thì không cần.
	fs.renameSync(path.join(dest, 'electron.exe'), path.join(dest, 'LangDetect.exe'));

	console.log('[pack] xong: ' + path.relative(ROOT, dest) + '/LangDetect.exe');
	return dest;
}

function main() {
	const version = electronVersion();
	const archs = parseArchs();
	console.log('[pack] Electron v' + version + ' — ' + archs.join(', '));
	archs.forEach(function (arch) {
		pack(version, arch);
	});
	console.log('');
	console.log('  Copy thư mục pc-dist/win32-<arch>/ sang máy Windows rồi chạy LangDetect.exe.');
	console.log('  (Chạy trên ' + os.platform() + ' không được: exe là binary Windows.)');
	console.log('');
}

try {
	main();
} catch (err) {
	console.error('\n' + (err && err.message ? err.message : err) + '\n');
	process.exit(1);
}
