//! Cầu nối sang backend của hệ điều hành.
//!
//! Toàn bộ `unsafe` của crate nằm trong file này. Tầng napi ở lib.rs chỉ thấy
//! `available()`, `score_kind()`, `detect()` với kiểu Rust thuần.

use napi::{Error, Result, Status};

/// Số giả thuyết trả về khi caller không chỉ định.
pub const DEFAULT_MAX_RESULTS: u32 = 3;

/// Khớp ZLANG_MAX_RESULTS trong src/zlang_bridge.h.
pub const MAX_RESULTS: u32 = 16;

/// Khớp ZLANG_TAG_CAP trong src/zlang_bridge.h.
const TAG_CAP: usize = 24;

/// Một giả thuyết: (thẻ BCP 47, độ tin cậy 0..1).
///
/// `None` khi backend không cho điểm (ELS chỉ xếp hạng) — không thay bằng một
/// con số suy ra, vì đó là dữ liệu OS không hề cung cấp. Thứ tự phần tử giữ
/// nguyên thông tin hạng.
pub type Hypothesis = (String, Option<f64>);

#[cfg(any(target_os = "macos", target_os = "windows"))]
mod ffi {
    use std::os::raw::{c_char, c_int};

    #[repr(C)]
    #[derive(Clone, Copy)]
    pub struct RawHypothesis {
        pub tag: [c_char; super::TAG_CAP],
        pub confidence: f64,
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
        pub fn zlang_bridge_detect(
            utf8_text: *const c_char,
            max_out: u32,
            out: *mut RawHypothesis,
        ) -> c_int;
    }
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
pub fn detect(text: &str, max_results: u32) -> Result<Vec<Hypothesis>> {
    use std::ffi::{CStr, CString};

    let max_out = max_results.clamp(1, MAX_RESULTS);

    // Chuỗi có NUL ở giữa không thể đi qua C ABI; báo lỗi rõ thay vì cắt ngầm.
    let c_text = CString::new(text)
        .map_err(|_| Error::new(Status::InvalidArg, "zlang: text chứa byte NUL"))?;

    let mut buffer = [ffi::RawHypothesis::unset(); MAX_RESULTS as usize];
    let written = unsafe {
        ffi::zlang_bridge_detect(c_text.as_ptr(), max_out, buffer.as_mut_ptr())
    };

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
    Ok(out)
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn detect(_text: &str, _max_results: u32) -> Result<Vec<Hypothesis>> {
    Err(Error::new(
        Status::GenericFailure,
        "zlang: không có backend nhận diện ngôn ngữ trên hệ điều hành này",
    ))
}
