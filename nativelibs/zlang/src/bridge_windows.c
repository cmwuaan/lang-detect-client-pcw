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
 * CHỖ VẶN ĐƯỢC của ELS nằm ở hai nơi, không nơi nào trùng với Apple:
 *
 *   MAPPING_ENUM_OPTIONS (bước chọn dịch vụ)
 *     OnlineService = 0    ép offline — bắt buộc, xem openService()
 *     pszInputLanguage     lọc dịch vụ theo ngôn ngữ đầu vào
 *     pszInputScript       lọc dịch vụ theo hệ chữ viết
 *   MappingRecognizeText
 *     dwIndex              bắt đầu đọc từ giữa văn bản
 *
 * KHÔNG CÓ: languageHints, và không có constraint áp lên KẾT QUẢ.
 * `pszInputLanguage` nghe giống `languageConstraints` của Apple nhưng khác hẳn —
 * nó chọn ENGINE, không lọc output.
 *
 * KHÔNG cache MAPPING_SERVICE_INFO giữa các lần gọi, dù tài liệu khuyên vậy:
 * detect() chạy trên libuv threadpool nên nhiều luồng vào đây cùng lúc, mà MSDN
 * không hứa MAPPING_SERVICE_INFO dùng chung được giữa các luồng. Muốn đổi thì
 * phải đo trên Windows thật trước, đừng suy diễn.
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

/* Chỉ có đúng một content type được ELS hỗ trợ cho Language Detection. */
static const WCHAR ELS_CATEGORY[] = L"Language Detection";
static const WCHAR ELS_CONTENT_TYPE[] = L"text/plain";

/* UTF-8 -> WCHAR cấp phát trên process heap; NULL khi input NULL/rỗng/hỏng. */
static WCHAR *toWide(const char *utf8) {
    int chars = 0;
    WCHAR *wide = NULL;

    if (utf8 == NULL || utf8[0] == '\0') return NULL;

    chars = MultiByteToWideChar(CP_UTF8, 0, utf8, -1, NULL, 0);
    if (chars <= 1) return NULL;

    wide = (WCHAR *)HeapAlloc(GetProcessHeap(), 0, (SIZE_T)chars * sizeof(WCHAR));
    if (wide == NULL) return NULL;

    if (MultiByteToWideChar(CP_UTF8, 0, utf8, -1, wide, chars) == 0) {
        HeapFree(GetProcessHeap(), 0, wide);
        return NULL;
    }
    return wide;
}

static void freeWide(WCHAR *wide) {
    if (wide != NULL) HeapFree(GetProcessHeap(), 0, wide);
}

/*
 * Lấy handle service language-detection; caller gọi MappingFreeServices.
 *
 * `OnlineService = 0` = chỉ lấy engine offline. ZeroMemory ở trên vốn đã đặt
 * bitfield này về 0, nên đây KHÔNG phải sửa lỗi — viết ra để cái ràng buộc quan
 * trọng nhất của module ("không cần mạng, không tải model") là một dòng code đọc
 * được, thay vì một hệ quả tình cờ của việc zero cả struct. Ai đó đổi sang khởi
 * tạo kiểu khác sẽ thấy ngay thứ phải giữ.
 *
 * `pszCategory` + `pszInputContentType` thu hẹp phép liệt kê đúng như tài liệu
 * ELS hướng dẫn; `pGuid` vẫn giữ để chốt đúng một dịch vụ.
 *
 * `inputLanguage`/`inputScript` lọc DỊCH VỤ chứ không lọc kết quả — xem
 * zlang_bridge.h. NULL nghĩa là không giới hạn.
 */
static HRESULT openService(const WCHAR *inputLanguage,
                           const WCHAR *inputScript,
                           MAPPING_SERVICE_INFO **services,
                           DWORD *count) {
    MAPPING_ENUM_OPTIONS options;
    ZeroMemory(&options, sizeof(options));
    options.Size = sizeof(MAPPING_ENUM_OPTIONS);
    options.pszCategory = (LPWSTR)ELS_CATEGORY;
    options.pszInputContentType = (LPWSTR)ELS_CONTENT_TYPE;
    options.pGuid = (GUID *)&ELS_GUID_LANGUAGE_DETECTION;
    options.pszInputLanguage = (LPWSTR)inputLanguage;
    options.pszInputScript = (LPWSTR)inputScript;
    options.OnlineService = 0;
    return MappingGetServices(&options, services, count);
}

bool zlang_bridge_available(void) {
    MAPPING_SERVICE_INFO *services = NULL;
    DWORD count = 0;

    if (FAILED(openService(NULL, NULL, &services, &count)) || count == 0) return false;
    MappingFreeServices(services);
    return true;
}

const char *zlang_bridge_score_kind(void) {
    return "rank";
}

