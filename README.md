# Lang Detect

Nhận diện ngôn ngữ chạy được trên **web, macOS và Windows** từ một codebase, một
renderer bundle. Repo này là lab để chốt kiến trúc trước khi đưa module native
sang `zalo-pc-app`.

```bash
npm install
npm run dev          # bản web  — dev server ở http://localhost:5173
npm run dev:pc       # bản desktop — Electron + dev server
```

Toolchain khớp `zalo-pc-app` một cách có chủ ý: Electron 22.3.9, TypeScript
3.9.6, `@types/node` 17.0.35, React 16.14.0, sass 1.71.1. **Đừng nâng cấp** —
xem [§10](#10-trade-off-đã-chốt).

---

# Yêu cầu môi trường

Chia làm hai mức, vì phần lớn người dùng repo chỉ cần mức A:

- **Mức A — chỉ chạy app.** Không cần Rust, không cần Xcode/Visual Studio. Trên
  macOS, `.node` đã build sẵn và commit trong repo.
- **Mức B — build lại native module** (`nativelibs/zlang`). Cần thêm toolchain
  native của nền tảng tương ứng.

## Chung cho cả hai nền tảng

| Thành phần | Bản yêu cầu | Đã kiểm chứng | Cần cho mức |
|---|---|---|---|
| Node.js | **≥ 22.12** (`engines` trong package.json) | 22.17.0 | A |
| npm | ≥ 8 | 11.9.0 | A |
| Rust (rustup + cargo) | stable | 1.93.0 | B |

> ⚠️ **`.nvmrc` trong repo đang ghi `14`, sai so với `engines: ">=22.12"`.**
> Chạy `nvm use` sẽ nhảy về Node 14 và mọi thứ đứt: esbuild 0.25 không chạy
> được, và một lần `npm install` dưới Node 14 sẽ cài sai binary native (xem
> [Bẫy #1](#bẫy-1--esbuild-sai-kiến-trúc-cpu)). Dùng `nvm use 22` cho tới khi
> `.nvmrc` được sửa.

## macOS

| Thành phần | Cách cài | Đã kiểm chứng | Mức |
|---|---|---|---|
| Xcode Command Line Tools | `xcode-select --install` | Xcode 26.2 | B |
| `swiftc` | đi kèm CLT | Apple Swift 6.2.3 | B |
| Rust target | `rustup target add aarch64-apple-darwin x86_64-apple-darwin` | cả hai | B |
| macOS lúc **chạy** | arm64: **≥ 11.0** · x64: **≥ 10.15** | macOS 26.5 (arm64) | A |

Sàn macOS đến từ `LC_BUILD_VERSION` của `.node`: arm64 là 11.0 (arm64 vốn không
tồn tại trước Big Sur), x64 là 10.15 — khớp `MACOSX_DEPLOYMENT_TARGET` trong
`nativelibs/zlang/.cargo/config.toml`. Swift runtime lấy từ `/usr/lib/swift` của
hệ điều hành, không đóng gói theo app.

## Windows

| Thành phần | Cách cài | Đã kiểm chứng | Mức |
|---|---|---|---|
| Visual Studio Build Tools + Windows SDK | workload "Desktop development with C++" | **chưa** | B |
| Rust target | `rustup target add i686-pc-windows-msvc x86_64-pc-windows-msvc` | **chưa** | B |
| Windows lúc **chạy** | **≥ 7** (ELS có từ Windows 7) | **chưa** | A |

Windows SDK là bắt buộc ở mức B vì `src/bridge_windows.c` `#include <elscore.h>`
và `<elssrvc.h>` — đây chính là lý do chọn bridge C thay vì tự khai báo struct
trong Rust ([§10](#10-trade-off-đã-chốt)).

**Trạng thái thật:** `.node` cho Windows **chưa được build lần nào** (máy phát
triển là macOS). App vẫn chạy bình thường trên Windows ở mức A — provider native
báo `native-binding-missing` và chip hiện "không khả dụng", các phương pháp khác
hoạt động. Muốn native chạy trên Windows thì phải làm mức B ở đó một lần.

---

# Setup

## 1. Node đúng version

```bash
node -v          # phải ≥ 22.12
nvm use 22       # KHÔNG dùng `nvm use` không tham số — .nvmrc đang ghi 14
```

## 2. Cài dependency

```bash
npm install
```

## 3. Kiểm tra ngay sau khi cài

```bash
npm run typecheck     # phải exit 0
npm run zlang:smoke   # macOS: 8/8 ngôn ngữ đúng. Windows: sẽ báo thiếu .node
```

`npm run zlang:smoke` là cách nhanh nhất để biết native module có sống không, mà
không phải mở app.

## Bẫy #1 — esbuild sai kiến trúc CPU

Triệu chứng khi chạy `npm run dev`:

```
You installed esbuild for another platform than the one you're currently using.
Specifically the "@esbuild/darwin-x64" package is present but this platform
needs the "@esbuild/darwin-arm64" package instead.
```

Nguyên nhân: `node_modules` được cài bằng Node/npm chạy dưới **Rosetta** (x86_64)
rồi sau đó dùng Node arm64 — hoặc ngược lại. Rất dễ xảy ra nếu ai đó làm theo
`.nvmrc` (Node 14 không có bản arm64 nên buộc chạy Rosetta).

Cách sửa nhanh, không cần cài lại cả cây dependency:

```bash
# 1. Tải tarball đúng kiến trúc
curl -sSL -o /tmp/esbuild-arm64.tgz \
  https://registry.npmjs.org/@esbuild/darwin-arm64/-/darwin-arm64-0.25.10.tgz

# 2. Đối chiếu integrity với package-lock.json — đừng bỏ bước này
openssl dgst -sha512 -binary /tmp/esbuild-arm64.tgz | openssl base64 -A
grep -A3 '"@esbuild/darwin-arm64"' package-lock.json | grep integrity

# 3. Bung vào node_modules
mkdir -p node_modules/@esbuild/darwin-arm64
tar -xzf /tmp/esbuild-arm64.tgz -C node_modules/@esbuild/darwin-arm64 --strip-components=1
file node_modules/@esbuild/darwin-arm64/bin/esbuild   # phải là Mach-O arm64
```

Đổi `darwin-arm64` thành `darwin-x64` / `win32-x64` / `win32-ia32` cho nền tảng
khác. Cách này dùng được cả cho `electron` nếu binary Electron cũng sai kiến trúc
(`file node_modules/electron/dist/Electron.app/Contents/MacOS/Electron`).

## Bẫy #2 — `npm install` treo rất lâu

Trong môi trường này `npm install` và `npm pack` từng treo **4+ phút không có
output** dù registry vẫn phản hồi bình thường (`curl` tới registry.npmjs.org trả
200 dưới một giây, `cargo` fetch crate bình thường). Nếu gặp: đừng ngồi chờ, dùng
cách tải tarball trực tiếp ở Bẫy #1.

Đây cũng là lý do repo **không** dùng dependency dạng `file:` cho `nativelibs` —
tầng main require theo đường dẫn tương đối, không cần `npm install` tạo symlink
([§6](#6-đặt-code-ở-đâu)).

---

# Chạy

## Bản web

```bash
npm run dev
```

Mở http://localhost:5173. Trang tự reload khi sửa code (esbuild watch + SSE).

Cổng mặc định là **5173**, cố tình không dùng 3000 vì renderer của
`zalo-pc-app` chiếm cổng đó. Nếu 5173 đang bận, script tự thử 5174…5193. Chỉ
định cổng cụ thể:

```bash
PORT=6000 npm run dev      # nếu 6000 bận thì BÁO LỖI, không tự đổi
```

## Bản desktop

```bash
npm run dev:pc
```

Chạy dev server rồi mở Electron, DevTools bật sẵn bên phải. Trên macOS chip
"Model của hệ điều hành" được chọn mặc định và nhận diện được ngay.

Trên Windows, cùng lệnh đó chạy được ở mức A; chip native sẽ hiện "không khả
dụng" cho tới khi build `.node` cho Windows.

## Production build

```bash
npm run build       # -> dist/ (renderer + main + preload, đã minify)
npx electron .      # chạy bản đã build, renderer nạp qua file://
npm start           # = build rồi chạy, một lệnh
npm run clean       # xoá dist/
```

## Build lại native module (mức B)

Trên macOS:

```bash
npm run zlang                        # .node cho máy hiện tại + facade TS
node nativelibs/zlang/scripts/build-node.js x86_64-apple-darwin   # thêm slice Intel
```

Trên Windows:

```bash
rustup target add i686-pc-windows-msvc
node nativelibs\zlang\scripts\build-node.js i686-pc-windows-msvc
node nativelibs\zlang\scripts\build-node.js x86_64-pc-windows-msvc
npm run zlang:types
npm run zlang:smoke
```

Lần build Windows đầu tiên là lúc `src/bridge_windows.c` được biên dịch thật —
tên field/hàm của ELS cần một lần build để chốt. Chi tiết trong
[`nativelibs/zlang/README.md`](nativelibs/zlang/README.md).

## Bảng lệnh đầy đủ

| Lệnh | Việc |
|---|---|
| `npm run dev` | Dev server bản web, watch |
| `npm run dev:pc` | Dev server + Electron, watch |
| `npm run build` | Production build vào `dist/` |
| `npm run build:only` | Build production, không xoá `dist/` trước |
| `npm start` | `build` rồi chạy Electron |
| `npm run clean` | Xoá `dist/` |
| `npm run typecheck` | `tsc --noEmit` (TypeScript 3.9.6) |
| `npm run zlang` | Build `.node` cho máy hiện tại + facade TS |
| `npm run zlang:node` | Chỉ build `.node` |
| `npm run zlang:types` | Chỉ build `index.js` + `index.d.ts` |
| `npm run zlang:smoke` | Test native module qua facade (8 ngôn ngữ) |

---

# Ma trận nền tảng

Ghi đúng những gì đã chạy thật, không suy diễn:

| Hạng mục | macOS | Windows |
|---|---|---|
| `npm run dev` (web) | ✅ đã chạy | ⚠️ chưa chạy — không có lý do kỹ thuật nào để hỏng |
| `npm run dev:pc` (desktop) | ✅ đã chạy | ⚠️ chưa chạy |
| `npm run build` + `electron .` | ✅ đã chạy | ⚠️ chưa chạy |
| `npm run typecheck` | ✅ exit 0 | ⚠️ chưa chạy |
| `.node` đã commit | ✅ `darwin-arm64` + `darwin-x64` | ❌ chưa có |
| Bridge đã từng biên dịch | ✅ Swift, `swiftc` 6.2.3 | ❌ **chưa lần nào** |
| Nhận diện thật trong Electron 22 | ✅ 8/8 ngôn ngữ | ❌ chưa |

Toàn bộ phần "chưa" là vì máy phát triển hiện tại chỉ có macOS, không phải vì
biết trước là hỏng. Phần dùng chung (`scripts/build.js`, esbuild, sass, facade
TS) không có code phụ thuộc nền tảng, và `fs.watch({ recursive: true })` được hỗ
trợ trên cả macOS và Windows.

---

# Xử lý sự cố

| Triệu chứng | Nguyên nhân thường gặp |
|---|---|
| `You installed esbuild for another platform…` | [Bẫy #1](#bẫy-1--esbuild-sai-kiến-trúc-cpu) |
| `Cổng 5173 đang bận` | Còn tiến trình dev cũ: `lsof -nP -iTCP:5173 -sTCP:LISTEN` rồi `kill`, hoặc `PORT=…` |
| Electron mở nhưng **không có cửa sổ nào** | Đã launch Electron lúc esbuild còn đang ghi `dist/main/main.js`. Chờ dev server in xong banner rồi mới mở. Lỗi bị im lặng vì `void app.whenReady().then(...)` trong `src/main/main.ts` không có `.catch` |
| Chip native báo "không khả dụng" trên desktop | Thiếu `.node` cho `${process.platform}-${process.arch}`. Kiểm tra bằng `npm run zlang:smoke`, xem `info().loadError` |
| Kết quả UI đứng ở `…` mãi | Cửa sổ đang bị che → Chromium throttle `setTimeout`, debounce 200ms giãn thành ≥1s. **Mọi benchmark UI phải để cửa sổ ở foreground** |
| `tsc` báo `No inputs were found in config file` | `outDir` trùng `rootDir` nên TS 3.9 tự cho `.` vào `exclude`; phải ghi đè `"exclude": []` |
| Text ngắn cho ra ngôn ngữ vô nghĩa | Đúng như dự kiến — chưa có length gate ([§4](#4-tầng-tránh-việc--nơi-thắng-máy-yếu)). `'ok'` cho ra `pl` 0.29 |

---

# Kiến trúc

Tài liệu này mô tả **một** kiến trúc dùng chung cho cả ba nền tảng, không phải ba
kiến trúc ghép lại. Điểm cốt lõi: phần phụ thuộc nền tảng bị dồn xuống **một
tầng mỏng nhất ở dưới cùng**, còn toàn bộ phần quyết định performance thì giống
nhau ở mọi nơi và chạy trước khi đến tầng đó.

## 1. Xuất phát từ hình dạng workload

Kiến trúc bị quyết định bởi profile của workload, không bởi danh sách nền tảng.
So sánh với `zocr` (OCR, cùng nhà nativelibs) để thấy vì sao **không** nên copy
kiến trúc của nó:

| | zocr (OCR) | zlang (language detect) |
|---|---|---|
| Tần suất gọi | thấp, người dùng chủ động | **rất cao** — mỗi tin nhắn, mỗi lần gõ |
| Payload | ảnh, MB | text, vài trăm byte |
| Compute mỗi lời gọi | 100ms → vài giây | **0.02–2ms** (đo được, §11) |
| Asset đi kèm build | `runtime/` ~41MB, phải ký exe | **0 byte** |
| Tiến trình riêng | có, để crash isolation | không cần |

Hệ quả định hướng mọi thứ phía sau:

> Khi một lời gọi chỉ mất 0.3ms thì **một vòng IPC đã đắt hơn chính việc nhận
> diện**. Trên máy yếu, thứ giết performance không phải thuật toán chậm mà là
> làm việc lẽ ra không cần làm.

Vì vậy tầng kiến trúc quan trọng nhất ở đây không phải tầng native, mà là tầng
**tránh việc** (§4) — và tầng đó không phụ thuộc nền tảng.

## 2. Năm nguyên tắc

1. **Một hợp đồng, nhiều adapter.** Nghiệp vụ hỏi *capability*, không hỏi
   `process.platform`.
2. **Chi phí thật nằm ở đường ống.** Tối ưu số lời gọi và số lần vượt biên
   process, trước khi tối ưu thuật toán.
3. **Suy giảm theo thang, khai báo bằng dữ liệu.** Không nền tảng nào là "đường
   chính", không backend nào là hard dependency.
4. **Không bundle model.** Model do OS hoặc browser cung cấp.
5. **Đúng một chỗ trong codebase được biết platform** — cái factory chọn
   adapter. Thấy `process.platform` ở tầng nghiệp vụ là kiến trúc đã hỏng.

## 3. Sơ đồ tầng

```
                    ┌───────────────────────────────────┐
                    │  UI / nghiệp vụ                   │
                    │  chỉ biết: detect(text) -> results│
                    └───────────────┬───────────────────┘
                                    │
   ══════════════════ GIỐNG NHAU TRÊN CẢ 3 NỀN TẢNG ══════════════════
                                    │
            ┌───────────────────────▼───────────────────────┐
            │ 1. Gate       length < ~15 -> 'und', dừng     │  0 CPU
            │ 2. Truncate   lấy 256–512 ký tự đầu           │  0 CPU
            │ 3. Script     CJK/Hangul/Thai/Cyrillic -> xong│  ~µs, JS thuần
            │ 4. Cache      LRU theo hash + coalesce        │  ~µs
            │ 5. Debounce   250ms, cạnh sau (khi đang gõ)   │
            └───────────────────────┬───────────────────────┘
                                    │ chỉ phần CÒN LẠI đi tiếp
            ┌───────────────────────▼───────────────────────┐
            │ 6. Normalize  BCP-47 canonical, allow-list,   │
            │               'und' cuối mảng, scoreKind      │
            └───────────────────────┬───────────────────────┘
                                    │
   ══════════════════ TỪ ĐÂY MỚI KHÁC NHAU ═══════════════════════════
                                    │
        ┌───────────────┬───────────┴────────┬──────────────────┐
        ▼               ▼                    ▼                  ▼
   Web API         zlang (macOS)       zlang (Windows)     trigram JS
   LanguageDetector Apple NL           ELS Microsoft       (Worker)
   Chromium ≥138    NLLanguageRecognizer Language Detection fallback cuối
```

Tầng 1–5 cắt phần lớn lưu lượng **trước khi** chạm tới bất cứ backend nào. Đó là
lý do cùng một kiến trúc phục vụ được cả máy yếu và cả ba nền tảng: máy yếu
không phải chạy nhiều hơn, chỉ là bậc thang nó rơi xuống có thể thấp hơn.

## 4. Tầng tránh việc — nơi thắng máy yếu

Xếp theo tỉ lệ lợi ích / công sức. Toàn bộ tầng này là **TypeScript thuần, chạy
y nguyên trên web và desktop**, không cần native, không cần async.

| # | Kỹ thuật | Chi phí | Cắt được gì | Chạy ở |
|---|---|---|---|---|
| 1 | **Length gate** — dưới ~15 ký tự trả `und` ngay | 0 | Phần lớn tin nhắn chat ("ok", "ừ", emoji) | renderer |
| 2 | **Truncate** — chỉ 256–512 ký tự đầu | 0 | Chi phí copy qua biên + chi phí model trên text dài | renderer |
| 3 | **Script pre-filter** — đếm Unicode block | ~µs | Mọi text CJK / Hangul / Thai / Cyrillic / Arabic: trả lời không cần model | renderer |
| 4 | **Cache LRU + coalesce in-flight** | ~µs, ~vài chục KB | Re-render lặp, scroll qua lại danh sách hội thoại | renderer |
| 5 | **Debounce trailing-edge 250ms** | 0 | Lời gọi giữa các lần gõ | renderer |
| 6 | **Batch `detectMany()`** | 0 | 50 vòng IPC còn 1, khi render danh sách | tuỳ placement |

Hai điểm đáng nhấn:

- **Length gate không phải tối ưu, mà là đúng đắn.** Đo được: `'ok'` (2 ký tự)
  cho ra `pl` với confidence 0.29 — rác. Gate vừa tiết kiệm CPU vừa tránh hiển
  thị kết quả sai.
- **Script pre-filter là kiến trúc, không phải "một phương pháp khác".**
  `ScriptDetectorProvider` và `HybridDetectorProvider` trong repo đang là stub —
  chúng không phải lựa chọn cạnh tranh với native, chúng là **tầng lọc đứng
  trước native**. Model chỉ thật sự cần cho chữ Latin, nơi vi/en/fr/es/id mới
  ambiguous.

Tỉ lệ cắt thực tế **chưa đo** — cần một corpus chat thật. Đó là việc kế tiếp
đáng làm nhất (§12).

## 5. Adapter và thang suy giảm

| Môi trường | Bậc 1 | Bậc 2 | Bậc 3 |
|---|---|---|---|
| Web, Chrome/Edge ≥138 | Web API `LanguageDetector` | script pre-filter | trigram JS trong Worker |
| Web, browser cũ / Safari | *(không có)* | script pre-filter | trigram JS trong Worker |
| macOS desktop | zlang → Apple NaturalLanguage | script pre-filter | trigram JS |
| Windows desktop | zlang → ELS | script pre-filter | trigram JS |

Ràng buộc đã kiểm chứng: **Electron 22 = Chromium 108**, mà Web API
`LanguageDetector` cần ≥138. Nên trên desktop bậc 1 kiểu web **không bao giờ tồn
tại** — đó là lý do native tồn tại, không phải bug.

Nghiệp vụ đọc capability, không đọc tên nền tảng:

```ts
interface DetectorCapability {
  supported: boolean;
  scoreKind: 'probability' | 'rank';        // KHÔNG threshold chung 2 loại
  costClass: 'native' | 'browser-model' | 'js';
  callSite: 'in-process' | 'ipc' | 'worker'; // quyết định có cần batch không
  maxInputChars: number;
}
```

## 6. Đặt code ở đâu

Chi tiết dễ làm sai nhất, và là khác biệt lớn nhất giữa demo trong repo này và
bản production.

| Nơi chạy | Chi phí mỗi lời gọi | Dùng cho |
|---|---|---|
| Renderer, JS thuần | 0, nhưng **chiếm UI thread** | gate, truncate, script, cache |
| Worker | 0 hop UI, có postMessage | trigram JS trên batch lớn |
| **Preload (Node context)** | **0 — in-process** | native tần suất cao ← đúng cho zlang |
| main qua `ipcMain` | 1 vòng IPC | native tần suất thấp, hoặc cần crash isolation |

Repo này dùng `ipcMain.handle` (`src/main/nativeDetect.ts`) vì cửa sổ bật
`sandbox: true` và muốn một hợp đồng IPC tường minh để đọc. **Bản production nên
đặt ở preload**: `zalo-pc-app` đã làm đúng vậy cho `libjxl` và `zwalker`
(`main/preload/features/*` gọi `require('nativelibs')` trực tiếp, không qua
IPC). Với workload sub-ms tần suất cao, một vòng IPC là phần đắt nhất còn lại.
Xem [docs/zalo-pc-app-integration.md](docs/zalo-pc-app-integration.md).

Chỉ trả giá IPC khi mua được crash isolation thật — tức khi backend có thể chết
(ONNX, model tự bundle). ELS và Apple NL không cần.

## 7. Tính nhất quán giữa các backend

Đây là rủi ro **correctness**, không phải performance, và nó là cái giá phải trả
cho việc dùng model của từng nền tảng (§10). Bắt buộc có tầng normalize:

- **Canonical BCP-47.** Apple trả `zh-Hans`, ELS và Web API trả dạng khác. Phải
  quy về một dạng trước khi tới nghiệp vụ.
- **Allow-list theo sản phẩm.** Chỉ giữ ngôn ngữ sản phẩm thật sự xử lý, còn lại
  map về `und`. Việc này che phần lớn khác biệt giữa các backend.
- **`'und'` luôn là phần tử cuối**, kèm phần dư `1 − Σconfidence` — theo đúng
  hợp đồng Web API, để UI không cần biết backend nào đang chạy
  (`NativeDetectorProvider.withUndetermined`).
- **Không dùng một ngưỡng confidence chung.** Apple cho xác suất (tổng ≈ 1), ELS
  chỉ cho thứ hạng → `zlang` công bố `scoreKind` để tầng trên biết con số nghĩa
  là gì. Hoặc chỉ tin top-1 kèm length gate, hoặc calibrate riêng từng backend.
- **Golden corpus trong CI.** ~200 câu đã gán nhãn, chạy trên cả 3 backend, so
  với nhãn kỳ vọng **và so giữa các backend với nhau**. Đây là thứ duy nhất bắt
  được "Windows trả `und` ở chỗ macOS trả `vi`" trước khi user gặp.

## 8. Ràng buộc máy yếu

`zalo-pc-app` hiện build **Windows ia32 only** (`electron-builder.config.js`:
*"for x64. remove temp for now. ZPC 32bit only"*) → ~2GB address space khả dụng,
fragmentation là vấn đề thật. Bằng chứng trong chính repo đó: `libjxl/index.ts`
phải hardcode giới hạn 2 thread trên win32 vì *"memory peak and crash app"*.

Kéo theo:

- **Không bundle model.** fastText `lid.176` ~126MB, CLD3 kéo theo runtime. Trên
  ia32 đó là rủi ro, chưa nói installer size. Model của OS = 0 byte, 0 RAM.
- **Bound concurrency 1–2, dùng queue chứ đừng dùng thread pool.** Việc sub-ms
  thì hàng đợi rẻ hơn thread. **Đừng copy `acquireThreadLock` của libjxl sang.**
- **Stateless mỗi lời gọi.** Thiết kế hiện tại không giữ gì giữa các lời gọi
  (`NLLanguageRecognizer` tạo/hủy mỗi lần — rẻ vì model nằm trong OS, và tránh
  luôn vấn đề không thread-safe). Nếu sau này cache recognizer thì phải có idle
  TTL, đúng lý do zocr có `sessionIdleTtlMs`.
- **CPU cũ.** Nếu về sau chuyển sang ONNX/SIMD thì phải có scalar fallback +
  runtime dispatch (zocr đã phải làm). Backend của OS thì Microsoft/Apple lo.

## 9. Ngân sách performance và van an toàn

Đặt số cụ thể, đo được, gắn vào CI:

| Tình huống | Ngân sách trên máy yếu |
|---|---|
| 1 tin nhắn | ≤2ms p95 CPU, ≤1 lời gọi backend |
| Đang gõ | ≤1 lần detect / 250ms |
| Danh sách 50 tin | 1 lời gọi batch, ≤20ms, không chiếm UI thread |
| Cache hit rate | ≥60% trong phiên chat thật |
| RAM thêm | ≤2MB (không model, không buffer lớn) |
| Kích thước thêm vào installer | ~400KB / slice `.node` |

Observability: p50/p95 theo backend, call rate, cache hit rate, phân bố
`unavailableReason`. Kèm **kill switch qua remote config theo từng
platform/cohort** — nếu ELS chậm bất thường trên một bản Windows nào đó, chuyển
cohort đó xuống bậc JS fallback mà không cần ship build mới.

## 10. Trade-off đã chốt

| Quyết định | Đã chọn | Phương án khác | Trả giá | Mua được |
|---|---|---|---|---|
| Nguồn model | **Model của OS / browser** | Bundle fastText / CLD3 | Kết quả khác nhau giữa nền tảng → phải có tầng normalize (§7); không kiểm soát được model | 0 byte installer, 0 RAM thêm, không cần tải, chạy được trên ia32, không phải bảo trì model |
| Nơi gọi native | **In-process (preload)** | Host process riêng như zocr | Không có crash isolation | Bỏ hẳn một vòng IPC — phần đắt nhất của workload sub-ms |
| Cách nói chuyện với API của OS | **1 ABI C phẳng + 1 bridge cho mỗi OS** (`src/zlang_bridge.h`) | Khai báo struct của ELS / gọi objc2 trực tiếp trong Rust | Thêm một file bridge cho mỗi OS | Header của SDK là nguồn sự thật → không có rủi ro sai layout struct (UB âm thầm); thêm backend không phải sửa tầng Rust hay JS |
| Ngôn ngữ bridge macOS | **Swift** (`@_cdecl`) | Objective-C | `build.rs` phải gọi `swiftc` và link Swift runtime; ghi vào `char tag[24]` phải qua `withUnsafeMutablePointer` vì C array import thành tuple | Cùng ngôn ngữ với bridge Vision của zocr → team bảo trì một loại; API NaturalLanguage native (`[NLLanguage: Double]`). **Không tốn performance**: dlopen ~1ms, steady 0.72ms/lần. **Không đặt sàn macOS mới** — zocr đã phụ thuộc `/usr/lib/swift` sẵn |
| Cách link Swift | **Static archive vào `.node`** | dylib riêng như `libzocr_vision.dylib` của zocr | Không dùng lại được bridge từ code native ngoài Node | Chỉ ship một file `.node`: không rpath, không `install_name`, không ký binary thứ hai, electron-builder không cần thêm entry |
| Cấp phát qua biên FFI | **Caller cấp mảng cố định, bridge ghi vào** | Bridge `malloc` rồi trả con trỏ | Trần cứng 16 kết quả | Không có quy ước "ai gọi free" nào để làm sai; không `free()` nào chạy qua biên |
| Phân phối binary | **Commit `.node` sẵn** | Build trên CI của app | Repo nặng thêm ~400KB/slice; phải build lại tay khi đổi Rust | Máy build của app không cần Rust toolchain — điều kiện bắt buộc của nativelibs |
| Tooling native | **`cargo` + script rename 30 dòng** | `@napi-rs/cli` | Tự lo phần đổi tên artifact | Bớt một dev dependency và một chuỗi cung ứng; phần còn lại `napi-build` vẫn lo |
| Hợp đồng public | **Hình dạng Web API `LanguageDetector`** | Contract riêng kiểu zocr | Mang khái niệm của browser (`inputQuota`, transient activation) vào chỗ không cần | UI không phải biết backend nào; adapter dùng Web API thật cắm vào **không cần lớp dịch** |
| Tên field ở tầng napi | **`{ tag, confidence }` một từ**, facade mới đổi thành `detectedLanguage` | Đặt tên public ngay trong Rust | Một bước map trong JS (≤3 phần tử, không đáng kể) | Không phụ thuộc quy tắc snake_case→camelCase của napi-rs; đổi hình dạng public không phải build lại native |
| Async | **napi `AsyncTask`** (libuv threadpool) | Gọi sync (chỉ 0.3ms mà) | Một lần schedule | Main process không bao giờ bị chặn, kể cả khi text dài hoặc OS chậm bất thường |
| Nơi đặt tầng tránh việc | **Renderer, JS thuần** | Đẩy hết xuống native | Logic nằm ở tầng cao, phải test riêng | Chạy y nguyên trên web; cắt lưu lượng **trước** khi vượt biên process — nơi chi phí thật nằm |
| Confidence trên Windows | **Suy từ thứ hạng, công bố `scoreKind: 'rank'`** | Bịa ra một thang xác suất cho khớp macOS | Tầng trên phải đọc `scoreKind` | Không giả vờ có độ chắc chắn mà ELS không cung cấp |
| Version dependency | **Ghim khớp `zalo-pc-app`** | Dùng bản mới nhất | TypeScript 3.9.6, Electron 22, Chromium 108 — không có Web API trên desktop | Native module và TS build ở đây drop sang app **không cần sửa gì**; demo mới chứng minh được điều gì đó về app thật |

## 11. Số đo thực tế

Đo trên macOS 26.5, Apple Silicon (arm64). Xem `npm run zlang:smoke`.

| Hạng mục | Kết quả |
|---|---|
| `dlopen` `.node` (kể cả nạp Swift runtime) | 0.90–1.07ms |
| Lời gọi đầu tiên (nạp model của OS) | 4.42–6.20ms |
| Steady state (200 lần gọi) | **0.711–0.770ms/lần** |
| Các lời gọi sau, theo ngôn ngữ | 0.02–2.1ms (ko 0.02 · th 0.02 · zh 0.75 · fr 1.07 · en 1.10 · ru 2.12 · ja 3.45) |
| Độ chính xác smoke (vi/en/ja/ko/th/ru/fr/zh) | 8/8 |
| Text rỗng | `[]` — không phải lỗi |
| Text 2 ký tự (`'ok'`) | `pl` 0.29 → **rác, cần length gate** |
| Kích thước `.node` | 386KB (arm64), 383KB (x64) |
| Sàn macOS | arm64 `minos 11.0` (arm64 vốn không có trước Big Sur), x64 `minos 10.15` |
| Phụ thuộc dylib ngoài OS | **không có** — `otool -L` chỉ thấy `/usr/lib`, `/System`, `/usr/lib/swift` |
| Trong Electron 22.3.9 / Node 16.17.1 | nạp và detect bình thường (napi ABI ổn định) |
| `nativelibs` trong renderer bundle | 0 tham chiếu |
| `tsc --noEmit` với TypeScript 3.9.6 | exit 0 |

## 12. Trạng thái và việc kế tiếp

| Phần | Trạng thái |
|---|---|
| Hợp đồng + provider registry + adapter Web API | Đã có sẵn trong repo |
| `zlang` native: facade, napi, bridge macOS | **Xong**, đã test trên Node 22 và Electron 22 |
| `zlang` slice `darwin-arm64`, `darwin-x64` | **Xong**, đã commit |
| `zlang` bridge Windows (`src/bridge_windows.c`) | **Đã viết, CHƯA biên dịch** — máy phát triển là macOS. Layout struct lấy từ `<elscore.h>` nên không có rủi ro layout, nhưng tên field/hàm cần một lần build trên Windows |
| Tầng tránh việc (gate, truncate, script, cache) | **Chưa làm** — `ScriptDetectorProvider` / `HybridDetectorProvider` còn là stub |
| Normalize BCP-47 + allow-list | Chưa làm |
| Golden corpus trong CI | Chưa làm |
| Đo tỉ lệ cắt trên corpus chat thật | Chưa làm |

Thứ tự nên làm tiếp, theo lợi ích trên máy yếu:

1. Length gate + truncate + script pre-filter + cache/coalesce (§4) — chạy giống
   nhau cả 3 nền tảng, không cần native.
2. Đo tỉ lệ cắt trên corpus chat thật → xác nhận giả thiết ở §4.
3. Normalize BCP-47 + allow-list (§7).
4. Build và test bridge Windows.
5. Golden corpus + ngân sách performance vào CI (§9).

## 13. Anti-pattern

- Bundle model 100MB+ để "đồng nhất mọi nền tảng" — trả bằng installer size và
  RAM trên ia32, mua được thứ mà tầng normalize giải quyết rẻ hơn nhiều.
- Detect mỗi keystroke, không debounce, không gate.
- `process.platform` rải khắp tầng nghiệp vụ → không test được, không thêm nền
  tảng được.
- Một ngưỡng confidence dùng chung cho mọi backend.
- Ép native đi qua IPC khi nó chạy in-process ở preload được.
- Bundle fallback JS vào bundle web dù chưa chắc cần → phải lazy import.
- Copy thread pool của `libjxl` sang cho một workload sub-ms.

## 14. Bản đồ file

```
src/shared/ipc.ts                          hợp đồng IPC + kiểu dùng chung
src/main/main.ts                           bootstrap Electron, đăng ký handler
src/main/nativeDetect.ts                   cầu nối main <-> nativelibs/zlang
src/main/preload.ts                        contextBridge
src/renderer/services/
  detection/LanguageDetector.ts            HỢP ĐỒNG — hình dạng Web API
  detection/providers/
    BrowserDetectorProvider.ts             adapter Web API (web, Chromium ≥138)
    NativeDetectorProvider.ts              adapter zlang qua IPC (desktop)
    ScriptDetectorProvider.ts              STUB — sẽ thành tầng script pre-filter
    TrigramDetectorProvider.ts             STUB — fallback cuối
    HybridDetectorProvider.ts              STUB — sẽ thành orchestrator các tầng
  container.ts                             DUY NHẤT một chỗ biết platform
nativelibs/
  index.js                                 aggregator, đúng hợp đồng nativelibs thật
  zlang/
    src/zlang_bridge.h                     MỘT ABI phẳng, dùng chung 2 nền tảng
    src/bridge_darwin.swift                Apple NaturalLanguage, @_cdecl, link tĩnh
    src/bridge_windows.c                   ELS Microsoft Language Detection
    src/lib.rs                             bề mặt napi (AsyncTask)
    src/backend.rs                          toàn bộ `unsafe` của crate nằm ở đây
    index.ts                               facade — xem zlang/README.md
docs/zalo-pc-app-integration.md            đường đi sang zalo-pc-app
```
