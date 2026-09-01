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

@_cdecl("zlang_bridge_detect")
public func zlang_bridge_detect(
    _ utf8Text: UnsafePointer<CChar>?,
    _ maxOut: UInt32,
    _ out: UnsafeMutablePointer<ZlangHypothesis>?
) -> Int32 {
    // Enum C vô danh được import sang Swift thành Int, không phải Int32.
    guard let utf8Text = utf8Text, let out = out, maxOut > 0 else {
        return Int32(ZLANG_ERR_BAD_ARG)
    }

    let capacity = Int(min(maxOut, UInt32(ZLANG_MAX_RESULTS)))

    // String(validatingUTF8:) trả nil khi byte không hợp lệ, khác với
    // String(cString:) — cái đó tự "sửa" byte lỗi và che mất vấn đề.
    guard let text = String(validatingUTF8: utf8Text) else {
        return Int32(ZLANG_ERR_ENCODING)
    }
    if text.isEmpty {
        return 0
    }

    let recognizer = NLLanguageRecognizer()
    recognizer.processString(text)

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

/// Copy thẻ BCP 47 vào `char tag[ZLANG_TAG_CAP]`.
///
/// C fixed-size array được import sang Swift thành tuple, nên phải đi qua con
/// trỏ mới ghi được. Trả về false nếu thẻ dài hơn chỗ chứa — thẻ như vậy là dấu
/// hiệu bất thường, bỏ qua chứ đừng cắt cụt thành thẻ khác.
private func writeTag(_ tag: String, into slot: UnsafeMutablePointer<ZlangHypothesis>) -> Bool {
    let capacity = Int(ZLANG_TAG_CAP)

    return tag.withCString { source in
        withUnsafeMutablePointer(to: &slot.pointee.tag) { tuplePointer in
            let destination = UnsafeMutableRawPointer(tuplePointer)
                .assumingMemoryBound(to: CChar.self)
            // strlcpy luôn NUL-terminate và trả về độ dài nguồn.
            return strlcpy(destination, source, capacity) < capacity
        }
    }
}