/*
 * ELS cho vặn ba chỗ, đều KHÁC chỗ Apple cho vặn:
 *   input_language / input_script  lọc ở bước chọn dịch vụ (MAPPING_ENUM_OPTIONS)
 *   start_index                    đọc từ giữa văn bản (MappingRecognizeText.dwIndex)
 *
 * Không có: languageHints, languageConstraints áp lên kết quả, và không có
 * "ngôn ngữ trội" tách rời danh sách xếp hạng.
 */
uint32_t zlang_bridge_capabilities(void) {
    return ZLANG_CAP_INPUT_LANGUAGE | ZLANG_CAP_INPUT_SCRIPT | ZLANG_CAP_START_INDEX;
}

int32_t zlang_bridge_detect(const char *utf8_text,
                            const ZlangDetectOptions *options,
                            ZlangHypothesis *out,
                            char *dominant_out) {
    WCHAR *wtext = NULL;
    WCHAR *wInputLanguage = NULL;
    WCHAR *wInputScript = NULL;
    int wlen = 0;
    DWORD textChars = 0;
    uint32_t max_out = 0;
    MAPPING_SERVICE_INFO *services = NULL;
    DWORD serviceCount = 0;
    MAPPING_PROPERTY_BAG bag;
    HRESULT hr = S_OK;
    int32_t written = 0;
    int32_t result = 0;

    if (utf8_text == NULL || options == NULL || out == NULL || dominant_out == NULL) {
        return ZLANG_ERR_BAD_ARG;
    }

    /* ELS không có khái niệm "ngôn ngữ trội" tách rời danh sách — xem
       zlang_bridge_capabilities(). Luôn để rỗng. */
    dominant_out[0] = '\0';

    /* Nhận option mà lặng lẽ bỏ qua thì caller tưởng nó có hiệu lực. Báo lỗi. */
    if (options->constraint_count > 0 || options->hint_count > 0) {
        return ZLANG_ERR_UNSUPPORTED_OPTION;
    }

    max_out = options->max_results;
    if (max_out == 0) return ZLANG_ERR_BAD_ARG;
    if (max_out > ZLANG_MAX_RESULTS) max_out = ZLANG_MAX_RESULTS;

    /* wlen tính cả NUL kết thúc; <= 1 nghĩa là chuỗi rỗng. */
    wlen = MultiByteToWideChar(CP_UTF8, 0, utf8_text, -1, NULL, 0);
    if (wlen <= 1) return 0;
    textChars = (DWORD)(wlen - 1);

    /*
     * dwIndex nằm ngoài văn bản thì không còn gì để đọc. Trả 0 (không kết luận
     * được) chứ không phải lỗi: đó là kết quả hợp lệ, giống như văn bản rỗng.
     */
    if (options->start_index >= textChars) return 0;

    wtext = (WCHAR *)HeapAlloc(GetProcessHeap(), 0, (SIZE_T)wlen * sizeof(WCHAR));
    if (wtext == NULL) return ZLANG_ERR_BACKEND;

    if (MultiByteToWideChar(CP_UTF8, 0, utf8_text, -1, wtext, wlen) == 0) {
        HeapFree(GetProcessHeap(), 0, wtext);
        return ZLANG_ERR_ENCODING;
    }

    /*
     * Thẻ lọc hỏng (không phải UTF-8 hợp lệ) cho ra NULL, mà NULL lại đúng bằng
     * "không giới hạn" — im lặng nới lỏng bộ lọc caller đặt ra. Chặn ở đây.
     */
    if (options->input_language != NULL && options->input_language[0] != '\0') {
        wInputLanguage = toWide(options->input_language);
        if (wInputLanguage == NULL) {
            HeapFree(GetProcessHeap(), 0, wtext);
            return ZLANG_ERR_ENCODING;
        }
    }
    if (options->input_script != NULL && options->input_script[0] != '\0') {
        wInputScript = toWide(options->input_script);
        if (wInputScript == NULL) {
            freeWide(wInputLanguage);
            HeapFree(GetProcessHeap(), 0, wtext);
            return ZLANG_ERR_ENCODING;
        }
    }

    hr = openService(wInputLanguage, wInputScript, &services, &serviceCount);
    freeWide(wInputLanguage);
    freeWide(wInputScript);

    if (FAILED(hr) || serviceCount == 0) {
        HeapFree(GetProcessHeap(), 0, wtext);
        return ZLANG_ERR_UNAVAILABLE;
    }

    ZeroMemory(&bag, sizeof(bag));
    bag.Size = sizeof(MAPPING_PROPERTY_BAG);

    /* ELS nhận số ký tự KHÔNG kể NUL; dwIndex là vị trí bắt đầu đọc. */
    hr = MappingRecognizeText(
        &services[0], wtext, textChars, (DWORD)options->start_index, NULL, &bag);

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
