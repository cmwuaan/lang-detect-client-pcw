'use strict';

/**
 * Đóng gói bản macOS để CHẠY THỬ — .dmg gửi cho người khác, không phải bản
 * phát hành.
 *
 *   node scripts/pack-mac.js               # cả arm64 lẫn x64
 *   node scripts/pack-mac.js --arch=arm64  # chỉ Apple Silicon
 *   node scripts/pack-mac.js --no-dmg      # chỉ .app, bỏ bước tạo ảnh đĩa
 *
 * Cách làm giống hệt pack-win.js — tải prebuilt Electron đúng version đang pin,
 * giải nén, thả app vào bundle — nhưng macOS đòi thêm ba việc mà Windows không:
 *
 *   1. App code nằm ở `Contents/Resources/app/`, không phải `resources/app/`.
 *   2. Đổi tên phải sửa CẢ `Contents/MacOS/<exe>` LẪN Info.plist. Chỉ rename
 *      file thì CFBundleExecutable trỏ vào chỗ trống và app không mở được.
 *   3. Sửa bundle xong là chữ ký hỏng: `codesign --verify` báo "code has no
 *      resources but signature indicates they must be present". arm64 KHÔNG
 *      chạy Mach-O chữ ký hỏng, nên bước re-sign là bắt buộc, không phải tuỳ chọn.
 *
 * CHỮ KÝ AD-HOC, KHÔNG NOTARIZE. `spctl -a` sẽ trả `rejected` — đó là đúng như
 * thiết kế ở đây, không phải lỗi. Người nhận tải về sẽ bị Gatekeeper chặn một
 * lần và phải vào System Settings -> Privacy & Security -> Open Anyway. Muốn
 * hết hẳn ma sát đó thì cần Developer ID + `xcrun notarytool` (99$/năm), nằm
 * ngoài phạm vi script này.
 *
 * Chỉ chạy được TRÊN macOS: codesign/hdiutil/ditto/plutil là công cụ của hệ
 * điều hành, không có bản cho Windows hay Linux.
 *
 * Không có asar: .node phải nằm ngoài asar mới require được, mà đang chạy thử
 * thì thư mục phẳng dễ soi hơn.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'pc-dist');
const CACHE = path.join(OUT, '.cache');

const MIRROR = process.env.ELECTRON_MIRROR || 'https://github.com/electron/electron/releases/download/';

/** Tên hiển thị + tên file thực thi trong bundle. */
const APP_NAME = 'LangDetect';
const BUNDLE_ID = 'vn.zalo.langdetect';

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
	if (!arg) return ['arm64', 'x64'];
	const archs = arg.slice('--arch='.length).split(',');
	archs.forEach(function (a) {
		if (a !== 'arm64' && a !== 'x64') throw new Error('arch không hợp lệ: ' + a + ' (chỉ arm64|x64)');
	});
	return archs;
}

/**
 * cwd LUÔN ghim về ROOT — cùng lý do như pack-win.js: pack() xoá thư mục đích
 * trước khi giải nén, shell đứng trong thư mục vừa bị xoá thì mọi spawn sau đó
 * chết bằng ENOENT, lỗi trông như thiếu binary nhưng thật ra là mất cwd.
 */
function run(cmd, args, opts) {
	execFileSync(cmd, args, Object.assign({ stdio: 'inherit', cwd: ROOT }, opts));
}

/** Như run() nhưng nuốt stdout — dùng cho lệnh chỉ cần biết đỗ hay trượt. */
function runQuiet(cmd, args) {
	return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function requireTools(names) {
	const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);

	const missing = names.filter(function (name) {
		return !dirs.some(function (dir) {
			try {
				fs.accessSync(path.join(dir, name), fs.constants.X_OK);
				return true;
			} catch (e) {
				return false;
			}
		});
	});

	if (missing.length) {
		throw new Error(
			'Không tìm thấy trên PATH: ' + missing.join(', ') + '\n' +
				'Bốn công cụ này đi kèm macOS; thiếu nghĩa là PATH bị cắt.\n' +
				'PATH đang là: ' + (process.env.PATH || '(rỗng)')
		);
	}
}

// ------------------------------------------------------------------ download

/**
 * Tải zip + đối chiếu SHASUMS256.txt của chính release đó. Zip ~90MB, tải một
 * lần rồi cache lại.
 *
 * Tải cả arm64 lẫn x64 kể cả khi node_modules đã có sẵn đúng một slice: bản
 * đóng gói phải giống nhau bất kể máy build là Intel hay Apple Silicon.
 */
