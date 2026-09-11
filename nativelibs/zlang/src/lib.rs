//! zlang — nhận diện ngôn ngữ bằng model có sẵn trong hệ điều hành.
//!
//! macOS  : Apple NaturalLanguage (NLLanguageRecognizer) — xác suất thật.
//! Windows: Extended Linguistic Services, Microsoft Language Detection — xếp hạng.
//!
//! Bề mặt napi cố tình mỏng: mọi lời gọi vào OS nằm ở `backend`, mọi quyết định
//! về hình dạng dữ liệu cho UI nằm ở facade TypeScript (index.ts). Tầng này chỉ
//! đưa việc nhận diện ra khỏi luồng JS.

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

/// Chạy trên libuv threadpool, không chiếm luồng JS của main process.
pub struct DetectTask {
    text: String,
    max_results: u32,
}

impl Task for DetectTask {
    type Output = Vec<backend::Hypothesis>;
    type JsValue = Vec<Hypothesis>;

    fn compute(&mut self) -> Result<Self::Output> {
        backend::detect(&self.text, self.max_results)
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output
            .into_iter()
            .map(|(tag, confidence)| Hypothesis { tag, confidence })
            .collect())
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

/// Nhận diện ngôn ngữ của `text`. Trả về mảng giảm dần theo confidence, có thể
/// rỗng khi văn bản quá ngắn để kết luận.
#[napi]
pub fn detect(text: String, max_results: Option<u32>) -> AsyncTask<DetectTask> {
    AsyncTask::new(DetectTask {
        text,
        max_results: max_results.unwrap_or(backend::DEFAULT_MAX_RESULTS),
    })
}
