//! Cầu nối sang backend của hệ điều hành.
//!
//! Toàn bộ `unsafe` của crate nằm trong file này. Tầng napi ở lib.rs chỉ thấy
//! `available()`, `score_kind()`, `detect()` với kiểu Rust thuần.

use napi::{Error, Result, Status};

/// Khớp ZLANG_MAX_RESULTS trong src/zlang_bridge.h.
///
/// Đây là SỨC CHỨA của buffer, không phải một lựa chọn về số kết quả nên trả.
/// Caller không chỉ định `max_results` thì dùng đúng con số này — xin tất cả
/// những gì đựng được — chứ module không tự đặt ra một mức "hợp lý" nào.
pub const MAX_RESULTS: u32 = 16;

/// Khớp ZLANG_TAG_CAP trong src/zlang_bridge.h.
const TAG_CAP: usize = 24;

/// Một giả thuyết: (thẻ BCP 47, độ tin cậy 0..1).
///
/// `None` khi backend không cho điểm (ELS chỉ xếp hạng) — không thay bằng một
/// con số suy ra, vì đó là dữ liệu OS không hề cung cấp. Thứ tự phần tử giữ
/// nguyên thông tin hạng.
pub type Hypothesis = (String, Option<f64>);

/// Option điều khiển kết quả — ánh xạ 1-1 sang API của OS, không tự đặt mặc định.
///
/// Mọi field đều `Option`/rỗng khi caller không truyền, và bridge chỉ set thứ gì
/// thật sự có giá trị: không truyền `constraints` thì `languageConstraints`
/// không được đụng tới, không truyền `input_language` thì `pszInputLanguage` là
/// NULL. Mặc định là mặc định CỦA OS, không phải của module này.
#[derive(Default)]
pub struct DetectOptions {
    /// `None` = xin tối đa sức chứa buffer (MAX_RESULTS), không phải một mức
    /// "hợp lý" do module tự nghĩ ra.
    pub max_results: Option<u32>,

    // --- Apple NaturalLanguage ---
    /// `languageConstraints`: chỉ xét các thẻ BCP 47 này.
    pub constraints: Vec<String>,
    /// `languageHints`: prior của caller, (thẻ BCP 47, trọng số).
    pub hints: Vec<(String, f64)>,

    // --- Windows ELS ---
    /// `MAPPING_ENUM_OPTIONS.pszInputLanguage` — lọc DỊCH VỤ, không lọc kết quả.
    pub input_language: Option<String>,
    /// `MAPPING_ENUM_OPTIONS.pszInputScript` — cũng lọc dịch vụ.
    pub input_script: Option<String>,
    /// `MappingRecognizeText.dwIndex` — vị trí ký tự bắt đầu đọc.
    pub start_index: Option<u32>,
}

/// Kết quả một lần detect.
pub struct Detection {
    pub hypotheses: Vec<Hypothesis>,
    /// `NLLanguageRecognizer.dominantLanguage`; None khi backend không có khái
    /// niệm đó (ELS) hoặc không kết luận được.
    pub dominant: Option<String>,
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
mod ffi {
    use std::os::raw::{c_char, c_int};

    #[repr(C)]
    #[derive(Clone, Copy)]
    pub struct RawHypothesis {
        pub tag: [c_char; super::TAG_CAP],
        pub confidence: f64,
    }

    #[repr(C)]
    pub struct RawLanguageHint {
        pub tag: *const c_char,
        pub weight: f64,
    }

    #[repr(C)]
    pub struct RawDetectOptions {
        pub max_results: u32,
        pub constraints: *const *const c_char,
        pub constraint_count: u32,
        pub hints: *const RawLanguageHint,
        pub hint_count: u32,
        pub input_language: *const c_char,
        pub input_script: *const c_char,
        pub start_index: u32,
    }

    impl RawHypothesis {
        /// Slot chưa ghi. `confidence` là NaN (ZLANG_NO_CONFIDENCE trong
        /// zlang_bridge.h), không phải 0.0: bridge quên điền thì kết quả là
        /// "không có điểm" chứ không phải "điểm bằng 0".
        pub fn unset() -> Self {
            RawHypothesis {
                tag: [0; super::TAG_CAP],
                confidence: f64::NAN,
            }
        }
    }

