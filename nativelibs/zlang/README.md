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
darwin-arm64/zlang.darwin-arm64.node    napi (src/lib.rs) — AsyncTask, off main thread
   │
   ▼
src/zlang_bridge.h                      MỘT ABI phẳng cho mọi OS
   ├── src/bridge_darwin.swift          NLLanguageRecognizer, @_cdecl
   └── src/bridge_windows.c             MappingRecognizeText (ELS)
```

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

Yêu cầu: Rust stable, Node 18+. macOS cần Xcode Command Line Tools (dùng
`swiftc`); Windows cần Visual Studio Build Tools kèm Windows SDK.

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
