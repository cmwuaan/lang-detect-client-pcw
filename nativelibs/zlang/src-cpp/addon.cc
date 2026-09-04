/*
 * zlang — lớp keo Node-API, bản C++.
 *
 * Đây là bản thay thế cho src/lib.rs + src/backend.rs. Hai cây nguồn tồn tại
 * song song và dùng CHUNG bridge + ABI ở src/: bridge_windows.c,
 * bridge_darwin.swift, zlang_bridge.h. Logic nhận diện KHÔNG nhân bản — nhân bản
 * ra là hai bản sẽ lệch nhau.
 *
 *   src/      Rust  (cargo)     -> node scripts/build-node.js --impl=rust
 *   src-cpp/  C++   (node-gyp)  -> node scripts/build-node.js --impl=cpp
 *
 * Cả hai xuất ra cùng một đường dẫn artifact, nên index.ts/index.js không biết
 * và không cần biết bản nào đang chạy. Đổi bản = build lại.
 *
 * VÌ SAO CÓ BẢN NÀY: std của Rust từ 1.78 import tĩnh API chỉ có trên Windows 8
 * và 10, nên muốn giữ Windows 7 là bị đóng băng ở Rust 1.77.2 vĩnh viễn. MSVC
 * không gắn sàn OS vào phiên bản compiler — xem rust-toolchain.toml.
 *
 * Bề mặt JS phải khớp TUYỆT ĐỐI với lib.rs: sáu hàm, cùng tên, cùng kiểu.
 * Hình dạng { tag, confidence } là hợp đồng với index.ts.
 */

#include <napi.h>

#include <string>
#include <vector>

/*
 * Nạp hai header chuẩn TRƯỚC khối extern "C": zlang_bridge.h tự include chúng,
 * và include header chuẩn bên trong extern "C" là cách hỏng kinh điển. Nạp
 * trước thì include guard biến lần nạp bên trong thành no-op.
 */
#include <stdbool.h>
#include <stdint.h>

extern "C" {
#include "../src/zlang_bridge.h"
}

namespace {

/* Khớp DEFAULT_MAX_RESULTS trong src/backend.rs. */
constexpr uint32_t kDefaultMaxResults = 3;

/* Một giả thuyết đã rời khỏi biên FFI: (thẻ BCP 47, độ tin cậy 0..1). */
struct Hypothesis {
	std::string tag;
	double confidence;
};

/*
 * Ba hàm dưới đây là bản dịch của src/backend.rs. Trên OS không có backend,
 * bridge không được link vào nên phải trả lời bằng hằng số — giống hệt các nhánh
 * #[cfg(not(...))] bên Rust.
 */
#if defined(__APPLE__) || defined(_WIN32)
#define ZLANG_HAS_BACKEND 1
#endif

const char* BackendName() {
#if defined(__APPLE__)
	return "apple-nl";
#elif defined(_WIN32)
	return "windows-els";
#else
	return "none";
#endif
}

bool BackendAvailable() {
#ifdef ZLANG_HAS_BACKEND
	return zlang_bridge_available();
#else
	return false;
#endif
}

const char* BackendScoreKind() {
#ifdef ZLANG_HAS_BACKEND
	const char* kind = zlang_bridge_score_kind();
	/* Bridge trả về string literal tĩnh, sống hết đời tiến trình. */
	return kind == nullptr ? "unknown" : kind;
#else
	return "none";
#endif
}

/*
 * Gọi bridge. Trả về false và điền `error` khi thất bại — tầng gọi ở
 * DetectWorker biến nó thành rejected promise.
 *
 * Không cấp phát động qua biên FFI: mảng `out` nằm trên stack đúng như ABI mô
 * tả, nên không có quy ước "ai giải phóng" nào để làm sai.
 */
bool RunDetect(const std::string& text, uint32_t max_results, std::vector<Hypothesis>* out,
               std::string* error) {
#ifndef ZLANG_HAS_BACKEND
	(void)text;
	(void)max_results;
	(void)out;
	*error = "zlang: không có backend nhận diện ngôn ngữ trên hệ điều hành này";
	return false;
#else
	/* Khớp clamp(1, MAX_RESULTS) bên Rust. */
	uint32_t max_out = max_results < 1 ? 1 : max_results;
	if (max_out > ZLANG_MAX_RESULTS) {
		max_out = ZLANG_MAX_RESULTS;
	}

	/*
	 * Chuỗi có byte NUL ở giữa không đi qua C ABI được. Báo lỗi rõ thay vì để
	 * bridge cắt ngầm ở giữa câu — CString::new bên Rust cũng làm đúng thế này.
	 */
	if (text.find('\0') != std::string::npos) {
		*error = "zlang: text chứa byte NUL";
		return false;
	}

	ZlangHypothesis buffer[ZLANG_MAX_RESULTS] = {};
	const int32_t written = zlang_bridge_detect(text.c_str(), max_out, buffer);

	if (written < 0) {
		*error = std::string("zlang: backend ") + BackendName() + " lỗi (code " +
		         std::to_string(written) + ")";
		return false;
	}

	size_t count = static_cast<size_t>(written);
	if (count > max_out) {
		count = max_out;
	}

	out->reserve(count);
	for (size_t i = 0; i < count; i++) {
		/* Bridge luôn NUL-terminate trong ZLANG_TAG_CAP byte. */
		const char* tag = buffer[i].tag;
		if (tag[0] == '\0') {
			/* Slot rỗng: bỏ qua, không phải lỗi. */
			continue;
		}
		out->push_back(Hypothesis{std::string(tag), buffer[i].confidence});
	}

	return true;
#endif
}

/*
 * Chạy trên libuv threadpool, không chiếm luồng JS của main process — vai trò
 * đúng bằng AsyncTask của napi-rs trong lib.rs.
 */
class DetectWorker : public Napi::AsyncWorker {
public:
	DetectWorker(const Napi::Env& env, std::string text, uint32_t max_results)
		: Napi::AsyncWorker(env),
		  deferred_(Napi::Promise::Deferred::New(env)),
		  text_(std::move(text)),
		  max_results_(max_results) {}

