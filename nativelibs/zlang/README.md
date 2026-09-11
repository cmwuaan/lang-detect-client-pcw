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
| Điều khiển được kết quả | `constraints`, `hints` | `inputLanguage`, `inputScript`, `startIndex` |
| `dominantLanguage` | có | không |

`maxResults` thì nền tảng nào cũng hiểu.

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

`text` là chuỗi UTF-8, bắt buộc.

| Trường hợp | Hành vi |
|---|---|
| Chuỗi rỗng, hoặc quá ngắn để kết luận | Trả **mảng rỗng** — kết quả hợp lệ, không phải lỗi |
| Chuỗi chứa byte `NUL` | Reject (`NUL` không đi qua được C ABI) |
| Chuỗi rất dài | Không có giới hạn cứng; OS tự xử lý |

### Option điều khiển kết quả

Mọi option ánh xạ **thẳng** sang API của OS, không qua tầng diễn giải nào.
**Không truyền field nào thì OS giữ mặc định của chính nó** — module không tự đặt
ra giá trị thay bạn.

```js
await zlang.detect({
  text: 'No',
  maxResults: 5,                    // mọi nền tảng
  constraints: ['en', 'fr'],        // macOS
  hints: { vi: 0.9, en: 0.1 },      // macOS
});
```

| Option | Nền tảng | Ánh xạ tới | Tác dụng |
|---|---|---|---|
| `maxResults` | cả hai | `languageHypotheses(withMaximum:)` / cắt danh sách ELS | Số giả thuyết tối đa, chặn trong `1..16`. Không truyền = xin tối đa. |
| `constraints` | macOS | `languageConstraints` | Chỉ xét các thẻ BCP 47 này. **Ràng buộc mềm**: ngôn ngữ ngoài danh sách vẫn có thể xuất hiện, nhưng confidence bằng 0. |
| `hints` | macOS | `languageHints` | Prior của caller, thẻ -> trọng số. Đủ mạnh để lật kết quả của văn bản mơ hồ. |
| `inputLanguage` | Windows | `MAPPING_ENUM_OPTIONS.pszInputLanguage` | Thẻ IETF. Lọc **dịch vụ**, không lọc kết quả — xem cảnh báo bên dưới. |
| `inputScript` | Windows | `MAPPING_ENUM_OPTIONS.pszInputScript` | Hệ chữ viết đầu vào. Cũng lọc dịch vụ. |
| `startIndex` | Windows | `MappingRecognizeText.dwIndex` | Ký tự bắt đầu đọc trong văn bản. |

> **`inputLanguage` KHÔNG phải `constraints` của Apple.** Nó nói "chỉ dùng engine
> nào nhận được ngôn ngữ đầu vào này", chứ không phải "chỉ trả về ngôn ngữ này".
> ELS không có chỗ nào áp ràng buộc lên kết quả trả về, nên hai option này không
> gộp chung một tên — gộp là hứa hẹn một hành vi không tồn tại.
>
> macOS không có tham số tương đương `startIndex`: `processString()` luôn đọc cả
> chuỗi. Cần hành vi đó thì tự cắt chuỗi trước khi gọi.

Hiệu lực thật, đo trên cùng một chuỗi:

```js
await zlang.detect({ text: 'Xin chào, hôm nay trời đẹp quá.' });
// dominantLanguage: 'vi'

await zlang.detect({ text: 'Xin chào, hôm nay trời đẹp quá.', constraints: ['en', 'fr'] });
// dominantLanguage: 'fr'   — Apple tôn trọng constraint

await zlang.detect({ text: 'No', hints: { it: 0.99 } });
// dominantLanguage: 'it'   — không hint thì ra 'pt'
```

**Hỏi `info().capabilities` trước khi truyền.** Backend không hỗ trợ thì
`detect()` **reject** chứ không bỏ qua im lặng — đặt constraint rồi tưởng nó có
hiệu lực là lỗi nguy hiểm hơn nhiều so với một lỗi rõ ràng.

```js
zlang.capabilities();
// macOS
// { constraints: true,  hints: true,  dominant: true,
//   inputLanguage: false, inputScript: false, startIndex: false }
// Windows
// { constraints: false, hints: false, dominant: false,
//   inputLanguage: true,  inputScript: true,  startIndex: true }
```

Hai bộ cờ **không giao nhau**: Apple cho can thiệp vào chính bộ nhận diện, ELS
chỉ cho lọc ở bước chọn dịch vụ. Không cái nào giả lập được cái kia, nên truyền
nhầm nhóm là `detect()` reject ngay.

---

## Output

```js
{
  hypotheses: [
    { detectedLanguage: 'vi', confidence: 1 },
    { detectedLanguage: 'nb', confidence: 0.00000000025940741221752717 },
    { detectedLanguage: 'id', confidence: 0.00000000024919466490302966 }
  ],
  dominantLanguage: 'vi'
}
```

**`hypotheses` luôn được sắp giảm dần theo mức độ khả năng**, trên cả hai nền tảng.

### `dominantLanguage`

`NLLanguageRecognizer.dominantLanguage` — ngôn ngữ trội do model tự chọn. Apple
tính nó **độc lập** với `languageHypotheses`, nên không phải lúc nào cũng trùng
`hypotheses[0]`.

`null` khi model không kết luận được (văn bản rỗng/quá ngắn), hoặc khi backend
không có khái niệm đó — Windows/ELS chỉ trả về một danh sách xếp hạng, không
tách riêng "ngôn ngữ trội".

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
// { backend: 'apple-nl', scoreKind: 'probability',
//   capabilities: { constraints: true, hints: true, dominant: true,
//                   inputLanguage: false, inputScript: false, startIndex: false },
//   version: '0.1.0', platform: 'darwin-arm64', loadError: null }

zlang.capabilities();   // = info().capabilities, viết ngắn

zlang.availability();
// { supported: true }
// { supported: false, reason: 'unsupported-platform' }
//                           | 'native-binding-missing'
//                           | 'os-service-unavailable'
```

`info()` là thông tin chẩn đoán, để log và hiển thị — `loadError` giữ nguyên câu
lỗi của OS khi `require` file `.node` thất bại.

`availability()` không bao giờ ném, và trả lời được cả khi native hỏng.
`detect()` reject khi backend không dùng được, khi native báo lỗi thật, hoặc khi
nhận option mà backend không hỗ trợ.

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
