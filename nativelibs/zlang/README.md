# zlang

Nhận diện ngôn ngữ bằng model có sẵn trong hệ điều hành, một hợp đồng JavaScript
duy nhất cho hai nền tảng:

- **macOS** — Apple NaturalLanguage (`NLLanguageRecognizer`) qua napi binding
  in-process. Trả về **xác suất thật** của model.
- **Windows** — Extended Linguistic Services, service
  [Microsoft Language Detection](https://learn.microsoft.com/en-us/windows/win32/intl/microsoft-language-detection)
  (`ELS_GUID_LANGUAGE_DETECTION`), cũng in-process. ELS chỉ trả về **thứ hạng**,
  không có xác suất — xem phần "Ý nghĩa của confidence".

Không tải model, không cần mạng, không asset đi kèm bản build, không tiến trình
phụ: mọi thứ nằm trong `.node` và trong OS.

## Trạng thái

| Phần | Trạng thái |
|---|---|
| Facade TypeScript, napi binding, bridge macOS (Swift) | Đã build và test trên macOS 26.5 (arm64), Node 22 và Electron 22 |
| `darwin-arm64` (minos 11.0), `darwin-x64` (minos 10.15) | Đã build, đã commit |
| Bridge Windows (`src/bridge_windows.c`) | **Đã viết, CHƯA build** — máy phát triển hiện tại là macOS |
| `win32-ia32`, `win32-x64` | Chưa có `.node` — cần build trên Windows |

Bridge Windows viết theo `<elscore.h>` / `<elssrvc.h>` của Windows SDK: layout
struct do SDK cung cấp nên không có rủi ro sai layout, nhưng tên field và tên
hàm cần một lần build thật trên Windows để chốt. Khi chưa có `.node`,
`availability()` trả `{ supported: false, reason: 'native-binding-missing' }` và
app vẫn chạy bình thường.

## Kiến trúc

```
index.ts ──► index.js + index.d.ts      facade: chọn prebuilt, dịch dữ liệu, gate
   │
   ▼
darwin-arm64/zlang.darwin-arm64.node    lớp keo napi — chạy off main thread
   │                                    HAI bản dựng ra cùng file này:
   │                                      src/lib.rs + src/backend.rs   (Rust)
   │                                      src-cpp/addon.cc              (C++)
   ▼
src/zlang_bridge.h                      MỘT ABI phẳng cho mọi OS
   ├── src/bridge_darwin.swift          NLLanguageRecognizer, @_cdecl
   └── src/bridge_windows.c             MappingRecognizeText (ELS)
```

Hai bản triển khai lớp keo tồn tại song song và **dùng chung** bridge cùng ABI ở
`src/` — logic nhận diện không nhân bản. Xem §Build về cách chuyển qua lại, và
`src-cpp/addon.cc` về lý do bản C++ tồn tại.

Ba quyết định đáng giải thích:

1. **Bridge riêng cho mỗi OS, không gọi API của OS trực tiếp từ Rust.** Struct
   của ELS và class của Apple đều phải khớp tuyệt đối với header của SDK; tự
   khai báo lại trong Rust là mời UB âm thầm vào. Bridge dùng header thật
   (Swift qua `-import-objc-header`, C qua `#include`), Rust chỉ thấy 3 hàm C do
   mình định nghĩa.
2. **Không cấp phát động qua biên FFI.** Caller đưa sẵn mảng `ZlangHypothesis`,
   bridge ghi vào và trả về số phần tử. Không có quy ước "ai gọi free" nào để
   làm sai.
3. **Native trả `{ tag, confidence }`, facade mới đặt tên công khai
   `{ detectedLanguage, confidence }`.** Tên field một từ ở tầng napi nên không
   phụ thuộc quy tắc đổi snake_case sang camelCase của napi-rs; và hình dạng cho
   UI đổi được mà không phải build lại native.

`NLLanguageRecognizer` không thread-safe, nên bridge tạo một instance cho mỗi
lời gọi. Việc này rẻ (model nằm trong OS, không nạp lại) và cho phép napi chạy
`detect()` trên libuv threadpool mà không cần lock — main process không bị chặn.

## API

```js
const zlang = require('nativelibs').zlang();

zlang.availability();
// { supported: true }
// { supported: false, reason: 'unsupported-platform' | 'native-binding-missing' | 'os-service-unavailable' }

zlang.info();
// { backend: 'apple-nl', scoreKind: 'probability', version: '0.1.0', slice: 'darwin-arm64', loadError: null }

await zlang.detect('Xin chào, hôm nay trời đẹp quá.', { maxResults: 3 });
// [ { detectedLanguage: 'vi', confidence: 1 }, … ]  — giảm dần theo confidence
```

`detect()` trả **mảng rỗng** khi văn bản quá ngắn hoặc không kết luận được — đó
là kết quả hợp lệ, không phải lỗi. Chỉ reject khi backend không dùng được hoặc
native báo lỗi thật. `maxResults` bị chặn trong 1..16.

### Ý nghĩa của confidence

`info().scoreKind` cho biết con số nghĩa là gì, **hãy đọc nó trước khi so sánh**:

- `'probability'` (macOS) — xác suất của model, các giả thuyết cộng lại ≈ 1.
- `'rank'` (Windows) — ELS chỉ cho thứ tự. Bridge suy ra confidence bằng nghịch
  đảo hạng đã chuẩn hoá (`1/(i+1)` chia tổng): giữ đúng thứ tự, tổng bằng 1,
  không bịa ra độ chắc chắn của model. Đừng so trực tiếp số của hai nền tảng.

## Build

Yêu cầu: Node 18+. macOS cần Xcode Command Line Tools (dùng `swiftc`); Windows
cần Visual Studio Build Tools kèm Windows SDK. Bản Rust cần rustup — phiên bản
đã ghim trong `rust-toolchain.toml`, **đừng nâng** (xem §Hai bản triển khai).
Bản C++ cần thêm Python 3 cho node-gyp.

`build.rs` gọi `swiftc -emit-library -static` để ra một static archive rồi link
vào `.node`. **Swift build TĨNH chứ không ra dylib như zocr**: zocr phải xuất
`libzocr_vision.dylib` vì ZaloCapture (native, ngoài Node) dùng chung nó, còn
zlang không có consumer nào khác — link tĩnh thì chỉ phải ship đúng một file
`.node`, không rpath, không `install_name`, không phải ký binary thứ hai.

Swift runtime vẫn link động vào `/usr/lib/swift` của hệ điều hành (Swift
ABI-stable và nằm trong OS từ macOS 10.14.4), nên không đóng gói runtime theo
app. `otool -L` trên `.node` chỉ thấy thư viện của OS, không có dylib lạ nào.
zocr cũng phụ thuộc `/usr/lib/swift` y như vậy, nên đây không phải ràng buộc mới
cho bản build của app.

Chạy từ repo root (dùng chung toolchain của repo, không cần `npm install` riêng
cho package này):

```bash
npm run zlang          # build .node cho máy hiện tại + phát index.js/index.d.ts
npm run zlang:node     # chỉ .node
npm run zlang:types    # chỉ facade TypeScript
npm run zlang:smoke    # test nhanh qua facade
```

Hoặc chạy trong `nativelibs/zlang` (khi đã copy sang repo nativelibs thật, nơi
package có devDependencies riêng):

```bash
npm run build:node:darwin-arm64
npm run build:node:darwin-x64
npm run build:node:win32-ia32     # trên Windows
npm run build:node:win32-x64      # trên Windows
npm run build:types
npm test
```

`scripts/build-node.js` gọi `cargo build --release --target <triple>` rồi copy
artifact thành `<platform>-<arch>/zlang.<platform>-<arch>.node`. Không dùng
`@napi-rs/cli`: phần nó làm thêm ở đây chỉ là đổi tên file và sinh
`binding.d.ts`, mà kiểu công khai đã do `index.d.ts` mô tả — nên bỏ được một dev
dependency. Link flag cho napi vẫn do `napi-build` lo trong `build.rs`.

**`.node` và `index.js`/`index.d.ts` được commit**, giống mọi module khác trong
nativelibs: máy build của app không có Rust toolchain.

### Hai bản triển khai: Rust và C++

Lớp keo napi có hai bản, chọn bằng `--impl`. Cả hai dùng chung bridge ở `src/`,
xuất ra **cùng một đường dẫn artifact**, nên `index.ts` không biết và không cần
biết bản nào đang chạy — đổi bản là build lại, không sửa một dòng JS nào.

```bash
npm run build:cpp:win32-ia32      # C++ qua node-gyp
npm run build:node:win32-ia32     # Rust qua cargo (mặc định)
```

Bản nào đang nằm trong thư mục nền tảng thì đọc `build-info.json` cạnh `.node` —
nó ghi cả `impl` lẫn phiên bản toolchain đã dựng.

| | Rust (`src/`) | C++ (`src-cpp/`) |
|---|---|---|
| Công cụ | cargo, rustup | node-gyp, **Python 3** |
| Kích thước `.node` (darwin-arm64) | ~402 KB | ~94 KB |
| Sàn Windows | **đóng băng ở Rust 1.77.2** | khai báo bằng `_WIN32_WINNT` |
| Async | `AsyncTask` của napi-rs | `Napi::AsyncWorker` |

**Vì sao có bản C++.** `std` của Rust từ 1.78 import tĩnh `WaitOnAddress`
(Windows 8+) và `ProcessPrng` (Windows 10+), nên binary dựng bằng Rust mới hơn
**không nạp được trên Windows 7** — `LoadLibrary` hỏng, `require()` ném lỗi, và
tầng trên chỉ nói được `native-binding-missing`. Giữ Win7 với Rust nghĩa là
đóng băng ở `rust-toolchain.toml` = 1.77.2 vĩnh viễn, và bức tường MSRV của các
crate phụ thuộc chỉ cao thêm theo thời gian. MSVC không gắn sàn OS vào phiên bản
compiler.

Bản C++ dùng **Node-API** (không phải header của V8), nên ABI ổn định: artifact
build bằng header Node 22 vẫn nạp được trong Electron 22 (Node 16.17, Node-API
8) mà không phải build lại theo từng phiên bản Electron.

`binding.gyp` cần `node-addon-api` (chỉ header) — đã khai ở `devDependencies` của
repo root. gyp không có luật build Swift, nên `scripts/build-cpp.js` gọi `swiftc`
sinh static archive **trước** khi node-gyp link.

#### Phiên bản node-gyp và Visual Studio — đừng nâng bừa

`node-gyp` ghim ở **8.4.1**, `node-addon-api` ở **7.1.1** — **khớp đúng
`mp4thumb`** trong repo nativelibs thật, module node-gyp gần nhất ở đó. Cả hai
chạy được trên **Node 14**, vì `zalo-pc-app` build bằng Node 14 và mọi thứ ở đây
phải dựng được trong cùng môi trường đó.

Đánh đổi phải biết: node-gyp dò Visual Studio qua một bảng ánh xạ **cứng** trong
`lib/find-visualstudio.js`, và bảng đó chỉ có `15 → 2017`, `16 → 2019`,
`17 → 2022`. Hỗ trợ `18` chỉ xuất hiện từ **node-gyp 12**, mà bản 12 đòi Node
`^20.17 || >=22.9`. Vậy:

| node-gyp | Node | Nhận ra VS 18 |
|---|---|---|
| 8.4.1 (đang ghim, khớp mp4thumb) | Node 10.12 trở lên | không |
| 9.4.1 | Node 12.13 trở lên | không |
| 11.4.2 | Node 18.17 trở lên | **không** |
| 12.4.0 | Node 20.17 trở lên | có |

Máy chỉ có Visual Studio 18 sẽ gặp `find VS unknown version "undefined"` — đó
không phải thiếu Visual Studio, mà là node-gyp quá cũ để đọc phiên bản đó.

Điều này **không phải hạn chế** trong thực tế: toolset của VS 18 dù sao cũng
không target được Windows 7, nên vẫn phải cài VS 2019 (hoặc VS 2022 kèm component
toolset v141/v142) — và node-gyp 9.4.1 nhận ra chúng bình thường. Chọn toolset
cụ thể bằng `set ZLANG_MSVS_TOOLSET=v141`.

### Cửa chặn Windows 7

Sau mỗi lần build cho Windows, `scripts/win7-guard.js` đọc bảng import PE của
artifact và **cho build thất bại** nếu thấy API chỉ có trên Windows 8/10, hoặc
thấy `VCRUNTIME`/`MSVCP` (nghĩa là CRT chưa link tĩnh và `.node` sẽ đòi bộ VC++
redistributable). Đạt thì chỉ còn `elscore.dll`, `kernel32.dll`, `ntdll.dll`.

Cửa chặn chỉ đọc binary nên chạy được trên bất kỳ `.node`/`.dll` nào, kể cả của
module khác trong nativelibs:

```bash
node scripts/win7-guard.js <đường-dẫn.node> [...]
```

Không có bước này thì "hỗ trợ Windows 7" chỉ là một dòng trong tài liệu chứ
không phải tính chất được bảo đảm — và đó đúng là cách lỗi trên lọt tới máy ảo.

## Test

```bash
npm run zlang:smoke
```

Chạy 8 ngôn ngữ (vi, en, ja, ko, th, ru, fr, zh) qua facade đã build và kiểm tra
văn bản rỗng trả về mảng rỗng.

Số đo trên Apple Silicon, 5 tiến trình riêng biệt (`dlopen` tính cả nạp Swift
runtime):

| | Kết quả |
|---|---|
| `dlopen` `.node` | 0.90–1.07ms (lần chạy đầu sau khi build: 2.98ms — page cache lạnh) |
| `detect()` đầu tiên | 4.42–6.20ms (nạp model của OS) |
| Steady state, 200 lần gọi | **0.711–0.770ms/lần** |

Đo cold start bằng **nhiều tiến trình riêng**, đừng tin một lần chạy: lần chạy
đầu ngay sau khi build từng cho ra 40ms vì page cache lạnh, không phải vì Swift.
