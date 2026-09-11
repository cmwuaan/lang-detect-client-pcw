/*
 * ABI duy nhất giữa Rust và backend của hệ điều hành.
 *
 * Cùng một header cho macOS (Apple NaturalLanguage) và Windows (Extended
 * Linguistic Services). Rust chỉ biết ba hàm dưới đây, nên thêm backend mới
 * không phải sửa gì ở tầng Rust hay JS.
 *
 * Không cấp phát động: caller đưa sẵn mảng `out`, bridge ghi vào rồi trả về số
 * phần tử đã ghi. Nhờ vậy không có quy ước "ai giải phóng bộ nhớ" nào để làm
 * sai, và không có free() nào chạy qua biên FFI.
 */

#ifndef ZLANG_BRIDGE_H
#define ZLANG_BRIDGE_H

#include <math.h>
#include <stdbool.h>
#include <stdint.h>

/* Đủ cho mọi thẻ BCP 47 mà hai backend trả về ('vi', 'zh-Hant', 'sr-Cyrl-RS'). */
#define ZLANG_TAG_CAP 24

/* Trần cứng, để mảng `out` luôn nằm trên stack của Rust. */
#define ZLANG_MAX_RESULTS 16

/*
 * Backend KHÔNG cho điểm (ELS chỉ xếp hạng) thì ghi giá trị này vào `confidence`.
 *
 * Bridge không bịa ra con số: tầng trên đọc NaN và dịch thành `null`, còn thứ tự
 * phần tử vẫn mang đủ thông tin hạng. NaN chứ không phải 0.0 vì 0.0 là một độ
 * tin cậy hợp lệ — và vì buffer chưa ghi cũng được khởi tạo bằng NaN, quên điền
 * sẽ ra `null` chứ không ra một con số sai.
 */
#define ZLANG_NO_CONFIDENCE ((double)NAN)

typedef struct {
    /* Thẻ BCP 47, kết thúc bằng NUL. Rỗng nghĩa là slot không dùng. */
    char tag[ZLANG_TAG_CAP];
    /*
     * 0..1 khi backend cho điểm thật, hoặc ZLANG_NO_CONFIDENCE khi không.
     * Mảng luôn đã sắp giảm dần theo mức độ khả năng, kể cả khi không có điểm.
     * Xem zlang_bridge_score_kind().
     */
    double confidence;
} ZlangHypothesis;

/*
 * Mã lỗi trả về từ zlang_bridge_detect(); số >= 0 là số phần tử đã ghi.
 *
 * Dùng enum chứ không #define: Swift import enum thành hằng Int32 một cách
 * tin cậy, còn macro dạng `(-1)` thì không chắc được import.
 */
enum {
    ZLANG_ERR_BAD_ARG = -1,
    ZLANG_ERR_UNAVAILABLE = -2,
    ZLANG_ERR_BACKEND = -3,
    ZLANG_ERR_ENCODING = -4,
    /*
     * Caller đưa option mà backend này không có khái niệm tương đương.
     * KHÔNG bỏ qua im lặng: caller đặt constraint rồi tưởng nó có hiệu lực là
     * sai nguy hiểm hơn nhiều so với một lỗi rõ ràng. Hỏi trước bằng
     * zlang_bridge_capabilities().
     */
    ZLANG_ERR_UNSUPPORTED_OPTION = -5
};

/*
 * Bitmask: backend hiểu được option nào.
 *
 * Hai nhóm option KHÔNG giao nhau, vì hai OS cho những chỗ vặn khác hẳn nhau:
 * Apple cho can thiệp vào chính bộ nhận diện (constraints/hints), còn ELS chỉ
 * cho lọc ở bước CHỌN DỊCH VỤ (input_language/input_script) và cho bắt đầu đọc
 * từ giữa văn bản (start_index). Không cái nào giả lập được cái kia, nên mỗi
 * cái có cờ riêng thay vì ép chung một tên.
 */
