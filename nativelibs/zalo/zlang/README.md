# zlang

Nhận diện ngôn ngữ bằng **model có sẵn trong hệ điều hành**, gói lại thành một
hợp đồng JavaScript duy nhất cho cả macOS và Windows.

- **macOS**: Apple NaturalLanguage (`NLLanguageRecognizer`) qua bridge Swift
  link tĩnh vào `.node`.
- **Windows**: Extended Linguistic Services, dịch vụ "Microsoft Language
  Detection", qua bridge C.

Không tải model, không cần mạng, không asset đi kèm bản build, không tiến trình
phụ — mọi thứ nằm trong một file `.node` và trong OS.

Module này **chỉ làm interface + mapping**. Không có thuật toán, rule, bảng tra
hay regex nào ở đây: mọi kết luận về ngôn ngữ đều do OS đưa ra, và cái gì OS
không cung cấp thì trả `null` chứ không tự suy ra.

## Khác biệt quan trọng nhất giữa hai nền tảng

|  | macOS | Windows |
|---|---|---|
| API của OS | `NLLanguageRecognizer` | `MappingRecognizeText` + `ELS_GUID_LANGUAGE_DETECTION` |
| Có sẵn từ | macOS 10.14 | Windows 7 |
| OS trả về | danh sách **kèm xác suất thật** của model | danh sách **đã xếp hạng, KHÔNG có điểm** |
| `info().backend` | `'apple-nl'` | `'windows-els'` |
| `info().scoreKind` | `'probability'` | `'rank'` |
| `confidence` | số `0..1` | **`null`** |

Trên Windows, thông tin hạng nằm ở **thứ tự phần tử trong mảng**, và thứ tự đó
luôn đúng. Module cố tình không quy đổi hạng thành một con số `0..1` — đó là dữ
liệu OS chưa từng cung cấp. Bên nào cần hiển thị phần trăm thì tự quyết cách quy
đổi.

**Đọc `info().scoreKind` trước khi diễn giải con số, và đừng so trực tiếp giá
trị của hai nền tảng với nhau.**

Trên Linux hoặc nền tảng không có backend, module vẫn `require` được nhưng
`availability()` trả `{ supported: false }` và `detect()` reject. App không cần
`try/catch` quanh việc import.

## Artifact được commit

| Artifact | Target Rust | Thư mục |
|---|---|---|
| `zlang.darwin-arm64.node` | `aarch64-apple-darwin` | `darwin-arm64/` |
| `zlang.darwin-x64.node` | `x86_64-apple-darwin` | `darwin-x64/` |
| `zlang.win32-x64.node` | `x86_64-pc-windows-msvc` | `win32-x64/` |
| `zlang.win32-ia32.node` | `i686-pc-windows-msvc` | `win32-ia32/` |

Mỗi thư mục có kèm `build-info.json` ghi target, phiên bản `rustc`, máy build và
thời điểm build. Binary commit vào repo mà không có xuất xứ là hộp đen — bài học
từ `zwalker`, vốn mang sẵn một lỗi Windows 7 mà không ai biết.

`index.js` và `index.d.ts` cũng được commit: chúng là sản phẩm của `tsc` từ
`index.ts`, **đừng sửa tay** — mọi thay đổi bị ghi đè ở lần `build:types` sau.

## Môi trường

Toolchain Rust **ghim ở 1.77.2** trong `rust-toolchain.toml`; `rustup` tự tải
đúng bản khi build. Đây không phải tuỳ chọn: từ 1.78 `std` dùng `ProcessPrng`
(Windows 10+) và import tĩnh `api-ms-win-core-synch-l1-2-0.dll` (Windows 8+),
nên binary dựng bằng 1.78+ **không nạp được trên Windows 7**.

Cùng lý do đó, `Cargo.lock` phải commit và **không được `cargo update`** trần:
`unicode-segmentation` bản mới khai MSRV 1.85, `napi-build` 2.2+ khai 1.88. Cần
cập nhật thì kèm `-p <crate> --precise <ver>` rồi build lại cả bốn target.

- **macOS**: Xcode Command Line Tools (`swiftc`, `xcrun`), target
  `aarch64-apple-darwin` + `x86_64-apple-darwin`. Deployment target 10.14, đặt ở
  `.cargo/config.toml` và phải khớp `MACOS_MIN_VERSION` trong `build.rs`.
- **Windows**: Visual Studio Build Tools + Windows SDK, target
  `x86_64-pc-windows-msvc` + `i686-pc-windows-msvc`. C runtime link tĩnh
  (`crt-static`) để `.node` không đòi VC++ Redistributable trên máy người dùng.
