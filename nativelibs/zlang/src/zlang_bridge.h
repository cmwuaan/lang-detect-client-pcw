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
    ZLANG_ERR_ENCODING = -4
};

/* Backend của OS có dùng được ở tiến trình này không. */
bool zlang_bridge_available(void);

/*
 * "probability" — backend trả về xác suất thật của model.
 * "rank"        — backend chỉ trả về thứ tự; confidence là ZLANG_NO_CONFIDENCE.
 * Chuỗi tĩnh, caller KHÔNG giải phóng.
 */
const char *zlang_bridge_score_kind(void);

/*
 * Nhận diện ngôn ngữ của `utf8_text`.
 *
 * `out` phải chứa được `max_out` phần tử; `max_out` bị chặn ở ZLANG_MAX_RESULTS.
 * Trả về số phần tử đã ghi (có thể 0 khi văn bản quá ngắn/không xác định được),
 * hoặc một trong các mã ZLANG_ERR_* ở trên.
 */
int32_t zlang_bridge_detect(const char *utf8_text, uint32_t max_out, ZlangHypothesis *out);

#endif /* ZLANG_BRIDGE_H */