function fetchElectronZip(version, arch) {
	const name = 'electron-v' + version + '-darwin-' + arch + '.zip';
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

	const got = crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
	if (got !== want[0]) {
		fs.unlinkSync(zip);
		throw new Error('Checksum sai cho ' + name + ' (đã xoá cache, chạy lại). ' + got + ' != ' + want[0]);
	}

	return zip;
}

// ------------------------------------------------------------------- copy app

function copyDir(from, to) {
	fs.mkdirSync(to, { recursive: true });
	fs.readdirSync(from, { withFileTypes: true }).forEach(function (entry) {
		const src = path.join(from, entry.name);
		const dst = path.join(to, entry.name);
		if (entry.isDirectory()) copyDir(src, dst);
		else fs.copyFileSync(src, dst);
	});
}

/**
 * package.json cho bản đóng gói: chỉ giữ thứ Electron đọc lúc runtime.
 *
 * `productName` quyết định tên thư mục dữ liệu người dùng
 * (`~/Library/Application Support/<productName>`), nên đổi nó là đổi chỗ app
 * đọc/ghi log — giữ nguyên "Lang Detect" cho khớp bản chạy từ nguồn.
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
	const slice = 'darwin-' + arch;

	fs.mkdirSync(path.join(dst, 'zlang'), { recursive: true });
	fs.copyFileSync(path.join(src, 'index.js'), path.join(dst, 'index.js'));

	['index.js', 'index.d.ts', 'package.json'].forEach(function (f) {
		fs.copyFileSync(path.join(src, 'zlang', f), path.join(dst, 'zlang', f));
	});

	const node = path.join(src, 'zlang', slice, 'zlang.' + slice + '.node');
	if (!fs.existsSync(node)) {
		throw new Error(
			'Thiếu ' + path.relative(ROOT, node) + '.\n' +
				'Build lại: node nativelibs/zlang/scripts/build-node.js ' +
				(arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin')
		);
	}
	copyDir(path.join(src, 'zlang', slice), path.join(dst, 'zlang', slice));
}

// ------------------------------------------------------------------ bundle

/**
 * Đổi tên bundle. Ba khoá Info.plist phải đổi cùng lúc với tên file thực thi:
 * CFBundleExecutable là thứ launchd đọc để biết chạy binary nào, sai là app
 * không mở được và Console chỉ báo một dòng rất khó lần.
 *
 * CFBundleIdentifier phải khác `com.github.Electron` của bản gốc, nếu không
 * macOS coi mọi app Electron chưa đổi tên là cùng một app (chung Launch
 * Services, chung quyền, chung TCC prompt).
 */
function renameBundle(app) {
	fs.renameSync(
		path.join(app, 'Contents/MacOS/Electron'),
		path.join(app, 'Contents/MacOS/' + APP_NAME)
	);

	const plist = path.join(app, 'Contents/Info.plist');
	[
		['CFBundleExecutable', APP_NAME],
		['CFBundleName', APP_NAME],
		['CFBundleDisplayName', APP_NAME],
		['CFBundleIdentifier', BUNDLE_ID],
	].forEach(function (pair) {
		run('plutil', ['-replace', pair[0], '-string', pair[1], plist]);
	});
}

/**
 * Ký ad-hoc (`--sign -`) rồi kiểm lại ngay.
 *
 * `--deep` bị Apple khuyên tránh cho bản phát hành thật (nên ký từ trong ra
 * ngoài), nhưng với bản chạy thử ad-hoc thì nó đúng việc: ký một lượt cả
 * Electron Framework, 4 helper app, chrome_crashpad_handler và cả file .node
 * mình vừa thả vào.
 *
 * Kiểm lại là bắt buộc chứ không thừa: codesign IM LẶNG khi ký hụt một binary
 * lồng bên trong, và lỗi chỉ lộ ra trên máy người nhận dưới dạng app bật lên
 * rồi tắt ngay.
 */
function signBundle(app) {
	console.log('[pack] ký ad-hoc');
	run('codesign', ['--force', '--deep', '--sign', '-', app]);
	runQuiet('codesign', ['--verify', '--deep', '--strict', app]);
}

