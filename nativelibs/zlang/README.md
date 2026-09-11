# zlang

Nhận diện ngôn ngữ bằng **model có sẵn trong hệ điều hành**, gói lại thành một
hợp đồng JavaScript duy nhất cho cả macOS và Windows.

Không tải model, không cần mạng, không asset đi kèm bản build, không tiến trình
phụ — mọi thứ nằm trong một file `.node` và trong OS.

Module này **chỉ làm interface + mapping**. Không có thuật toán, rule, bảng tra
hay regex nào ở đây: mọi kết luận về ngôn ngữ đều do OS đưa ra, và cái gì OS
không cung cấp thì trả `null` chứ không tự suy ra.

---

## API native dùng ở mỗi nền tảng

| | macOS | Windows |
|---|---|---|
| API của OS | [Apple NaturalLanguage](https://developer.apple.com/documentation/naturallanguage/nllanguagerecognizer) — `NLLanguageRecognizer` | [Extended Linguistic Services](https://learn.microsoft.com/en-us/windows/win32/intl/microsoft-language-detection) — service "Microsoft Language Detection" |
| Hàm gọi | `languageHypotheses(withMaximum:)` | `MappingRecognizeText` với `ELS_GUID_LANGUAGE_DETECTION` |
| Có sẵn từ | macOS 10.14 | Windows 7 |
| OS trả về | Danh sách ngôn ngữ **kèm xác suất thật** của model | Danh sách ngôn ngữ **đã xếp hạng, KHÔNG có điểm số** |
| `info().backend` | `'apple-nl'` | `'windows-els'` |
| `info().scoreKind` | `'probability'` | `'rank'` |

Khác biệt ở dòng "OS trả về" là điều quan trọng nhất cần nhớ khi dùng module
này — xem [Output](#output).

Trên Linux hoặc nền tảng không có backend, module vẫn nạp được nhưng
`availability()` trả `{ supported: false }` và `detect()` reject. App không cần
`try/catch` quanh việc `require`.

---

## Input

```js
const zlang = require('nativelibs').zlang();

await zlang.detect({ text: 'Xin chào, hôm nay trời đẹp quá.' });
```

Đúng một tham số: `text`, chuỗi UTF-8.

| Trường hợp | Hành vi |
|---|---|
| Chuỗi rỗng, hoặc quá ngắn để kết luận | Trả **mảng rỗng** — kết quả hợp lệ, không phải lỗi |
| Chuỗi chứa byte `NUL` | Reject (`NUL` không đi qua được C ABI) |
| Chuỗi rất dài | Không có giới hạn cứng; OS tự xử lý |

Module trả tối đa 3 giả thuyết.

---

## Output

```js
[
  { detectedLanguage: 'vi', confidence: 1 },
  { detectedLanguage: 'nb', confidence: 0.00000000025940741221752717 },
  { detectedLanguage: 'id', confidence: 0.00000000024919466490302966 }
]
```

**Mảng luôn được sắp giảm dần theo mức độ khả năng**, trên cả hai nền tảng.

### `detectedLanguage`

Thẻ [BCP 47](https://www.rfc-editor.org/info/bcp47) do OS trả về, chuyển thẳng
ra ngoài không chỉnh sửa: `'vi'`, `'en'`, `'ko'`, `'ru'`, `'zh-Hans'`,
`'zh-Hant'`…

Lưu ý hai backend có thể dùng thẻ khác nhau cho cùng một ngôn ngữ (ví dụ tiếng
Trung). Module **không** normalize — muốn thống nhất thì làm ở tầng trên.

### `confidence`

| `scoreKind` | Nền tảng | Giá trị |
|---|---|---|
| `'probability'` | macOS | Số `0..1`, **xác suất thật của model**, các giả thuyết cộng lại ≈ 1 |
| `'rank'` | Windows | **`null`** — ELS không cho điểm số nào |

Trên Windows, thông tin hạng nằm ở **thứ tự phần tử trong mảng**, và thứ tự đó
luôn đúng. Module cố tình không quy đổi hạng thành một con số `0..1`: đó là dữ
liệu OS chưa từng cung cấp. Bên nào cần hiển thị phần trăm thì tự quyết cách quy
đổi — trong repo này việc đó nằm ở
`src/renderer/services/detection/providers/NativeDetectorProvider.ts`.

**Đọc `info().scoreKind` trước khi diễn giải con số, và đừng so trực tiếp giá
trị của hai nền tảng với nhau.**

Xác suất của Apple có thể rất nhỏ (cỡ `1e-10`) cho ngôn ngữ khó xảy ra — đó là
số thật, không phải lỗi.

---

## Ba hàm còn lại

```js
zlang.info();
// { backend: 'apple-nl', scoreKind: 'probability', version: '0.1.0',
//   platform: 'darwin-arm64', loadError: null }

zlang.availability();
// { supported: true }
// { supported: false, reason: 'unsupported-platform' }
//                           | 'native-binding-missing'
//                           | 'os-service-unavailable'
```

`info()` là thông tin chẩn đoán, để log và hiển thị — `loadError` giữ nguyên câu
lỗi của OS khi `require` file `.node` thất bại.

`availability()` không bao giờ ném, và trả lời được cả khi native hỏng. `detect()`
chỉ reject khi backend không dùng được hoặc native báo lỗi thật.

---

## Trạng thái

| Phần | Trạng thái |
|---|---|
| Facade TypeScript, napi binding, bridge macOS (Swift) | Đã build và test trên macOS 26.5 (arm64), Node 14 và Electron 22 |
| `darwin-arm64`, `darwin-x64` | Đã build, đã commit |
| Bridge Windows (`src/bridge_windows.c`) | **Đã viết, CHƯA build lần nào** — máy phát triển là macOS |
| `win32-ia32`, `win32-x64` | Chưa có `.node` |

Bridge Windows viết theo `<elscore.h>` / `<elssrvc.h>` của Windows SDK: layout
struct do SDK cung cấp nên không có rủi ro sai layout, nhưng tên field và tên hàm
cần một lần build thật trên Windows để chốt. Khi chưa có `.node`,
`availability()` trả `{ supported: false, reason: 'native-binding-missing' }` và
app vẫn chạy bình thường.

---

## File trong module

```
index.ts                    facade — hợp đồng công khai, sinh ra index.js + index.d.ts
<platform>-<arch>/*.node    binary đã build sẵn, được commit
src/zlang_bridge.h          một ABI phẳng dùng chung cho mọi OS
src/bridge_darwin.swift     gọi NLLanguageRecognizer
src/bridge_windows.c        gọi MappingRecognizeText (ELS)
src/lib.rs                  bề mặt napi, chạy detect() off main thread
src/backend.rs              marshalling FFI
```

Bridge riêng cho mỗi OS thay vì gọi API của OS thẳng từ Rust, vì struct của ELS
và class của Apple phải khớp tuyệt đối với header của SDK — để header thật làm
nguồn sự thật thì không có chỗ cho sai layout âm thầm.

Build lại module: [`BUILD.md`](BUILD.md).
