# Skill: Nhận diện ngôn ngữ với NLLanguageRecognizer

## Mục tiêu
Phát hiện ngôn ngữ của một đoạn văn bản trong ứng dụng Swift (iOS/macOS), dùng framework `NaturalLanguage`.

## Import cần thiết
```swift
import NaturalLanguage
```

---

## 1. Trường hợp đơn giản: chỉ cần biết 1 ngôn ngữ

Dùng khi bạn xử lý một lần, không cần tối ưu hiệu năng.

```swift
import NaturalLanguage

func quickDetectLanguage(text: String) -> String {
    guard let language = NLLanguageRecognizer.dominantLanguage(for: text) else {
        return "Không xác định được ngôn ngữ"
    }
    return language.rawValue // ví dụ: "vi", "en", "fr"
}

// Sử dụng
print(quickDetectLanguage(text: "Xin chào các bạn"))   // "vi"
print(quickDetectLanguage(text: "Hello everyone"))      // "en"
```

---

## 2. Trường hợp cần tái sử dụng nhiều lần (khuyến nghị cho production)

Tạo 1 instance dùng chung, gọi `reset()` trước mỗi lần xử lý mới để tránh tốn chi phí khởi tạo lại.

```swift
import NaturalLanguage

final class LanguageDetector {
    private let recognizer = NLLanguageRecognizer()

    /// Trả về ngôn ngữ khả năng cao nhất
    func detect(_ text: String) -> NLLanguage? {
        recognizer.reset()
        recognizer.processString(text)
        return recognizer.dominantLanguage
    }

    /// Trả về top N ngôn ngữ kèm xác suất
    func detectHypotheses(_ text: String, maxResults: Int = 3) -> [NLLanguage: Double] {
        recognizer.reset()
        recognizer.processString(text)
        return recognizer.languageHypotheses(withMaximum: maxResults)
    }
}
```

**Lưu ý**: `NLLanguageRecognizer` KHÔNG thread-safe. Nếu dùng đa luồng, mỗi thread cần một `LanguageDetector` riêng, không share chung instance.

---

## 3. Tăng độ chính xác với `languageHints`

Dùng khi bạn đã biết trước ngữ cảnh (ví dụ: app chủ yếu dùng cho người Việt và người Anh).

```swift
let recognizer = NLLanguageRecognizer()
recognizer.languageHints = [
    .vietnamese: 0.7,
    .english: 0.3
]
recognizer.processString("hi ban")   // văn bản mơ hồ, ngắn
let result = recognizer.dominantLanguage
```

`languageHints` chỉ là "gợi ý xác suất trước" — không loại bỏ khả năng các ngôn ngữ khác, chỉ tăng trọng số ưu tiên.

---

## 4. Giới hạn cứng kết quả với `languageConstraints`

Dùng khi bạn CHẮC CHẮN văn bản chỉ thuộc một tập ngôn ngữ nhất định (loại nhiễu, tăng độ chính xác đáng kể với văn bản ngắn/mơ hồ).

```swift
let recognizer = NLLanguageRecognizer()
recognizer.languageConstraints = [.vietnamese, .english]
recognizer.processString("café")
let result = recognizer.dominantLanguage // chỉ trả về .vietnamese hoặc .english
```

---

## 5. Kết hợp Hints + Constraints (khuyến nghị cho chatbot/app đa ngôn ngữ giới hạn)

```swift
final class ViEnLanguageDetector {
    private let recognizer = NLLanguageRecognizer()

    init() {
        recognizer.languageConstraints = [.vietnamese, .english]
        recognizer.languageHints = [.vietnamese: 0.6, .english: 0.4]
    }

    func detect(_ text: String) -> NLLanguage? {
        recognizer.reset()
        recognizer.processString(text)
        return recognizer.dominantLanguage
    }
}

// Sử dụng
let detector = ViEnLanguageDetector()
if let lang = detector.detect("How are you today?") {
    print(lang.rawValue) // "en"
}
```

---

## 6. Xử lý văn bản ngắn/mơ hồ an toàn hơn

Với câu quá ngắn, `dominantLanguage` có thể sai. Nên kiểm tra xác suất trước khi tin kết quả:

```swift
func detectWithConfidence(_ text: String, threshold: Double = 0.5) -> NLLanguage? {
    let recognizer = NLLanguageRecognizer()
    recognizer.processString(text)
    let hypotheses = recognizer.languageHypotheses(withMaximum: 1)

    guard let (language, probability) = hypotheses.first,
          probability >= threshold else {
        return nil // không đủ tin cậy
    }
    return language
}
```

---

## Bảng quyết định nhanh

| Tình huống | Giải pháp |
|---|---|
| Xử lý 1 lần, đơn giản | `NLLanguageRecognizer.dominantLanguage(for:)` |
| Xử lý nhiều văn bản liên tiếp | 1 instance dùng chung + `reset()` |
| Biết trước ngữ cảnh ngôn ngữ người dùng | `languageHints` |
| Chỉ có N ngôn ngữ khả dĩ | `languageConstraints` |
| Cần độ tin cậy cao với câu ngắn | `languageHypotheses` + ngưỡng xác suất |
| Đa luồng | Instance riêng cho mỗi thread |

## Lưu ý quan trọng
- Không dùng chung 1 instance `NLLanguageRecognizer` trên nhiều thread cùng lúc.
- `languageHints` = gợi ý (soft), `languageConstraints` = giới hạn (hard).
- Luôn gọi `reset()` trước khi `processString()` mới nếu tái sử dụng instance.
