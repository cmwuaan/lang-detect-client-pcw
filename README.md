# Lang Detect

Nhận diện ngôn ngữ chạy được trên **web, macOS và Windows** từ một codebase, một
renderer bundle. Repo này là lab để chốt kiến trúc trước khi đưa module native
sang `zalo-pc-app`.

```bash
nvm use              # Node 14 theo .nvmrc
npm install
npm run dev          # bản web — http://localhost:5173
npm run dev:pc       # bản desktop — Electron + dev server
```

---

# Yêu cầu môi trường

Chia làm hai mức, vì phần lớn người dùng repo chỉ cần mức A:

- **Mức A — chỉ chạy app.** Không cần Rust, không cần Xcode/Visual Studio. Trên
  macOS, `.node` đã build sẵn và commit trong repo.
- **Mức B — build lại native module** (`nativelibs/zlang`).

## Chung cho cả hai nền tảng

| Thành phần            | Bản yêu cầu                      | Đã kiểm chứng | Mức |
| --------------------- | -------------------------------- | ------------- | --- |
| Node.js               | **14** (`.nvmrc`, `engines`)     | 14.21.3       | A   |
| npm                   | 6 (đi kèm Node 14)               | 6.14.18       | A   |
| Rust (rustup + cargo) | ghim trong `rust-toolchain.toml` | 1.77.2        | B   |

Node 14 là để khớp `zalo-pc-app` — app đó build bằng Node 14. Toolchain còn lại
cũng ghim theo app: Electron 22.3.9, TypeScript 3.9.6, React 16.14.0, sass
1.71.1. **Đừng nâng cấp.**

**Trên Apple Silicon, Node 14 chạy qua Rosetta** (`process.arch === 'x64'`), nên
`node_modules` phải là bản x86_64 (`@esbuild/darwin-x64`). Binary Electron thì
lại là arm64 — vì vậy hai slice `.node` phục vụ hai runtime khác nhau và **phải
giữ cả hai**:

| Chạy bằng                  | `process.arch` | Nạp slice      |
| -------------------------- | -------------- | -------------- |
| `node` 14 (script build)   | `x64`          | `darwin-x64`   |
| Electron 22.3.9 (app thật) | `arm64`        | `darwin-arm64` |

## macOS

| Thành phần               | Cách cài                                                     | Mức |
| ------------------------ | ------------------------------------------------------------ | --- |
| Xcode Command Line Tools | `xcode-select --install`                                     | B   |
| Rust target              | `rustup target add aarch64-apple-darwin x86_64-apple-darwin` | B   |
| macOS lúc **chạy**       | arm64: ≥ 11.0 · x64: ≥ 10.15                                 | A   |

## Windows

| Thành phần                              | Cách cài                                                        | Mức |
| --------------------------------------- | --------------------------------------------------------------- | --- |
| Visual Studio Build Tools + Windows SDK | workload "Desktop development with C++"                         | B   |
| Rust target                             | `rustup target add i686-pc-windows-msvc x86_64-pc-windows-msvc` | B   |
| Windows lúc **chạy**                    | ≥ 7 (ELS có từ Windows 7)                                       | A   |

`.node` cho Windows **chưa được build lần nào** (máy phát triển là macOS). App
vẫn chạy ở mức A — native báo `native-binding-missing` và UI hiện "không khả
dụng".

---

# Setup

```bash
nvm use                # đọc .nvmrc -> Node 14
npm install
npm run typecheck      # phải exit 0
npm run build          # phải in "build xong -> dist/"
```

Kiểm tra native module còn sống không mà không cần mở app:

```bash
node -e "const z=require('./nativelibs').zlang(); console.log(z.info(), z.availability())"
```

Đạt khi `loadError: null` và `{ supported: true }`.

---

# Chạy

## Bản web

```bash
npm run dev
```

Mở http://localhost:5173, tự reload khi sửa code. Cổng mặc định **5173** (không
dùng 3000 vì renderer của `zalo-pc-app` chiếm cổng đó); bận thì script tự thử
5174…5193. Chỉ định cổng: `PORT=6000 npm run dev` — cổng này bận thì báo lỗi chứ
không tự đổi.

## Bản desktop

```bash
npm run dev:pc
```

Dev server + Electron, DevTools bật sẵn. Phương pháp nhận diện do nền tảng quyết
định, người dùng không chọn: desktop dùng native của OS, web dùng hạ tầng trình
duyệt.

## Production build

```bash
npm run build       # -> dist/ (renderer + main + preload, đã minify)
npx electron .      # chạy bản đã build
npm start           # = build rồi chạy
npm run clean       # xoá dist/
```

## Đóng gói bản Windows để chạy thử

```bash
npm run pack:win                        # cả ia32 lẫn x64
node scripts/pack-win.js --arch=ia32    # chỉ 32-bit
```

Kết quả: `pc-dist/LangDetect-win32-<arch>.zip` — chép sang máy/VM Windows, giải
nén, chạy `LangDetect.exe`. Đây là bản chạy thử, không phải installer. **Phải
thử trên Windows thật**: zlang gọi Extended Linguistic Services của OS nên chạy
qua Wine không nói lên điều gì.

## Build lại native module (mức B)

```bash
# macOS
npm run zlang                                                      # slice của runtime hiện tại
node nativelibs/zlang/scripts/build-node.js aarch64-apple-darwin
node nativelibs/zlang/scripts/build-node.js x86_64-apple-darwin

# Windows
node nativelibs\zlang\scripts\build-node.js i686-pc-windows-msvc
node nativelibs\zlang\scripts\build-node.js x86_64-pc-windows-msvc
npm run zlang:types
```

Toolchain, ràng buộc Windows 7 và cửa chặn build:
[`nativelibs/zlang/BUILD.md`](nativelibs/zlang/BUILD.md). Module native trả về
cái gì: [`nativelibs/zlang/README.md`](nativelibs/zlang/README.md).

## Build lại detector cho bản web

```bash
npm run zdetect        # -> weblibs/zdetect/dist/
npm run zdetect:test   # smoke test
```

Bản **web** dùng [`weblibs/zdetect`](weblibs/zdetect/README.md) — detector thuần
JS của repo, không phải Web API của trình duyệt. App import **bản đã build ở
`dist/`**, nên sửa source mà quên `npm run zdetect` thì app vẫn chạy bản cũ.

---

# Bảng lệnh

| Lệnh                    | Việc                                           |
| ----------------------- | ---------------------------------------------- |
| `npm run dev`           | Dev server bản web, watch                      |
| `npm run dev:pc`        | Dev server + Electron, watch                   |
| `npm run build`         | Production build vào `dist/`                   |
| `npm run build:only`    | Build production, không xoá `dist/` trước      |
| `npm start`             | `build` rồi chạy Electron                      |
| `npm run clean`         | Xoá `dist/`                                    |
| `npm run typecheck`     | `tsc --noEmit`                                 |
| `npm run pack:win`      | Đóng gói bản Windows chạy thử vào `pc-dist/`   |
| `npm run pack:win:only` | Như trên, không build lại trước                |
| `npm run zlang`         | Build `.node` cho runtime hiện tại + facade TS |
| `npm run zlang:node`    | Chỉ build `.node`                              |
| `npm run zlang:types`   | Chỉ build `index.js` + `index.d.ts`            |
| `npm run zdetect`       | Build bundle detector cho bản web (`weblibs/zdetect`) |
| `npm run zdetect:test`  | Smoke test của zdetect (có assert)             |
| `npm run zdetect:train` | Train lại profile n-gram từ corpus             |