enum {
    ZLANG_CAP_CONSTRAINTS = 1u << 0,
    ZLANG_CAP_HINTS = 1u << 1,
    ZLANG_CAP_DOMINANT = 1u << 2,
    ZLANG_CAP_INPUT_LANGUAGE = 1u << 3,
    ZLANG_CAP_INPUT_SCRIPT = 1u << 4,
    ZLANG_CAP_START_INDEX = 1u << 5
};

/* Một ngôn ngữ kèm trọng số, dùng cho languageHints. */
typedef struct {
    /* Thẻ BCP 47, NUL-terminated. Caller sở hữu, bridge chỉ đọc. */
    const char *tag;
    double weight;
} ZlangLanguageHint;

/*
 * Option điều khiển kết quả, ánh xạ 1-1 sang property của NLLanguageRecognizer.
 * Mảng do caller cấp và sở hữu, phải sống hết lời gọi — không copy qua biên FFI.
 */
typedef struct {
    /* Số giả thuyết tối đa; bị chặn ở ZLANG_MAX_RESULTS. Mọi backend đều hiểu. */
    uint32_t max_results;

    /* --- Apple NaturalLanguage --- */

    /* NLLanguageRecognizer.languageConstraints — NULL/0 nghĩa là không giới hạn. */
    const char *const *constraints;
    uint32_t constraint_count;

    /* NLLanguageRecognizer.languageHints — prior của caller. */
    const ZlangLanguageHint *hints;
    uint32_t hint_count;

    /* --- Windows ELS --- */

    /*
     * MAPPING_ENUM_OPTIONS.pszInputLanguage — thẻ IETF, NULL = không giới hạn.
     *
     * Lọc ở bước CHỌN DỊCH VỤ, KHÔNG lọc kết quả trả về: nó nói "chỉ lấy engine
     * nào nhận được ngôn ngữ đầu vào này", chứ không phải "chỉ trả về ngôn ngữ
     * này". Đây là lý do nó không được gộp chung với `constraints` của Apple.
     */
    const char *input_language;

    /* MAPPING_ENUM_OPTIONS.pszInputScript — NULL = không giới hạn. Cũng lọc dịch vụ. */
    const char *input_script;

    /*
     * MappingRecognizeText.dwIndex — vị trí ký tự bắt đầu đọc trong văn bản.
     * 0 = đọc từ đầu. Tính theo ký tự UTF-16, không phải byte.
     */
    uint32_t start_index;
} ZlangDetectOptions;

/* Backend của OS có dùng được ở tiến trình này không. */
bool zlang_bridge_available(void);

/*
 * "probability" — backend trả về xác suất thật của model.
 * "rank"        — backend chỉ trả về thứ tự; confidence là ZLANG_NO_CONFIDENCE.
 * Chuỗi tĩnh, caller KHÔNG giải phóng.
 */
const char *zlang_bridge_score_kind(void);

/* Bitmask ZLANG_CAP_* mà backend này hỗ trợ. */
uint32_t zlang_bridge_capabilities(void);

/*
 * Nhận diện ngôn ngữ của `utf8_text`.
 *
 * `out` phải chứa được `options->max_results` phần tử.
 *
 * `dominant_out` trỏ tới ZLANG_TAG_CAP byte; bridge luôn NUL-terminate, ghi
 * chuỗi rỗng khi backend không có khái niệm "ngôn ngữ trội" tách rời danh sách
 * giả thuyết. Không được NULL.
 *
 * Trả về số phần tử đã ghi (có thể 0 khi văn bản quá ngắn/không xác định được),
 * hoặc một trong các mã ZLANG_ERR_* ở trên.
 */
int32_t zlang_bridge_detect(const char *utf8_text,
                            const ZlangDetectOptions *options,
                            ZlangHypothesis *out,
                            char *dominant_out);

#endif /* ZLANG_BRIDGE_H */
