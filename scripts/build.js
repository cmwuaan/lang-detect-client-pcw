'use strict';

const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

const esbuild = require('esbuild');
const sass = require('sass');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const RENDERER_OUT = path.join(DIST, 'renderer');
const MAIN_OUT = path.join(DIST, 'main');

const watch = process.argv.indexOf('--watch') !== -1;
const withElectron = process.argv.indexOf('--electron') !== -1;
const isDev = watch;

const HOST = 'localhost';
/**
 * Mặc định 5173, KHÔNG dùng 3000: cổng đó hay bị dev server khác chiếm
 * (zalo-pc-app chạy renderer ở 3000). Ghi đè bằng biến môi trường PORT.
 */
const DEFAULT_PORT = 5173;
const PORT_FROM_ENV = process.env.PORT ? Number(process.env.PORT) : null;
/** Số cổng thử tiếp theo khi cổng mong muốn đang bận. */
const PORT_SCAN_RANGE = 20;

const alias = { '@shared': path.join(SRC, 'shared') };

// ------------------------------------------------------------------- port

function isPortFree(port) {
	return new Promise(function (resolve) {
		const probe = net.createServer();
		probe.once('error', function () {
			resolve(false);
		});
		probe.once('listening', function () {
			probe.close(function () {
				resolve(true);
			});
		});
		probe.listen(port, '127.0.0.1');
	});
}

/**
 * Cổng phải chốt TRƯỚC khi build, vì `__DEV_SERVER_URL__` được nhúng thẳng vào
 * bundle main process — chọn cổng sau khi build thì Electron sẽ mở nhầm URL.
 */
async function resolvePort() {
	const wanted = PORT_FROM_ENV || DEFAULT_PORT;

	if (await isPortFree(wanted)) return wanted;

	// Người dùng chỉ định cổng cụ thể -> báo lỗi thay vì âm thầm đổi.
	if (PORT_FROM_ENV) {
		throw new Error(
			'Cổng ' +
				wanted +
				' đang bận. Xem ai đang giữ nó:\n' +
				'  lsof -nP -iTCP:' +
				wanted +
				' -sTCP:LISTEN\n' +
				'Rồi dừng tiến trình đó, hoặc chạy cổng khác: PORT=<khác> npm run dev'
		);
	}

	for (let port = wanted + 1; port <= wanted + PORT_SCAN_RANGE; port++) {
		if (await isPortFree(port)) {
			console.log('[dev] cổng ' + wanted + ' đang bận -> dùng ' + port);
			return port;
		}
	}

	throw new Error(
		'Không tìm được cổng trống trong khoảng ' +
			wanted +
			'-' +
			(wanted + PORT_SCAN_RANGE) +
			'. Chạy lại với PORT=<cổng khác>.'
	);
}

// ---------------------------------------------------------------- styles
const STYLES_ENTRY = path.join(SRC, 'renderer/styles/main.scss');

function buildStyles() {
	const result = sass.compile(STYLES_ENTRY, {
		style: isDev ? 'expanded' : 'compressed',
		loadPaths: [path.join(SRC, 'renderer/styles')],
	});
	fs.mkdirSync(RENDERER_OUT, { recursive: true });
	fs.writeFileSync(path.join(RENDERER_OUT, 'styles.css'), result.css);
}

function copyHtml() {
	fs.mkdirSync(RENDERER_OUT, { recursive: true });
	fs.copyFileSync(path.join(SRC, 'renderer/index.html'), path.join(RENDERER_OUT, 'index.html'));
}

// ---------------------------------------------------------------- bundles
const rendererOptions = {
	entryPoints: [path.join(SRC, 'renderer/index.tsx')],
	outfile: path.join(RENDERER_OUT, 'renderer.js'),
	bundle: true,
	format: 'iife',
	// Sàn cho bản web; Electron 44 (Chromium 152) thừa sức chạy. Web API
	// LanguageDetector cần Chromium >= 138 lúc RUNTIME — đây chỉ là mức
	// downlevel cú pháp nên để thấp cho bản web chạy được trên nhiều máy.
	target: ['chrome108'],
	jsx: 'transform',
	alias: alias,
	sourcemap: true,
	minify: !isDev,
	define: { 'process.env.NODE_ENV': JSON.stringify(isDev ? 'development' : 'production') },
	logLevel: 'warning',
};

function electronOptions(name, entry, devServerUrl) {
	return {
		entryPoints: [entry],
		outfile: path.join(MAIN_OUT, name + '.js'),
		bundle: true,
		platform: 'node',
		format: 'cjs',
		// Electron 44 nhúng Node 24.
		target: ['node24'],
		// Electron được resolve lúc runtime, không bundle vào.
		external: ['electron'],
		alias: alias,
		sourcemap: true,
		minify: !isDev,
		define: {
			__DEV__: JSON.stringify(isDev),
			__DEV_SERVER_URL__: JSON.stringify(devServerUrl),
		},
		logLevel: 'warning',
	};
}

// ---------------------------------------------------------------- electron
let child = null;

function launchElectron() {
	if (child) return;
	const electronBin = require('electron');
	child = spawn(electronBin, [ROOT], { stdio: 'inherit' });
	child.on('close', function () {
		child = null;
		process.exit(0);
	});
}

// ---------------------------------------------------------------- run
async function main() {
	// Chốt cổng trước, vì URL của nó được nhúng vào bundle main process.
	const port = isDev ? await resolvePort() : 0;
	const devServerUrl = isDev ? 'http://' + HOST + ':' + port : '';

	const mainOptions = electronOptions('main', path.join(SRC, 'main/main.ts'), devServerUrl);
	const preloadOptions = electronOptions('preload', path.join(SRC, 'main/preload.ts'), devServerUrl);

	buildStyles();
	copyHtml();

	if (!watch) {
		await Promise.all([
			esbuild.build(rendererOptions),
			esbuild.build(mainOptions),
			esbuild.build(preloadOptions),
		]);
		console.log('build xong -> dist/');
		return;
	}

	const contexts = await Promise.all([
		esbuild.context(rendererOptions),
		esbuild.context(mainOptions),
		esbuild.context(preloadOptions),
	]);
	await Promise.all(contexts.map((ctx) => ctx.watch()));

	// Dev server của esbuild: phục vụ dist/renderer và phát sự kiện SSE
	// trên /esbuild để trang tự reload (xem đoạn script trong index.html).
	try {
		await contexts[0].serve({ servedir: RENDERER_OUT, port: port, host: HOST });
	} catch (err) {
		// Có tiến trình khác vừa chiếm cổng trong lúc build.
		throw new Error(
			'Không mở được dev server ở cổng ' +
				port +
				': ' +
				err.message +
				'\nThử lại, hoặc chỉ định cổng khác: PORT=<cổng> npm run dev'
		);
	}

	// sass không nằm trong pipeline esbuild nên watch riêng.
	fs.watch(path.join(SRC, 'renderer/styles'), { recursive: true }, function () {
		try {
			buildStyles();
		} catch (err) {
			console.error('[sass] ' + err.message);
		}
	});

	console.log('');
	console.log('  Lang Detect — dev server');
	console.log('  ' + devServerUrl);
	console.log('');

	if (withElectron) launchElectron();
}

main().catch(function (err) {
	console.error('\n' + (err && err.message ? err.message : err) + '\n');
	process.exit(1);
});
