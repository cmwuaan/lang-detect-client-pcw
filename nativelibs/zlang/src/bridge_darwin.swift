//
//  Backend macOS — Apple NaturalLanguage (NLLanguageRecognizer).
//
//  Model nằm trong hệ điều hành: không tải gì, không cần mạng, chạy in-process.
//  NLLanguageRecognizer KHÔNG thread-safe, nên mỗi lần gọi tạo một instance mới;
//  việc này rẻ (không nạp model riêng cho từng instance) và cho phép Rust gọi từ
//  libuv threadpool mà không cần lock.
//
//  File này export C ABI bằng @_cdecl, khớp src/zlang_bridge.h — Rust không biết
//  đây là Swift. Header được nạp qua -import-objc-header (xem build.rs), nên các
//  kiểu ZlangHypothesis, ZLANG_TAG_CAP, ZLANG_ERR_* dùng trực tiếp được ở đây.
//

import Foundation
import NaturalLanguage

/// Chuỗi tĩnh trả cho `zlang_bridge_score_kind()`.
///
/// Hợp đồng nói caller KHÔNG giải phóng, nên cấp phát đúng một lần và giữ đến
/// hết đời tiến trình. Swift string literal không có địa chỉ ổn định để trả ra
/// C, nên phải strdup.
private let scoreKindCString: UnsafePointer<CChar> = {
    guard let copy = strdup("probability") else {
        fatalError("zlang: strdup thất bại khi khởi tạo scoreKind")
    }
    return UnsafePointer(copy)
}()

/// Deployment target là macOS 10.15 (xem .cargo/config.toml) và NaturalLanguage
/// có từ 10.14, nên class luôn tồn tại khi module nạp được.
@_cdecl("zlang_bridge_available")
public func zlang_bridge_available() -> Bool {
    return true
}

@_cdecl("zlang_bridge_score_kind")
public func zlang_bridge_score_kind() -> UnsafePointer<CChar> {
    // languageHypotheses(maximum:) trả về xác suất thật của model.
    return scoreKindCString
}

/// NLLanguageRecognizer có đủ cả ba: languageConstraints, languageHints và
/// dominantLanguage. Không có cái nào phải giả lập.
@_cdecl("zlang_bridge_capabilities")
public func zlang_bridge_capabilities() -> UInt32 {
    return UInt32(ZLANG_CAP_CONSTRAINTS) | UInt32(ZLANG_CAP_HINTS) | UInt32(ZLANG_CAP_DOMINANT)
}

@_cdecl("zlang_bridge_detect")
public func zlang_bridge_detect(
    _ utf8Text: UnsafePointer<CChar>?,
    _ options: UnsafePointer<ZlangDetectOptions>?,
    _ out: UnsafeMutablePointer<ZlangHypothesis>?,
    _ dominantOut: UnsafeMutablePointer<CChar>?
) -> Int32 {
    // Enum C vô danh được import sang Swift thành Int, không phải Int32.
    guard let utf8Text = utf8Text,
          let options = options,
          let out = out,
          let dominantOut = dominantOut
    else {
        return Int32(ZLANG_ERR_BAD_ARG)
    }

    let opts = options.pointee
    guard opts.max_results > 0 else { return Int32(ZLANG_ERR_BAD_ARG) }
    let capacity = Int(min(opts.max_results, UInt32(ZLANG_MAX_RESULTS)))

    /*
     * Option riêng của ELS. NLLanguageRecognizer không có gì tương đương:
     * không có bước "chọn engine" để mà lọc, và processString() luôn đọc cả
     * chuỗi. Giả lập start_index bằng cách tự cắt chuỗi là tự nghĩ ra hành vi
     * cho một API không có nó — caller cắt chuỗi bên JS thì rõ ràng hơn nhiều.
     */
    if opts.input_language != nil || opts.input_script != nil || opts.start_index != 0 {
        return Int32(ZLANG_ERR_UNSUPPORTED_OPTION)
    }

    // Hợp đồng nói dominant luôn NUL-terminate; đặt rỗng ngay để mọi đường
    // thoát sớm bên dưới không để lại rác của lần gọi trước.
    dominantOut.pointee = 0

    // String(validatingUTF8:) trả nil khi byte không hợp lệ, khác với
    // String(cString:) — cái đó tự "sửa" byte lỗi và che mất vấn đề.
    guard let text = String(validatingUTF8: utf8Text) else {
        return Int32(ZLANG_ERR_ENCODING)
    }
    if text.isEmpty {
        return 0
    }

    let recognizer = NLLanguageRecognizer()

    // Đặt constraint/hint TRƯỚC processString: Apple đọc chúng lúc xử lý văn
    // bản, đặt sau thì không có hiệu lực nào.
    if let constraints = readConstraints(opts) {
        recognizer.languageConstraints = constraints
    }
    if let hints = readHints(opts) {
        recognizer.languageHints = hints
    }

    recognizer.processString(text)

    if let dominant = recognizer.dominantLanguage {
        // Thẻ quá dài thì để rỗng còn hơn ghi một thẻ bị cắt cụt thành thẻ khác.
        _ = writeTagBytes(dominant.rawValue, into: dominantOut)
    }

    let hypotheses = recognizer.languageHypotheses(withMaximum: capacity)
    if hypotheses.isEmpty {
        return 0
    }

    // Dictionary không có thứ tự; hợp đồng đòi giảm dần theo confidence.
    let ranked = hypotheses.sorted { $0.value > $1.value }

    var written = 0
    for (language, confidence) in ranked {
        if written >= capacity {
            break
        }
        if writeTag(language.rawValue, into: out.advanced(by: written)) {
            out.advanced(by: written).pointee.confidence = confidence
            written += 1
        }
    }

    return Int32(written)
}

