---
name: cross-platform-native-facade
description: Thiết kế và triển khai một lớp facade JS/TS thống nhất, cho phép ứng dụng Node/Electron/React Native gọi các API nhận diện ngôn ngữ (hoặc bất kỳ tính năng linguistics/AI nào) native của Windows (Extended Linguistic Services / elscore.h) và macOS (NaturalLanguage.framework / NLLanguageRecognizer) qua một cùng một interface duy nhất. Dùng skill này bất cứ khi nào người dùng muốn "làm language detector đa nền tảng", "wrap native API Windows/macOS bằng JS", "viết N-API addon gọi elscore.h hoặc NaturalLanguage", "đối chiếu 2 API native rồi thiết kế facade chung", hoặc yêu cầu tạo native module TypeScript có capability detection giữa các hệ điều hành khác nhau — kể cả khi họ không gọi đúng tên "facade pattern" hay "N-API".
---

# Cross-Platform Native Facade — Language Detector

Skill này hướng dẫn quy trình: (1) đọc & đối chiếu tài liệu 2 (hoặc nhiều) API
native lệch nhau về mô hình lập trình, (2) thiết kế 1 interface JS/TS chung
biểu đạt được **tập hợp (union)** tính năng của tất cả các bên, (3) sinh code
native binding cho từng platform, cài đặt đúng interface đó, và tự khai báo
"capability" khi 1 platform không hỗ trợ native 1 tính năng nào đó.

Áp dụng trực tiếp cho cặp API: **Windows ELS `MappingRecognizeText`
(elscore.h)** và **macOS `NLLanguageRecognizer` (NaturalLanguage.framework)**.
Cũng dùng được làm khuôn mẫu cho bất kỳ cặp native API nào khác có cùng vấn đề
(1 bên one-shot/callback, 1 bên có state object).

## Khi nào dùng skill này

- Người dùng muốn xây tính năng detect ngôn ngữ (hoặc phân loại văn bản
  tương tự) chạy được cả Windows lẫn macOS từ 1 codebase JS/TS.
- Người dùng đưa link/tài liệu 2 API native khác nhau và muốn "đối chiếu" rồi
  "viết facade" hoặc "viết binding".
- Người dùng cần thiết kế N-API addon (C++/Objective-C++) expose ra Node.js.
- Người dùng cần một pattern để các field/tính năng chỉ tồn tại ở 1 platform
  không làm vỡ code cross-platform (capability negotiation).

## Quy trình

### Bước 1 — Đọc & lập bảng đối chiếu 2 API

Trước khi viết bất kỳ dòng code nào, xây một bảng đối chiếu theo các trục:

| Trục | Câu hỏi cần trả lời cho MỖI api |
|---|---|
| Model lời gọi | one-shot hay session/instance có state? |
| Đồng bộ/bất đồng bộ | có callback không, hay luôn block? |
| Input | kiểu dữ liệu, encoding, giới hạn độ dài |
| Output | 1 kết quả hay danh sách xếp hạng có xác suất? |
| Tuỳ chỉnh/guide | có "hint" (gợi ý mềm) không? có "constraint" (giới hạn cứng) không? |
| Vòng đời tài nguyên | cần free/dispose thủ công không? |
| Ràng buộc thread | có cấm dùng từ nhiều thread không? |

Xem `references/windows-elscore-api.md` và
`references/macos-nlanguagerecognizer-api.md` để có sẵn bảng này cho đúng cặp
API `MappingRecognizeText` / `NLLanguageRecognizer` — đọc lại nếu cần trước
khi viết interface.

**Nguyên tắc chọn mô hình chuẩn cho facade:** chọn mô hình biểu đạt được
NHIỀU tính năng nhất (thường là bên có state/session), rồi bắt bên kia tự giả
lập session bằng cách giữ tài nguyên (property bag, options struct...) sống
giữa các lần gọi.

### Bước 2 — Viết `types.ts`: interface chung + JSDoc khai báo platform

Với MỖI field trong options object, JSDoc phải nói rõ:
- Field đó map sang property/param nào ở từng native API.
- Nếu 1 platform không có field tương đương: nói rõ **"no-op"** (không throw)
  và platform nào sẽ tự giả lập nó ở tầng nào (native hay JS facade).