    extern "C" {
        pub fn zlang_bridge_available() -> bool;
        pub fn zlang_bridge_score_kind() -> *const c_char;
        pub fn zlang_bridge_capabilities() -> u32;
        pub fn zlang_bridge_detect(
            utf8_text: *const c_char,
            options: *const RawDetectOptions,
            out: *mut RawHypothesis,
            dominant_out: *mut c_char,
        ) -> c_int;
    }
}

/// Khớp ZLANG_CAP_* trong src/zlang_bridge.h.
pub const CAP_CONSTRAINTS: u32 = 1 << 0;
pub const CAP_HINTS: u32 = 1 << 1;
pub const CAP_DOMINANT: u32 = 1 << 2;
pub const CAP_INPUT_LANGUAGE: u32 = 1 << 3;
pub const CAP_INPUT_SCRIPT: u32 = 1 << 4;
pub const CAP_START_INDEX: u32 = 1 << 5;

/// Khớp ZLANG_ERR_UNSUPPORTED_OPTION.
const ERR_UNSUPPORTED_OPTION: i32 = -5;

#[cfg(any(target_os = "macos", target_os = "windows"))]
pub fn capabilities() -> u32 {
    unsafe { ffi::zlang_bridge_capabilities() }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn capabilities() -> u32 {
    0
}

/// Tên backend, để chẩn đoán và để log.
pub fn name() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "apple-nl"
    }
    #[cfg(target_os = "windows")]
    {
        "windows-els"
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        "none"
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
pub fn available() -> bool {
    unsafe { ffi::zlang_bridge_available() }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn available() -> bool {
    false
}

/// `"probability"` khi backend cho xác suất thật, `"rank"` khi chỉ cho thứ hạng.
#[cfg(any(target_os = "macos", target_os = "windows"))]
pub fn score_kind() -> &'static str {
    let ptr = unsafe { ffi::zlang_bridge_score_kind() };
    if ptr.is_null() {
        return "unknown";
    }
    // Bridge trả về string literal tĩnh, sống hết đời tiến trình.
    unsafe { std::ffi::CStr::from_ptr(ptr) }
        .to_str()
        .unwrap_or("unknown")
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn score_kind() -> &'static str {
    "none"
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
pub fn detect(text: &str, options: DetectOptions) -> Result<Detection> {
    use std::ffi::{CStr, CString};
    use std::os::raw::c_char;

    // Không truyền -> xin hết sức chứa buffer. MAX_RESULTS là giới hạn cấu trúc,
    // không phải một mức "hợp lý" do module tự chọn.
    let max_out = options.max_results.unwrap_or(MAX_RESULTS).clamp(1, MAX_RESULTS);

    // Chuỗi có NUL ở giữa không thể đi qua C ABI; báo lỗi rõ thay vì cắt ngầm.
    let c_text = CString::new(text)
        .map_err(|_| Error::new(Status::InvalidArg, "zlang: text chứa byte NUL"))?;

    // None -> con trỏ NULL = "không giới hạn" theo hợp đồng ELS.
    let c_input_language = to_optional_cstring(&options.input_language, "inputLanguage")?;
    let c_input_script = to_optional_cstring(&options.input_script, "inputScript")?;

    /*
     * CString phải sống tới hết lời gọi — bridge chỉ mượn con trỏ, không copy
     * (xem hợp đồng ở zlang_bridge.h). Giữ `_constraint_owned`/`_hint_owned` là
     * để đúng chuyện đó: bỏ chúng đi thì con trỏ trong mảng thành dangling
     * NGAY trước khi gọi, và đây là loại lỗi chỉ hiện ra lúc chạy.
     */
    let constraint_owned = to_cstrings(&options.constraints, "constraints")?;
    let constraint_ptrs: Vec<*const c_char> =
        constraint_owned.iter().map(|s| s.as_ptr()).collect();

    let hint_tags: Vec<String> = options.hints.iter().map(|(t, _)| t.clone()).collect();
    let hint_owned = to_cstrings(&hint_tags, "hints")?;
    let hint_entries: Vec<ffi::RawLanguageHint> = hint_owned
        .iter()
        .zip(options.hints.iter())
        .map(|(tag, (_, weight))| ffi::RawLanguageHint {
            tag: tag.as_ptr(),
            weight: *weight,
        })
        .collect();

    let raw_options = ffi::RawDetectOptions {
        max_results: max_out,
        constraints: if constraint_ptrs.is_empty() {
            std::ptr::null()
        } else {
            constraint_ptrs.as_ptr()
        },
        constraint_count: constraint_ptrs.len() as u32,
        hints: if hint_entries.is_empty() {
            std::ptr::null()
        } else {
            hint_entries.as_ptr()
        },
        hint_count: hint_entries.len() as u32,
        input_language: c_input_language
            .as_ref()
            .map_or(std::ptr::null(), |s| s.as_ptr()),
        input_script: c_input_script
            .as_ref()
            .map_or(std::ptr::null(), |s| s.as_ptr()),
        // 0 = đọc từ đầu, đúng mặc định của MappingRecognizeText.
        start_index: options.start_index.unwrap_or(0),
    };

    let mut buffer = [ffi::RawHypothesis::unset(); MAX_RESULTS as usize];
    let mut dominant_buf = [0 as c_char; TAG_CAP];

    let written = unsafe {
        ffi::zlang_bridge_detect(
            c_text.as_ptr(),
            &raw_options,
            buffer.as_mut_ptr(),
            dominant_buf.as_mut_ptr(),
        )
    };

    // Giữ tường minh tới đây để người đọc thấy vì sao chúng chưa bị drop.
    drop(constraint_owned);
    drop(hint_owned);
    drop(c_input_language);
    drop(c_input_script);

    if written == ERR_UNSUPPORTED_OPTION {
        return Err(Error::new(
            Status::InvalidArg,
            format!(
                "zlang: backend {} không hỗ trợ một trong các option vừa truyền \
                 — hỏi info().capabilities trước",
                name()
            ),
        ));
    }

    if written < 0 {
        return Err(Error::new(
            Status::GenericFailure,
            format!("zlang: backend {} lỗi (code {})", name(), written),
        ));
    }

    let count = (written as usize).min(max_out as usize);
    let mut out = Vec::with_capacity(count);
    for slot in buffer.iter().take(count) {
        // Bridge luôn NUL-terminate trong TAG_CAP byte.
        let tag = unsafe { CStr::from_ptr(slot.tag.as_ptr()) }
            .to_string_lossy()
            .into_owned();
        if tag.is_empty() {
            continue;
        }
        // NaN = ZLANG_NO_CONFIDENCE: backend không cho điểm.
        let confidence = if slot.confidence.is_nan() {
            None
        } else {
            Some(slot.confidence)
        };
        out.push((tag, confidence));
    }

    // Bridge ghi chuỗi rỗng khi không có ngôn ngữ trội.
    let dominant = unsafe { CStr::from_ptr(dominant_buf.as_ptr()) }
        .to_string_lossy()
        .into_owned();

    Ok(Detection {
        hypotheses: out,
        dominant: if dominant.is_empty() {
            None
        } else {
            Some(dominant)
        },
    })
}

/// `None`/rỗng -> `None` (bridge nhận NULL = không giới hạn), không tự thay giá trị.
#[cfg(any(target_os = "macos", target_os = "windows"))]
fn to_optional_cstring(
    value: &Option<String>,
    field: &str,
) -> Result<Option<std::ffi::CString>> {
    match value {
        None => Ok(None),
        Some(text) if text.is_empty() => Ok(None),
        Some(text) => std::ffi::CString::new(text.as_str())
            .map(Some)
            .map_err(|_| {
                Error::new(
                    Status::InvalidArg,
                    format!("zlang: {} chứa byte NUL", field),
                )
            }),
    }
}

/// Thẻ ngôn ngữ chứa NUL không đi qua được C ABI — báo lỗi rõ thay vì cắt ngầm.
#[cfg(any(target_os = "macos", target_os = "windows"))]
fn to_cstrings(values: &[String], field: &str) -> Result<Vec<std::ffi::CString>> {
    values
        .iter()
        .map(|value| {
            std::ffi::CString::new(value.as_str()).map_err(|_| {
                Error::new(
                    Status::InvalidArg,
                    format!("zlang: {} chứa byte NUL", field),
                )
            })
        })
        .collect()
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn detect(_text: &str, _options: DetectOptions) -> Result<Detection> {
    Err(Error::new(
        Status::GenericFailure,
        "zlang: không có backend nhận diện ngôn ngữ trên hệ điều hành này",
    ))
}