/// `languageConstraints` — nil khi caller không giới hạn gì.
private func readConstraints(_ opts: ZlangDetectOptions) -> [NLLanguage]? {
    guard let base = opts.constraints, opts.constraint_count > 0 else { return nil }

    var languages: [NLLanguage] = []
    for i in 0..<Int(opts.constraint_count) {
        guard let tag = base[i], let text = String(validatingUTF8: tag) else { continue }
        languages.append(NLLanguage(text))
    }
    return languages.isEmpty ? nil : languages
}

/// `languageHints` — prior của caller, tag -> trọng số.
private func readHints(_ opts: ZlangDetectOptions) -> [NLLanguage: Double]? {
    guard let base = opts.hints, opts.hint_count > 0 else { return nil }

    var hints: [NLLanguage: Double] = [:]
    for i in 0..<Int(opts.hint_count) {
        let entry = base[i]
        guard let tag = entry.tag, let text = String(validatingUTF8: tag) else { continue }
        hints[NLLanguage(text)] = entry.weight
    }
    return hints.isEmpty ? nil : hints
}

/// Copy thẻ BCP 47 vào `char tag[ZLANG_TAG_CAP]`.
///
/// C fixed-size array được import sang Swift thành tuple, nên phải đi qua con
/// trỏ mới ghi được. Trả về false nếu thẻ dài hơn chỗ chứa — thẻ như vậy là dấu
/// hiệu bất thường, bỏ qua chứ đừng cắt cụt thành thẻ khác.
private func writeTag(_ tag: String, into slot: UnsafeMutablePointer<ZlangHypothesis>) -> Bool {
    return withUnsafeMutablePointer(to: &slot.pointee.tag) { tuplePointer in
        let destination = UnsafeMutableRawPointer(tuplePointer)
            .assumingMemoryBound(to: CChar.self)
        return writeTagBytes(tag, into: destination)
    }
}

/// Copy vào một buffer `char[ZLANG_TAG_CAP]` bất kỳ.
///
/// Thẻ dài hơn chỗ chứa thì để RỖNG chứ không giữ phần bị cắt: 'zh-Hant-XX…'
/// cắt cụt có thể thành đúng một thẻ hợp lệ khác, và đó là lỗi im lặng tệ nhất
/// có thể xảy ra ở tầng này.
private func writeTagBytes(_ tag: String, into destination: UnsafeMutablePointer<CChar>) -> Bool {
    let capacity = Int(ZLANG_TAG_CAP)

    return tag.withCString { source in
        // strlcpy luôn NUL-terminate và trả về độ dài NGUỒN.
        if strlcpy(destination, source, capacity) < capacity {
            return true
        }
        destination.pointee = 0
        return false
    }
}
