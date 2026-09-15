//! Cầu nối sang backend của hệ điều hành.
//!
//! TOÀN BỘ `unsafe` của crate nằm trong file này. Tầng napi ở lib.rs chỉ thấy
//! `available()`, `score_kind()`, `detect()` với kiểu Rust thuần.
//!
//! Mọi hằng ở đây là bản chép tay của src/zlang_bridge.h. Rust không đọc file
//! header đó — không có gì kiểm tra hộ. Sửa một bên thì phải sửa bên kia.

use napi::{Error, Result, Status};

/// Khớp ZLANG_MAX_RESULTS trong src/zlang_bridge.h.
///
/// Đây là SỨC CHỨA của buffer, không phải một lựa chọn về số kết quả nên trả.
/// Caller không chỉ định thì dùng đúng con số này — xin tất cả những gì đựng
/// được — chứ module không tự đặt ra một mức "hợp lý" nào.
pub const MAX_RESULTS: u32 = 16;

/// Khớp ZLANG_TAG_CAP trong src/zlang_bridge.h.
const TAG_CAP: usize = 24;

/// Một giả thuyết: (thẻ BCP 47, độ tin cậy 0..1).
///
/// `None` khi backend không cho điểm — không thay bằng một con số suy ra, vì đó
/// là dữ liệu OS không hề cung cấp. Thứ tự phần tử giữ nguyên thông tin hạng.
pub type Hypothesis = (String, Option<f64>);

#[cfg(any(target_os = "macos", target_os = "windows"))]
mod ffi {
    use std::os::raw::{c_char, c_int};

    /// Bản sao của ZlangHypothesis trong src/zlang_bridge.h.
    ///
    /// `#[repr(C)]` là lời hứa của rustc: xếp byte y hệt cách một compiler C xếp
    /// struct tương ứng — tag ở byte 0..23, confidence ở byte 24..31.
    /// Không có `repr(C)` thì rustc được tự do đảo thứ tự field và mọi thứ vỡ.
    #[repr(C)]
    #[derive(Clone, Copy)]
    pub struct RawHypothesis {
        pub tag: [c_char; super::TAG_CAP],
        pub confidence: f64,
    }

    impl RawHypothesis {
        /// Ô chưa ghi. `confidence` là NaN (ZLANG_NO_CONFIDENCE trong header),
        /// không phải 0.0: bridge quên điền thì kết quả là "không có điểm" chứ
        /// không phải "điểm bằng 0".
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
            max_results: u32,
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
    // Bridge trả về chuỗi tĩnh, sống hết đời tiến trình — không giải phóng.
    unsafe { std::ffi::CStr::from_ptr(ptr) }
        .to_str()
        .unwrap_or("unknown")
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn score_kind() -> &'static str {
    "none"
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
pub fn detect(text: &str, max_results: Option<u32>) -> Result<Vec<Hypothesis>> {
    use std::ffi::{CStr, CString};

    // Không truyền -> xin hết sức chứa buffer. MAX_RESULTS là giới hạn cấu trúc,
    // không phải một mức "hợp lý" do module tự chọn.
    let max_out = max_results.unwrap_or(MAX_RESULTS).clamp(1, MAX_RESULTS);

    // Chuỗi có NUL ở giữa không đi qua được C ABI — bên kia sẽ tưởng chuỗi hết
    // ở đó. Báo lỗi rõ thay vì cắt ngầm.
    let c_text = CString::new(text)
        .map_err(|_| Error::new(Status::InvalidArg, "zlang: text chứa byte NUL"))?;

    // Mảng nằm trên stack: bridge không cấp phát gì, nên không có quy ước "ai
    // giải phóng" nào để làm sai.
    let mut buffer = [ffi::RawHypothesis::unset(); MAX_RESULTS as usize];

    let written =
        unsafe { ffi::zlang_bridge_detect(c_text.as_ptr(), max_out, buffer.as_mut_ptr()) };

    /*
     * `c_text` PHẢI còn sống tới đúng đây. Bridge chỉ mượn con trỏ chứ không
     * copy, mà rustc không theo dõi vòng đời qua `as_ptr()` — thả sớm là con trỏ
     * thành rác ngay trước khi Swift đọc, và đây là loại lỗi chỉ hiện lúc chạy.
     * Giữ dòng drop tường minh để người đọc thấy vì sao nó chưa bị thu hồi.
     */
    drop(c_text);

    if written < 0 {
        return Err(Error::new(
            Status::GenericFailure,
            format!("zlang: backend {} lỗi (code {})", name(), written),
        ));
    }

    // Tin số bridge trả về, nhưng vẫn chặn theo sức chứa đã cấp.
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
pub fn detect(_text: &str, _max_results: Option<u32>) -> Result<Vec<Hypothesis>> {
    Err(Error::new(
        Status::GenericFailure,
        "zlang: không có backend nhận diện ngôn ngữ trên hệ điều hành này",
    ))
}