	Napi::Promise Promise() const { return deferred_.Promise(); }

	/* Luồng nền: KHÔNG được chạm vào bất cứ gì của napi ở đây. */
	void Execute() override {
		std::string error;
		if (!RunDetect(text_, max_results_, &results_, &error)) {
			SetError(error);
		}
	}

	void OnOK() override {
		Napi::Env env = Env();
		Napi::HandleScope scope(env);

		Napi::Array array = Napi::Array::New(env, results_.size());
		for (size_t i = 0; i < results_.size(); i++) {
			Napi::Object item = Napi::Object::New(env);
			/* Tên field một từ, khớp lib.rs — index.ts đặt tên công khai. */
			item.Set("tag", Napi::String::New(env, results_[i].tag));
			item.Set("confidence", Napi::Number::New(env, results_[i].confidence));
			array.Set(i, item);
		}

		deferred_.Resolve(array);
	}

	void OnError(const Napi::Error& error) override {
		Napi::Env env = Env();
		Napi::HandleScope scope(env);
		deferred_.Reject(error.Value());
	}

private:
	Napi::Promise::Deferred deferred_;
	std::string text_;
	uint32_t max_results_;
	std::vector<Hypothesis> results_;
};

// --------------------------------------------------------------- bề mặt JS

Napi::Value Platform(const Napi::CallbackInfo& info) {
	/* Khớp std::env::consts::OS bên Rust: 'macos' | 'windows' | ... */
#if defined(__APPLE__)
	return Napi::String::New(info.Env(), "macos");
#elif defined(_WIN32)
	return Napi::String::New(info.Env(), "windows");
#elif defined(__linux__)
	return Napi::String::New(info.Env(), "linux");
#else
	return Napi::String::New(info.Env(), "unknown");
#endif
}

Napi::Value Version(const Napi::CallbackInfo& info) {
	/* ZLANG_VERSION do binding.gyp truyền vào từ package.json — một nguồn sự thật. */
	return Napi::String::New(info.Env(), ZLANG_VERSION);
}

Napi::Value Backend(const Napi::CallbackInfo& info) {
	return Napi::String::New(info.Env(), BackendName());
}

Napi::Value Available(const Napi::CallbackInfo& info) {
	return Napi::Boolean::New(info.Env(), BackendAvailable());
}

Napi::Value Scores(const Napi::CallbackInfo& info) {
	return Napi::String::New(info.Env(), BackendScoreKind());
}

/*
 * detect(text, maxResults?) -> Promise<Array<{ tag, confidence }>>
 *
 * Mảng rỗng là kết quả HỢP LỆ khi văn bản quá ngắn để kết luận — không phải lỗi.
 */
Napi::Value Detect(const Napi::CallbackInfo& info) {
	Napi::Env env = info.Env();

	if (info.Length() < 1 || !info[0].IsString()) {
		Napi::TypeError::New(env, "zlang: detect(text) cần một string").ThrowAsJavaScriptException();
		return env.Undefined();
	}

	uint32_t max_results = kDefaultMaxResults;
	if (info.Length() > 1 && !info[1].IsUndefined() && !info[1].IsNull()) {
		if (!info[1].IsNumber()) {
			Napi::TypeError::New(env, "zlang: maxResults phải là number")
				.ThrowAsJavaScriptException();
			return env.Undefined();
		}
		max_results = info[1].As<Napi::Number>().Uint32Value();
	}

	/* Worker tự giải phóng sau khi OnOK/OnError chạy xong. */
	DetectWorker* worker = new DetectWorker(env, info[0].As<Napi::String>().Utf8Value(), max_results);
	Napi::Promise promise = worker->Promise();
	worker->Queue();

	return promise;
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
	exports.Set("platform", Napi::Function::New(env, Platform));
	exports.Set("version", Napi::Function::New(env, Version));
	exports.Set("backend", Napi::Function::New(env, Backend));
	exports.Set("available", Napi::Function::New(env, Available));
	exports.Set("scores", Napi::Function::New(env, Scores));
	exports.Set("detect", Napi::Function::New(env, Detect));
	return exports;
}

}  // namespace

NODE_API_MODULE(zlang, Init)
