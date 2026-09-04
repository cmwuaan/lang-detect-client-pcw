'use strict';

/**
 * Đóng gói bản Windows để CHẠY THỬ — không phải installer.
 *
 *   node scripts/pack-win.js              # cả ia32 lẫn x64, kèm .zip
 *   node scripts/pack-win.js --arch=ia32  # chỉ 32-bit
 *   node scripts/pack-win.js --no-zip     # chỉ thư mục, bỏ bước nén
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
 * Chạy được trên CẢ macOS lẫn Windows: chỉ gọi ra ngoài `curl` và `tar`, hai
 * thứ Windows 10 1803+ có sẵn (tar.exe chính là bsdtar, nén/giải nén zip được).
 * Trước đây script gọi `shasum`/`unzip`/`zip` — trên Windows là `ENOENT`, và
 * script chết ngay sau bước tải, chỉ để lại mỗi zip Electron trong .cache/.
 *
 * Kết quả: pc-dist/LangDetect-win32-<arch>.zip — chép sang máy/VM Windows, giải
 * nén, chạy LangDetect.exe. zlang gọi Extended Linguistic Services của OS nên
 * bắt buộc phải thử trên Windows thật, chạy qua Wine không nói lên điều gì.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
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

/**
 * cwd LUÔN ghim về ROOT. `pack()` xoá pc-dist/win32-<arch>/ trước khi giải nén;
 * nếu shell đang đứng trong thư mục vừa bị xoá thì mọi spawn sau đó chết bằng
 * `spawnSync ... ENOENT` — lỗi trông như thiếu binary nhưng thật ra là mất cwd.
 */
function run(cmd, args, opts) {
	execFileSync(cmd, args, Object.assign({ stdio: 'inherit', cwd: ROOT }, opts));
}

/**
 * Kiểm tra binary ngoài NGAY TỪ ĐẦU, tự dò PATH thay vì spawn `which`/`where`
 * (spawn để kiểm tra spawn thì vẫn nổ đúng cái lỗi đang muốn tránh). `ENOENT`
 * trần từ spawnSync không nói được binary nào thiếu — mà đó chính là cách lỗi
 * `shasum` trên Windows ẩn mình.
 */
function requireTools(names) {
	const exts =
		process.platform === 'win32' ? (process.env.PATHEXT || '.EXE').split(';') : [''];
	const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);

	const missing = names.filter(function (name) {
		return !dirs.some(function (dir) {
			return exts.some(function (ext) {
				try {
					fs.accessSync(path.join(dir, name + ext), fs.constants.X_OK);
					return true;
				} catch (e) {
					return false;
				}
			});
		});
	});

	if (missing.length) {
		throw new Error(
			'Không tìm thấy trên PATH: ' + missing.join(', ') + '\n' +
				(process.platform === 'win32'
					? 'Cần Windows 10 1803+ (có sẵn curl.exe và tar.exe).\n'
					: '') +
				'PATH đang là: ' + (process.env.PATH || '(rỗng)')
		);
	}
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

	// Băm bằng crypto của Node, KHÔNG gọi `shasum`: đó là script Perl của
	// macOS/Linux, trên Windows không tồn tại -> `spawnSync shasum ENOENT`.
	const got = crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
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

	// `tar -xf` thay cho `unzip`: bsdtar đọc được zip, và Windows 10 1803+ có
	// sẵn tar.exe trong khi `unzip` thì không.
	console.log('[pack] giải nén -> ' + path.relative(ROOT, dest));
	run('tar', ['-xf', zip, '-C', dest]);

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

/**
 * Gói lại thành .zip để bê sang VM (shared folder / drag-drop của VirtualBox).
 * Explorer của Windows tự giải nén được, không cần cài thêm gì trong guest.
 */
function makeZip(dest, arch) {
	const name = 'LangDetect-win32-' + arch + '.zip';
	const zip = path.join(OUT, name);

	fs.rmSync(zip, { force: true });
	console.log('[pack] nén ' + name + ' (vài chục giây)');

	// bsdtar mặc định ghi zip ở chế độ `store` — không ép deflate thì file phình
	// từ ~90MB lên ~200MB.
	const args = ['--format', 'zip', '--options', 'zip:compression=deflate'];
	// Không có cờ này, bsdtar của macOS nhét thêm entry `._*` (resource fork)
	// vào zip; sang Windows chỉ tổ rác. Cờ này là của riêng macOS, tar.exe của
	// Windows không hiểu nên chỉ thêm đúng chỗ.
	if (process.platform === 'darwin') args.push('--no-mac-metadata');
	args.push('--exclude', '.DS_Store', '-cf', zip, path.basename(dest));

	// Chạy từ OUT nên đường dẫn trong zip là `win32-<arch>/...`: giải nén ra là
	// một thư mục gọn, không đổ tung toé vào Desktop.
	run('tar', args, { cwd: OUT });

	const mb = Math.round(fs.statSync(zip).size / 1024 / 1024);
	console.log('[pack] ' + path.relative(ROOT, zip) + ' (' + mb + 'MB)');
	return zip;
}

function main() {
	const version = electronVersion();
	const archs = parseArchs();
	const wantZip = process.argv.indexOf('--no-zip') === -1;

	requireTools(['curl', 'tar']);

	console.log('[pack] Electron v' + version + ' — ' + archs.join(', '));
	archs.forEach(function (arch) {
		const dest = pack(version, arch);
		if (wantZip) makeZip(dest, arch);
	});

	console.log('');
	if (wantZip) {
		console.log('  Chép pc-dist/LangDetect-win32-<arch>.zip sang VM Windows, giải nén,');
		console.log('  rồi chạy LangDetect.exe trong thư mục đó.');
	} else {
		console.log('  Copy thư mục pc-dist/win32-<arch>/ sang máy Windows rồi chạy LangDetect.exe.');
	}
	if (os.platform() !== 'win32') {
		console.log('  (Chạy trên ' + os.platform() + ' không được: exe là binary Windows.)');
	}
	console.log('');
}

try {
	main();
} catch (err) {
	console.error('\n' + (err && err.message ? err.message : err) + '\n');
	process.exit(1);
}
