/*
 * Backend Windows — Extended Linguistic Services, service "Microsoft Language
 * Detection" (ELS_GUID_LANGUAGE_DETECTION).
 * https://learn.microsoft.com/en-us/windows/win32/intl/microsoft-language-detection
 *
 * Có sẵn từ Windows 7 trở lên, in-process, không cần tải model và không cần
 * asset nào đi kèm bản build — nên không có tiến trình host riêng như zocr.
 *
 * KHÁC BIỆT QUAN TRỌNG so với macOS: ELS chỉ trả về DANH SÁCH ĐÃ XẾP HẠNG, không
 * có xác suất. Bridge KHÔNG bịa ra con số thay cho nó: `confidence` được ghi là
 * ZLANG_NO_CONFIDENCE và tầng trên dịch thành `null`. Thứ tự phần tử chính là
 * thông tin duy nhất ELS cho, và nó được giữ nguyên. Facade công bố điều này qua
 * `scoreKind === 'rank'`.
 *
 * LƯU Ý: file này chưa được biên dịch trên máy nào — máy phát triển hiện tại là
 * macOS. Layout struct lấy từ <elscore.h> của Windows SDK nên không có rủi ro
 * sai layout, nhưng tên field/hàm cần một lần build trên Windows để chốt.
 */

#include <windows.h>
#include <elscore.h>
#include <elssrvc.h>
#include <wchar.h>

#include "zlang_bridge.h"

/* Lấy handle của đúng service language-detection; caller gọi MappingFreeServices. */
static HRESULT openService(MAPPING_SERVICE_INFO **services, DWORD *count) {
    MAPPING_ENUM_OPTIONS options;
    ZeroMemory(&options, sizeof(options));
    options.Size = sizeof(MAPPING_ENUM_OPTIONS);
    options.pGuid = (GUID *)&ELS_GUID_LANGUAGE_DETECTION;
    return MappingGetServices(&options, services, count);
}

bool zlang_bridge_available(void) {
    MAPPING_SERVICE_INFO *services = NULL;
    DWORD count = 0;

    if (FAILED(openService(&services, &count)) || count == 0) return false;
    MappingFreeServices(services);
    return true;
}

const char *zlang_bridge_score_kind(void) {
    return "rank";
}

int32_t zlang_bridge_detect(const char *utf8_text, uint32_t max_out, ZlangHypothesis *out) {
    WCHAR *wtext = NULL;
    int wlen = 0;
    MAPPING_SERVICE_INFO *services = NULL;
    DWORD serviceCount = 0;
    MAPPING_PROPERTY_BAG bag;
    HRESULT hr = S_OK;
    int32_t written = 0;
    int32_t result = 0;

    if (utf8_text == NULL || out == NULL || max_out == 0) return ZLANG_ERR_BAD_ARG;
    if (max_out > ZLANG_MAX_RESULTS) max_out = ZLANG_MAX_RESULTS;

    /* wlen tính cả NUL kết thúc; <= 1 nghĩa là chuỗi rỗng. */
    wlen = MultiByteToWideChar(CP_UTF8, 0, utf8_text, -1, NULL, 0);
    if (wlen <= 1) return 0;

    wtext = (WCHAR *)HeapAlloc(GetProcessHeap(), 0, (SIZE_T)wlen * sizeof(WCHAR));
    if (wtext == NULL) return ZLANG_ERR_BACKEND;

    if (MultiByteToWideChar(CP_UTF8, 0, utf8_text, -1, wtext, wlen) == 0) {
        HeapFree(GetProcessHeap(), 0, wtext);
        return ZLANG_ERR_ENCODING;
    }

    hr = openService(&services, &serviceCount);
    if (FAILED(hr) || serviceCount == 0) {
        HeapFree(GetProcessHeap(), 0, wtext);
        return ZLANG_ERR_UNAVAILABLE;
    }

    ZeroMemory(&bag, sizeof(bag));
    bag.Size = sizeof(MAPPING_PROPERTY_BAG);

    /* ELS nhận số ký tự KHÔNG kể NUL. */
    hr = MappingRecognizeText(&services[0], wtext, (DWORD)(wlen - 1), 0, NULL, &bag);

    if (SUCCEEDED(hr) && bag.dwRangesCount > 0 && bag.prgResultRanges[0].pData != NULL) {
        /*
         * pData là chuỗi các thẻ BCP 47, mỗi thẻ kết thúc bằng NUL, hết danh
         * sách là NUL kép, đã xếp theo mức độ khả năng giảm dần.
         */
        const WCHAR *data = (const WCHAR *)bag.prgResultRanges[0].pData;
        const size_t maxChars = (size_t)bag.prgResultRanges[0].dwDataSize / sizeof(WCHAR);
        size_t offset = 0;

        while (offset < maxChars && data[offset] != L'\0' && (uint32_t)written < max_out) {
            const WCHAR *tag = data + offset;
            const size_t tagChars = wcsnlen(tag, maxChars - offset);
            const int bytes = WideCharToMultiByte(
                CP_UTF8, 0, tag, (int)tagChars, out[written].tag, ZLANG_TAG_CAP - 1, NULL, NULL);

            if (bytes > 0) {
                out[written].tag[bytes] = '\0';
                /* ELS không cho điểm — xem đầu file. */
                out[written].confidence = ZLANG_NO_CONFIDENCE;
                written++;
            }
            offset += tagChars + 1;
        }

        result = written;
    } else if (FAILED(hr)) {
        result = ZLANG_ERR_BACKEND;
    }

    MappingFreePropertyBag(&bag);
    MappingFreeServices(services);
    HeapFree(GetProcessHeap(), 0, wtext);
    return result;
}
