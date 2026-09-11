//! zlang — nhận diện ngôn ngữ bằng model có sẵn trong hệ điều hành.
//!
//! macOS  : Apple NaturalLanguage (NLLanguageRecognizer) — xác suất thật.
//! Windows: Extended Linguistic Services, Microsoft Language Detection — xếp hạng.
//!
//! Bề mặt napi cố tình mỏng: mọi lời gọi vào OS nằm ở `backend`, mọi quyết định
//! về hình dạng dữ liệu cho UI nằm ở facade TypeScript (index.ts). Tầng này chỉ
//! đưa việc nhận diện ra khỏi luồng JS và chuyển tiếp option của caller.

#![deny(clippy::all)]

use napi::bindgen_prelude::AsyncTask;
use napi::{Env, Result, Task};
use napi_derive::napi;

mod backend;

/// Một giả thuyết ngôn ngữ. Tên field cố ý một từ để không phụ thuộc quy tắc
/// đổi snake_case sang camelCase của napi; facade TS đặt tên công khai.
#[napi(object)]
pub struct Hypothesis {
    /// Thẻ BCP 47: 'vi', 'en', 'zh-Hant'…
    pub tag: String,
    /// 0..1 khi backend cho điểm thật, `null` khi không (ELS chỉ xếp hạng).
    /// Mảng luôn đã sắp giảm dần. Ý nghĩa con số: xem `scoreKind()`.
    pub confidence: Option<f64>,
}

/// Prior của caller cho một ngôn ngữ — `NLLanguageRecognizer.languageHints`.
#[napi(object)]
pub struct LanguageHint {
    pub tag: String,
    pub weight: f64,
}

/// Option điều khiển kết quả, ánh xạ thẳng sang API của OS.
///
/// Không truyền field nào thì OS giữ mặc định CỦA NÓ — module không tự đặt ra
/// giá trị nào. Backend không hiểu option nào thì `detect()` ném lỗi chứ không
/// bỏ qua im lặng; hỏi `capabilities()` trước.
#[napi(object)]
pub struct DetectOptions {
    /// Số giả thuyết tối đa, chặn trong 1..16. Không truyền = xin tối đa.
    pub max_results: Option<u32>,

    // --- Apple NaturalLanguage ---
    /// `languageConstraints`: chỉ xét các thẻ BCP 47 này.
    pub constraints: Option<Vec<String>>,
    /// `languageHints`: prior, tag kèm trọng số.
    pub hints: Option<Vec<LanguageHint>>,

    // --- Windows ELS ---
    /// `MAPPING_ENUM_OPTIONS.pszInputLanguage` — lọc DỊCH VỤ, không lọc kết quả.
    pub input_language: Option<String>,
    /// `MAPPING_ENUM_OPTIONS.pszInputScript` — cũng lọc dịch vụ.
    pub input_script: Option<String>,
    /// `MappingRecognizeText.dwIndex` — vị trí ký tự bắt đầu đọc.
    pub start_index: Option<u32>,
}

/// Kết quả một lần detect.
#[napi(object)]
pub struct Detection {
    pub hypotheses: Vec<Hypothesis>,
    /// `NLLanguageRecognizer.dominantLanguage`. `null` khi backend không có
    /// khái niệm đó (ELS) hoặc model không kết luận được.
    pub dominant: Option<String>,
}

/// Backend hiểu được option nào — hỏi trước khi truyền, để khỏi ăn lỗi.
#[napi(object)]
pub struct Capabilities {
    /// `languageConstraints` dùng được không. (macOS)
    pub constraints: bool,
    /// `languageHints` dùng được không. (macOS)
    pub hints: bool,
    /// Có trả về `dominant` không. (macOS)
    pub dominant: bool,
    /// `inputLanguage` dùng được không. (Windows/ELS)
    pub input_language: bool,
    /// `inputScript` dùng được không. (Windows/ELS)
    pub input_script: bool,
    /// `startIndex` dùng được không. (Windows/ELS)
    pub start_index: bool,
}

/// Chạy trên libuv threadpool, không chiếm luồng JS của main process.
pub struct DetectTask {
    text: String,
    options: backend::DetectOptions,
}

impl Task for DetectTask {
    type Output = backend::Detection;
    type JsValue = Detection;

    fn compute(&mut self) -> Result<Self::Output> {
        backend::detect(&self.text, std::mem::take(&mut self.options))
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(Detection {
            hypotheses: output
                .hypotheses
                .into_iter()
                .map(|(tag, confidence)| Hypothesis { tag, confidence })
                .collect(),
            dominant: output.dominant,
        })
    }
}

/// Tên hệ điều hành mà binding này được build cho — chẩn đoán.
#[napi]
pub fn platform() -> String {
    std::env::consts::OS.to_string()
}

/// Version của crate — chẩn đoán.
#[napi]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Backend đang dùng: 'apple-nl' | 'windows-els' | 'none'.
#[napi]
pub fn backend() -> String {
    backend::name().to_string()
}

/// Backend của OS có dùng được trong tiến trình này không.
#[napi]
pub fn available() -> bool {
    backend::available()
}

/// 'probability' khi con số là xác suất của model; 'rank' khi chỉ suy ra từ thứ hạng.
#[napi]
pub fn scores() -> String {
    backend::score_kind().to_string()
}

/// Option nào backend này thật sự hiểu.
#[napi]
pub fn capabilities() -> Capabilities {
    let bits = backend::capabilities();
    Capabilities {
        constraints: bits & backend::CAP_CONSTRAINTS != 0,
        hints: bits & backend::CAP_HINTS != 0,
        dominant: bits & backend::CAP_DOMINANT != 0,
        input_language: bits & backend::CAP_INPUT_LANGUAGE != 0,
        input_script: bits & backend::CAP_INPUT_SCRIPT != 0,
        start_index: bits & backend::CAP_START_INDEX != 0,
    }
}

/// Nhận diện ngôn ngữ của `text`. Trả về mảng giảm dần theo confidence, có thể
/// rỗng khi văn bản quá ngắn để kết luận.
#[napi]
pub fn detect(text: String, options: Option<DetectOptions>) -> AsyncTask<DetectTask> {
    let options = options.unwrap_or(DetectOptions {
        max_results: None,
        constraints: None,
        hints: None,
        input_language: None,
        input_script: None,
        start_index: None,
    });

    AsyncTask::new(DetectTask {
        text,
        options: backend::DetectOptions {
            // Chuyển thẳng Option xuống: không truyền thì backend để OS tự quyết.
            max_results: options.max_results,
            constraints: options.constraints.unwrap_or_default(),
            hints: options
                .hints
                .unwrap_or_default()
                .into_iter()
                .map(|hint| (hint.tag, hint.weight))
                .collect(),
            input_language: options.input_language,
            input_script: options.input_script,
            start_index: options.start_index,
        },
    })
}
