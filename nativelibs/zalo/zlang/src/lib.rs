//! zlang — nhận diện ngôn ngữ bằng model có sẵn trong hệ điều hành.
//!
//! macOS  : Apple NaturalLanguage (NLLanguageRecognizer) — xác suất thật.
//! Windows: Extended Linguistic Services — xếp hạng, không điểm. (V2)
//!
//! Bề mặt napi cố tình mỏng: mọi lời gọi vào OS nằm ở `backend`, mọi quyết định
//! về hình dạng dữ liệu cho UI nằm ở facade TypeScript. Tầng này chỉ đưa việc
//! nhận diện ra khỏi luồng JS và chuyển tiếp tham số.

use napi::bindgen_prelude::AsyncTask;
use napi::{Env, Result, Task};
use napi_derive::napi;

mod backend;

/// Một giả thuyết ngôn ngữ.
///
/// Tên field cố ý một từ để không phụ thuộc quy tắc đổi snake_case sang
/// camelCase của napi; facade TS đặt tên công khai (`detectedLanguage`).
#[napi(object)]
pub struct Hypothesis {
    /// Thẻ BCP 47: 'vi', 'en', 'zh-Hant'…
    pub tag: String,
    /// 0..1 khi backend cho điểm thật, `null` khi không. Mảng luôn đã sắp giảm
    /// dần — ý nghĩa con số xem `scores()`.
    pub confidence: Option<f64>,
}

/// Chạy trên libuv threadpool, không chiếm luồng JS của main process.
///
/// NLLanguageRecognizer mất vài ms với văn bản ngắn, nhưng Zalo PC gọi nó trên
/// main process của Electron — chặn ở đó là khựng cả UI.
pub struct DetectTask {
    text: String,
    max_results: Option<u32>,
}

impl Task for DetectTask {
    type Output = Vec<backend::Hypothesis>;
    type JsValue = Vec<Hypothesis>;

    /// Chạy trên thread phụ. Không được đụng tới bất cứ thứ gì của V8 ở đây.
    fn compute(&mut self) -> Result<Self::Output> {
        backend::detect(&self.text, self.max_results)
    }

    /// Quay lại luồng JS: giờ mới được dựng giá trị JavaScript.
    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output
            .into_iter()
            .map(|(tag, confidence)| Hypothesis { tag, confidence })
            .collect())
    }
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

/// 'probability' khi con số là xác suất của model; 'rank' khi chỉ có thứ hạng.
#[napi]
pub fn scores() -> String {
    backend::score_kind().to_string()
}

/// Nhận diện ngôn ngữ của `text`.
///
/// Trả về mảng đã sắp giảm dần theo mức độ khả năng. Mảng rỗng khi văn bản quá
/// ngắn để kết luận — đó là kết quả hợp lệ, không phải lỗi.
#[napi]
pub fn detect(text: String, max_results: Option<u32>) -> AsyncTask<DetectTask> {
    AsyncTask::new(DetectTask { text, max_results })
}