Xem mẫu đầy đủ tại `assets/types.ts`.

### Bước 3 — Viết `index.ts`: facade class + capability negotiation

- Facade load đúng native addon theo `process.platform`.
- Expose `getCapabilities()` trả về cờ boolean cho từng tính năng, để code gọi
  facade (hoặc UI) biết tính năng nào đang chạy thật native, tính năng nào
  đang được giả lập ở JS.
- Tính năng nào thiếu native ở 1 platform (ví dụ Windows thiếu
  `languageHints`/`languageConstraints`) thì facade JS tự bù bằng hậu xử lý
  (lọc + renormalize xác suất) — xem `applyClientSideConstraintsAndHints`
  trong `assets/index.ts` làm mẫu.

### Bước 4 — Viết native binding cho từng platform

- **Windows**: N-API C++ (`windows_binding.cpp`), include `elscore.h`, link
  `Elscore.lib`. Bắt buộc: lấy service qua `MappingGetServices` trước, gọi
  `MappingRecognizeText`, đọc kết quả từ `MAPPING_PROPERTY_BAG`, giải phóng
  bằng `MappingFreePropertyBag`. Giữ `pOptions`/text buffer sống tới khi bag
  được free (đúng cảnh báo trong tài liệu MSDN).
- **macOS**: Objective-C++ (`macos_binding.mm`), import
  `<NaturalLanguage/NaturalLanguage.h>`, link `-framework NaturalLanguage`.
  Mỗi session = 1 instance `NLLanguageRecognizer` + 1 serial dispatch queue
  riêng (Apple cấm dùng 1 instance từ nhiều thread cùng lúc).

Dùng `assets/windows_binding.cpp` và `assets/macos_binding.mm` làm khung sườn
— đây là bản rút gọn có đủ cấu trúc handle/session/dispose, nhưng phần parse
GUID trong property bag (Windows) cần tra cứu kỹ `elsids.h` trước khi chạy
thật.

### Bước 5 — Viết ví dụ dùng + README giải thích thiết kế

Luôn kèm 1 file README/markdown giải thích: tại sao chọn mô hình đó làm
chuẩn, field nào giả lập ở đâu, và phần nào còn cần hoàn thiện khi build thật
(TODO rõ ràng, đừng giả vờ code đã hoàn chỉnh 100% nếu có phần rút gọn).

## Nguyên tắc chung khi làm việc với "no-op field" (áp dụng skill này cho API khác)

1. Không bao giờ throw lỗi khi 1 field optional không áp dụng cho platform
   hiện tại — chỉ log/ghi chú, để code gọi facade viết 1 lần chạy mọi nơi.
2. Luôn có `getCapabilities()` (hoặc tương đương) để runtime biết được sự
   khác biệt, thay vì giấu nhẹm.
3. Ưu tiên giả lập ở tầng JS facade (dễ sửa, dễ test) hơn là native, trừ khi
   việc giả lập cần truy cập dữ liệu chỉ native mới có (ví dụ raw score chưa
   chuẩn hoá).
4. Luôn to rõ TODO/giới hạn còn lại trong code binding thay vì viết như thể
   đã production-ready — đặc biệt phần parse cấu trúc nhị phân phức tạp như
   `MAPPING_PROPERTY_BAG`.

## Tài nguyên đi kèm

- `references/windows-elscore-api.md` — tóm tắt `MappingRecognizeText` +
  `MAPPING_OPTIONS` (elscore.h).
- `references/macos-nlanguagerecognizer-api.md` — tóm tắt `NLLanguageRecognizer`.
- `references/facade-design-checklist.md` — checklist đối chiếu dùng lại cho
  cặp API khác.
- `assets/types.ts`, `assets/index.ts` — facade TS đầy đủ.
- `assets/windows_binding.cpp` — N-API binding Windows.
- `assets/macos_binding.mm` — N-API binding macOS (Objective-C++).
- `assets/prompt-to-build-this.md` — prompt hoàn chỉnh để yêu cầu 1 AI khác
  (hoặc chính Claude ở phiên làm việc mới) tự dựng lại toàn bộ feature này từ
  đầu, không cần lịch sử hội thoại trước đó.