function pack(version, arch) {
	const staging = path.join(OUT, 'darwin-' + arch);
	const app = path.join(staging, APP_NAME + '.app');
	const zip = fetchElectronZip(version, arch);
	const extract = path.join(CACHE, 'extract-darwin-' + arch);

	fs.rmSync(staging, { recursive: true, force: true });
	fs.rmSync(extract, { recursive: true, force: true });
	fs.mkdirSync(staging, { recursive: true });

	/*
	 * `ditto -x -k` chứ không phải `tar -xf`: bundle .app chứa 14 symlink trong
	 * Frameworks/ (Versions/Current -> A). ditto là công cụ Apple làm riêng cho
	 * việc này và giữ nguyên cả symlink lẫn quyền thực thi.
	 *
	 * Giải nén ra thư mục tạm rồi mới move Electron.app sang: zip còn có LICENSE
	 * và version ở gốc, để lẫn vào ảnh đĩa thì cửa sổ cài đặt lộn xộn.
	 */
	console.log('[pack] giải nén -> ' + path.relative(ROOT, staging));
	fs.mkdirSync(extract, { recursive: true });
	run('ditto', ['-x', '-k', zip, extract]);
	fs.renameSync(path.join(extract, 'Electron.app'), app);
	fs.rmSync(extract, { recursive: true, force: true });

	// default_app.asar là app demo của Electron; có app thật rồi thì bỏ đi.
	fs.rmSync(path.join(app, 'Contents/Resources/default_app.asar'), { force: true });

	const appDir = path.join(app, 'Contents/Resources/app');
	fs.mkdirSync(appDir, { recursive: true });

	if (!fs.existsSync(path.join(ROOT, 'dist', 'main', 'main.js'))) {
		throw new Error('Chưa có dist/. Chạy `npm run build` trước.');
	}
	copyDir(path.join(ROOT, 'dist'), path.join(appDir, 'dist'));
	copyNativelibs(appDir, arch);
	writeAppManifest(appDir);

	renameBundle(app);

	// Ký SAU CÙNG: mọi thay đổi trong bundle sau bước này đều làm hỏng chữ ký.
	signBundle(app);

	// Kéo-thả để cài. Symlink chứ không phải thư mục thật — hdiutil giữ nguyên nó.
	fs.symlinkSync('/Applications', path.join(staging, 'Applications'));

	console.log('[pack] xong: ' + path.relative(ROOT, app));
	return staging;
}

// --------------------------------------------------------------------- dmg

/**
 * UDZO = ảnh đĩa nén read-only, định dạng mặc định của mọi bản .dmg phát hành.
 * `-fs HFS+` chứ không để APFS mặc định: ảnh APFS không mở được trên macOS cũ
 * hơn 10.13, mà bản chạy thử thì không có lý do gì tự cắt bớt máy mở được.
 */
function makeDmg(staging, arch) {
	const name = APP_NAME + '-mac-' + arch + '.dmg';
	const dmg = path.join(OUT, name);

	fs.rmSync(dmg, { force: true });
	console.log('[pack] tạo ' + name);

	run('hdiutil', [
		'create',
		'-volname', APP_NAME,
		'-srcfolder', staging,
		'-fs', 'HFS+',
		'-format', 'UDZO',
		'-ov',
		'-quiet',
		dmg,
	]);

	const mb = Math.round(fs.statSync(dmg).size / 1024 / 1024);
	console.log('[pack] ' + path.relative(ROOT, dmg) + ' (' + mb + 'MB)');
	return dmg;
}

// ------------------------------------------------------------------------ run

function main() {
	if (process.platform !== 'darwin') {
		throw new Error(
			'Script này chỉ chạy trên macOS (' + process.platform + ' không có codesign/hdiutil/ditto).'
		);
	}

	const version = electronVersion();
	const archs = parseArchs();
	const wantDmg = process.argv.indexOf('--no-dmg') === -1;

	requireTools(['curl', 'ditto', 'codesign', 'hdiutil', 'plutil']);

	console.log('[pack] Electron v' + version + ' — ' + archs.join(', '));
	archs.forEach(function (arch) {
		const staging = pack(version, arch);
		if (wantDmg) makeDmg(staging, arch);
	});

	console.log('');
	console.log('  arm64 = Apple Silicon (M1 trở lên) · x64 = Mac Intel.');
	console.log('  Gửi đúng file cho đúng máy; mở nhầm bản kia thì app không chạy.');
	console.log('');
	console.log('  Bản này ký AD-HOC, không notarize. Người nhận mở lần đầu sẽ bị chặn:');
	console.log('    1. Kéo LangDetect.app vào Applications');
	console.log('    2. Mở một lần -> macOS báo chặn -> bấm Done');
	console.log('    3. System Settings -> Privacy & Security -> "Open Anyway"');
	console.log('    4. Mở lại -> Open');
	console.log('');
	console.log('  Chuột phải -> Open KHÔNG còn ăn với app ad-hoc từ macOS 15 trở đi.');
	console.log('');
}

try {
	main();
} catch (err) {
	console.error('\n' + (err && err.message ? err.message : err) + '\n');
	process.exit(1);
}
