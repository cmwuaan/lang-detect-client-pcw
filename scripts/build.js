'use strict';

const fs = require('fs');
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
const PORT = 3000;
const DEV_SERVER_URL = 'http://localhost:' + PORT;

const alias = { '@shared': path.join(SRC, 'shared') };

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
  target: ['chrome108'],
  jsx: 'transform',
  alias: alias,
  sourcemap: true,
  minify: !isDev,
  define: { 'process.env.NODE_ENV': JSON.stringify(isDev ? 'development' : 'production') },
  logLevel: 'warning',
};

function electronOptions(name, entry) {
  return {
    entryPoints: [entry],
    outfile: path.join(MAIN_OUT, name + '.js'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: ['node16.17'],
    // Electron được resolve lúc runtime, không bundle vào.
    external: ['electron'],
    alias: alias,
    sourcemap: true,
    minify: !isDev,
    define: {
      __DEV__: JSON.stringify(isDev),
      __DEV_SERVER_URL__: JSON.stringify(isDev ? DEV_SERVER_URL : ''),
    },
    logLevel: 'warning',
  };
}

const MAIN = electronOptions('main', path.join(SRC, 'main/main.ts'));
const PRELOAD = electronOptions('preload', path.join(SRC, 'main/preload.ts'));

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
  buildStyles();
  copyHtml();

  if (!watch) {
    await Promise.all([
      esbuild.build(rendererOptions),
      esbuild.build(MAIN),
      esbuild.build(PRELOAD),
    ]);
    console.log('build xong -> dist/');
    return;
  }

  const contexts = await Promise.all([
    esbuild.context(rendererOptions),
    esbuild.context(MAIN),
    esbuild.context(PRELOAD),
  ]);
  await Promise.all(contexts.map((ctx) => ctx.watch()));

  // Dev server của esbuild: phục vụ dist/renderer và phát sự kiện SSE
  // trên /esbuild để trang tự reload (xem đoạn script trong index.html).
  await contexts[0].serve({ servedir: RENDERER_OUT, port: PORT, host: 'localhost' });

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
  console.log('  ' + DEV_SERVER_URL);
  console.log('');

  if (withElectron) launchElectron();
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
