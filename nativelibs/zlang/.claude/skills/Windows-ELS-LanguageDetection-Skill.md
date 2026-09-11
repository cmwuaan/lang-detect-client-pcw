# Skill: Control Language Detection với Windows ELS (chỉ Offline)

## Phạm vi
File này chỉ tập trung vào **dịch vụ "Language Detection"** của Windows ELS (`Elscore.dll`), và mặc định **loại bỏ dịch vụ online**, chỉ dùng engine cài sẵn trên máy (offline).

Header: `#include <elscore.h>`, link `Elscore.lib`.

---

## Bước 1 — Lấy đúng dịch vụ Language Detection, ép offline

Toàn bộ khả năng "control" nằm ở cấu trúc lọc `MAPPING_ENUM_OPTIONS` khi gọi `MappingGetServices`.

```cpp
typedef struct _MAPPING_ENUM_OPTIONS {
    size_t   Size;                 // bắt buộc: sizeof(MAPPING_ENUM_OPTIONS)
    LPWSTR   pszCategory;          // "Language Detection"
    LPWSTR   pszInputLanguage;     // Giới hạn ngôn ngữ đầu vào (IETF tag), NULL = không giới hạn
    LPWSTR   pszOutputLanguage;    // Không dùng cho Language Detection, để NULL
    LPWSTR   pszInputScript;       // Giới hạn theo script đầu vào, NULL = không giới hạn
    LPWSTR   pszOutputScript;      // Không dùng, để NULL
    LPWSTR   pszInputContentType;  // "text/plain" (duy nhất được hỗ trợ)
    LPWSTR   pszOutputContentType; // Không dùng, để NULL
    GUID     *pGuid;               // Chỉ định đúng 1 dịch vụ theo GUID đã biết trước
    unsigned OnlineService : 2;    // ÉP OFFLINE tại đây
    unsigned ServiceType   : 2;    // Loại dịch vụ (để mặc định)
} MAPPING_ENUM_OPTIONS, *PMAPPING_ENUM_OPTIONS;
```

### Code: liệt kê dịch vụ, chỉ lấy Language Detection + offline

```cpp
MAPPING_ENUM_OPTIONS options = {0};
options.Size = sizeof(MAPPING_ENUM_OPTIONS);
options.pszCategory = L"Language Detection";
options.pszInputContentType = L"text/plain";
options.OnlineService = 0; // 0 = chỉ lấy dịch vụ offline (không kết nối mạng)

PMAPPING_SERVICE_INFO pServices = nullptr;
DWORD dwCount = 0;

HRESULT hr = MappingGetServices(&options, &pServices, &dwCount);
// pServices[0] là dịch vụ Language Detection offline mặc định của Windows
```

**Cache lại `pServices`** sau khi lấy được — chỉ gọi `MappingGetServices` một lần khi khởi động, không gọi lại trong vòng lặp xử lý văn bản.

Giải phóng khi không dùng nữa:
```cpp
MappingFreeServices(pServices);
```

---

## Bước 2 — Gọi nhận diện ngôn ngữ

```cpp
HRESULT MappingRecognizeText(
    PMAPPING_SERVICE_INFO pServiceInfo,  // dịch vụ đã lấy ở Bước 1
    LPCWSTR               pszText,       // văn bản UTF-16 cần nhận diện
    DWORD                 dwLength,      // độ dài văn bản
    DWORD                 dwIndex,       // vị trí bắt đầu xử lý (0 = xử lý toàn bộ)
    PMAPPING_OPTIONS      pOptions,      // để NULL = mặc định
    PMAPPING_PROPERTY_BAG pbag           // nơi chứa kết quả
);
```

```cpp
std::wstring text = L"Xin chào các bạn";

MAPPING_PROPERTY_BAG bag = {0};
bag.Size = sizeof(MAPPING_PROPERTY_BAG);

HRESULT hr = MappingRecognizeText(
    &pServices[0],
    text.c_str(),
    static_cast<DWORD>(text.length()),
    0,
    nullptr,
    &bag
);

if (SUCCEEDED(hr)) {
    for (DWORD i = 0; i < bag.dwRangesCount; i++) {
        MAPPING_DATA_RANGE range = bag.prgResultRanges[i];
        // range: vị trí trong text + ngôn ngữ nhận diện + điểm tin cậy
    }
}

MappingFreePropertyBag(&bag);
```