- **Node**: bản nào cũng được để chạy script build. Runtime cần Node 14+ /
  Electron 22+ (`napi4`).

`build-node.js` tự chạy `rustup target add` cho target còn thiếu.

## Build

Chạy từ `nativelibs/zlang`.

```bash
npm run build:node:darwin-arm64
npm run build:node:darwin-x64
npm run build:node:win32-x64      # chỉ chạy được trên Windows
npm run build:node:win32-ia32     # chỉ chạy được trên Windows
npm run build:types               # index.ts -> index.js + index.d.ts
```

`npm run build` = `build:node` (target của máy đang chạy) + `build:types`.

Bridge Swift được dựng thành static archive rồi link hẳn **vào trong** `.node`,
nên chỉ phải ship đúng một file — không rpath, không `install_name`, không ký
thêm binary thứ hai. Swift runtime vẫn link động vào `/usr/lib/swift` của hệ
điều hành.

Không dùng `@napi-rs/cli`: việc nó làm thêm ở đây chỉ là đổi tên artifact và
sinh `binding.d.ts`, mà kiểu công khai đã do `index.d.ts` mô tả.
`scripts/build-node.js` thay thế được mà không thêm dev dependency, và nó có chỗ
để ghi `build-info.json` lẫn để móc cửa chặn Windows 7.

## Test

```bash
npm run smoke
```

Chạy 8 ngôn ngữ (vi, en, ja, ko, th, ru, fr, zh) cùng ba ca biên — chuỗi rỗng,
`maxResults` bị chặn, không truyền `maxResults`. Sau đó chạy lại đúng 8 ngôn ngữ
đó qua `dominantLanguage()` cộng ca chuỗi rỗng (phải ra `null`). Gọi **qua
facade** (`index.js`)
chứ không gọi thẳng `.node`, nên kiểm luôn phần chọn prebuilt theo platform và
phần đổi tên field. Thoát khác 0 nếu có mẫu sai.

`smoke.js` thoát ngay khi `availability().supported === false`, nên nó **không**
kiểm được đường `native-binding-missing` — đúng trạng thái Windows đang ở. Đó là
phần test còn thiếu.

## Hợp đồng runtime

```js
const zlang = require('nativelibs').zlang();

await zlang.detect('Xin chào, hôm nay trời đẹp quá.');
// [ { detectedLanguage: 'vi', confidence: 1 },
//   { detectedLanguage: 'nb', confidence: 2.59e-10 }, ... ]

await zlang.detect(text, { maxResults: 3 });

await zlang.dominantLanguage('Xin chào, hôm nay trời đẹp quá.');
// 'vi'
await zlang.dominantLanguage('');
// null
```

- `detect()` chạy trên **libuv threadpool**, không chiếm luồng JS của main
  process Electron.
- Kết quả **luôn được sắp giảm dần** theo mức độ khả năng, trên cả hai nền tảng
  — kể cả khi `confidence` là `null`.
- **Mảng rỗng là kết quả hợp lệ**, không phải lỗi: văn bản quá ngắn hoặc quá mơ
  hồ để model kết luận.
- `maxResults` bị chặn trong `1..16`. **Không truyền = xin tối đa sức chứa
  buffer (16)**, không phải một con số "hợp lý" do module tự chọn.
- `detectedLanguage` là thẻ BCP 47 **do OS trả về, chuyển thẳng ra không chỉnh
  sửa**: `'vi'`, `'zh-Hans'`, `'zh-Hant'`… Hai backend có thể dùng thẻ khác nhau
  cho cùng một ngôn ngữ; module **không** normalize.
- Chuỗi chứa byte `NUL` bị reject — `NUL` không đi qua được C ABI.
- `availability()` **không bao giờ ném**, trả lời được cả khi native hỏng. Lý do:
  `'unsupported-platform'` | `'native-binding-missing'` | `'os-service-unavailable'`.
- `info().loadError` giữ nguyên câu lỗi của OS khi `require` file `.node` thất
  bại.
- `dominantLanguage()` trả **đúng thẻ ngôn ngữ khả năng cao nhất**, không kèm
  `confidence`. Nó là lớp mỏng trên `detect(text, { maxResults: 1 })`, không phải
  đường hỏi OS riêng: cùng gate availability, cùng thẻ thô không normalize, và
  **reject trong đúng những trường hợp `detect()` reject**. Chỗ `detect()` trả
  mảng rỗng thì nó trả `null` — vẫn là kết quả hợp lệ, không phải lỗi.