---

## Các điểm "control" thực sự có ở Language Detection

| Muốn kiểm soát gì | Set ở đâu | Ghi chú |
|---|---|---|
| Chỉ dùng engine offline, không gọi mạng | `MAPPING_ENUM_OPTIONS.OnlineService = 0` | Áp dụng ngay khi liệt kê dịch vụ, đảm bảo không lấy nhầm dịch vụ cloud |
| Giới hạn ngôn ngữ đầu vào dịch vụ chấp nhận | `MAPPING_ENUM_OPTIONS.pszInputLanguage` | Set IETF tag, ví dụ `L"vi"`; NULL nếu không giới hạn |
| Giới hạn theo script đầu vào | `MAPPING_ENUM_OPTIONS.pszInputScript` | Dùng khi biết trước văn bản chỉ thuộc 1 hệ chữ viết |
| Chỉ định đúng 1 dịch vụ cụ thể (nếu máy có nhiều engine) | `MAPPING_ENUM_OPTIONS.pGuid` | Truyền GUID đã lưu từ lần enumerate trước |
| Xử lý một đoạn con trong văn bản dài thay vì toàn bộ | `MappingRecognizeText.dwIndex` | Set vị trí bắt đầu khác 0 |
| Truyền dữ liệu phụ trợ riêng cho dịch vụ | `MAPPING_PROPERTY_BAG.pCallerData` / `dwCallerDataSize` | Ứng dụng tự quản lý bộ nhớ vùng này |
| Đọc kết quả: ngôn ngữ + độ tin cậy | `MAPPING_PROPERTY_BAG.prgResultRanges[]` | Duyệt mảng, mỗi phần tử tương ứng 1 vùng/giả thuyết nhận diện |

**Không có** trong ELS (khác với `NLLanguageRecognizer` của Apple):
- Không có tham số kiểu `languageHints` (gợi ý xác suất trước) — muốn ưu tiên một ngôn ngữ, phải tự xử lý sau khi có kết quả thô từ `prgResultRanges`.
- Không có tham số kiểu `languageConstraints` áp trực tiếp lên hàm nhận diện — chỉ có `pszInputLanguage`/`pszInputScript` ở bước *lọc dịch vụ*, không lọc trực tiếp *kết quả trả về*.

---

## Wrapper class tái sử dụng (offline-only)

```cpp
class ElsLanguageDetector {
public:
    ElsLanguageDetector() {
        MAPPING_ENUM_OPTIONS options = {0};
        options.Size = sizeof(MAPPING_ENUM_OPTIONS);
        options.pszCategory = L"Language Detection";
        options.pszInputContentType = L"text/plain";
        options.OnlineService = 0; // ép offline

        MappingGetServices(&options, &m_pServices, &m_dwCount);
    }

    ~ElsLanguageDetector() {
        if (m_pServices) {
            MappingFreeServices(m_pServices);
        }
    }

    bool Detect(const std::wstring& text, MAPPING_PROPERTY_BAG& bag) {
        if (m_dwCount == 0) return false;

        ZeroMemory(&bag, sizeof(bag));
        bag.Size = sizeof(MAPPING_PROPERTY_BAG);

        HRESULT hr = MappingRecognizeText(
            &m_pServices[0],
            text.c_str(),
            static_cast<DWORD>(text.length()),
            0,
            nullptr,
            &bag
        );
        return SUCCEEDED(hr);
    }

private:
    PMAPPING_SERVICE_INFO m_pServices = nullptr;
    DWORD m_dwCount = 0;
};
```

Sử dụng:
```cpp
ElsLanguageDetector detector;
MAPPING_PROPERTY_BAG bag;

if (detector.Detect(L"Bonjour tout le monde", bag)) {
    // duyệt bag.prgResultRanges để lấy ngôn ngữ + độ tin cậy
    MappingFreePropertyBag(&bag);
}
```

---

## Lưu ý triển khai
- Luôn kiểm tra `SUCCEEDED(hr)` trước khi đọc `bag`.
- Luôn gọi `MappingFreeServices` và `MappingFreePropertyBag` để tránh rò rỉ bộ nhớ.
- API là C/COM-style thuần Win32 — dùng từ C#/.NET cần tự P/Invoke, không có managed wrapper chính thức.
- Yêu cầu tối thiểu: Windows 7 / Windows Server 2008 R2 trở lên.