- Lần `detect()` đầu tiên tốn ~50ms vì OS nạp model; các lần sau dưới 1ms. Gọi
  ấm một lần lúc khởi động nếu không muốn người dùng chịu độ trễ đó ở lần gõ đầu.

## Kiến trúc

```
index.ts                    facade — hợp đồng công khai, sinh ra index.js + index.d.ts
native.d.ts                 bề mặt THÔ của .node — bản chiếu TypeScript của src/lib.rs
<platform>-<arch>/*.node    binary đã build sẵn, được commit
src/zlang_bridge.h          một ABI phẳng dùng chung cho mọi OS
src/bridge_darwin.swift     gọi NLLanguageRecognizer
src/bridge_windows.c        gọi MappingRecognizeText (ELS)
src/lib.rs                  bề mặt napi, chạy detect() off main thread
src/backend.rs              marshalling FFI — toàn bộ `unsafe` của crate
```

Bridge riêng cho mỗi OS thay vì gọi API của OS thẳng từ Rust, vì struct của ELS
và class của Apple phải khớp tuyệt đối với header của SDK — để header thật làm
nguồn sự thật thì không có chỗ cho sai layout âm thầm.

**Hai chỗ compiler không bảo vệ được**, cả hai đều là bản chép tay:

| nguồn sự thật | bản chép tay | cơ chế đồng bộ |
|---|---|---|
| `src/zlang_bridge.h` | `src/backend.rs` (`#[repr(C)]`, `TAG_CAP`) | comment `Khớp ZLANG_*` |
| `src/lib.rs` (`#[napi]`) | `native.d.ts` | không có |

Sửa một bên mà quên bên kia thì build vẫn sạch, link vẫn sạch, và lỗi chỉ hiện
lúc chạy. Đổi `ZLANG_TAG_CAP` hay thêm một hàm `#[napi]` thì kiểm cả hai cột.

## Trạng thái

| Phần | Trạng thái |
|---|---|
| Facade TypeScript, napi binding, bridge macOS (Swift) | Đã build và smoke test trên macOS |
| `darwin-arm64`, `darwin-x64` | Đã build |
| Bridge Windows (`src/bridge_windows.c`) | **Đã viết, CHƯA build lần nào** — máy phát triển là macOS |
| `win32-ia32`, `win32-x64` | Chưa có `.node` |
| Cửa chặn Windows 7 (`scripts/win7-guard.js`) | Chưa viết |
| `dominantLanguage()` — lấy thẻ ngôn ngữ khả năng cao nhất | Có, dựng trên `detect()` ở tầng facade |
| Option điều khiển kết quả (`constraints`, `hints`, `inputLanguage`…) | Chưa có |

Bridge Windows viết theo `<elscore.h>` / `<elssrvc.h>` của Windows SDK: layout
struct do SDK cung cấp nên không có rủi ro sai layout, nhưng **tên field và tên
hàm cần một lần build thật trên Windows để chốt**. Khi chưa có `.node`,
`availability()` trả `{ supported: false, reason: 'native-binding-missing' }` và
app vẫn chạy bình thường.

## Troubleshooting

- **`availability()` trả `'native-binding-missing'`**: thiếu `.node` cho
  `${process.platform}-${process.arch}`. Build hoặc đóng gói lát tương ứng.
  `info().loadError` giữ câu lỗi gốc của OS.
- **`availability()` trả `'os-service-unavailable'`** (chỉ Windows): dịch vụ
  Microsoft Language Detection không có hoặc bị policy tắt.
- **`cargo build` báo `requires rustc 1.85.0 or newer`**: ai đó chạy
  `cargo update` trần. Ghim lại:
  `cargo update -p unicode-segmentation --precise 1.12.0`.
- **Build Windows xong nhưng `.node` không nạp được trên Win7**: gần như chắc
  chắn cargo đã dùng toolchain khác 1.77.2. Kiểm `rustc -vV` và
  `rust-toolchain.toml`.
- **Editor báo đỏ** `Cannot find type 'ZlangHypothesis'` trong file Swift,
  `'windows.h' file not found` trong file C, hoặc `proc-macro server did not
  respond` trên `#[napi]`: đều là nhiễu của editor, không phải lỗi build. Cờ
  `-import-objc-header` chỉ có trong `build.rs` nên SourceKit không thấy; ABI
  proc-macro khoá theo phiên bản rustc nên rust-analyzer bản mới không đọc được
  macro do 1.77.2 sinh. `cargo build` vẫn sạch.
- **Lần `detect()` đầu chậm hơn hẳn các lần sau**: OS nạp model lần đầu, không
  phải lỗi.
