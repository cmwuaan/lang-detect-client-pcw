extern crate napi_build;

use std::env;
use std::path::PathBuf;
use std::process::Command;

/**
 * Mỗi hệ điều hành có MỘT bridge nhỏ, cùng một ABI (xem src/zlang_bridge.h).
 * Lý do không tự khai báo struct/hàm của OS trong Rust: layout struct phải khớp
 * tuyệt đối với header của SDK, sai một byte là UB âm thầm. Để header của Apple
 * và của Windows SDK làm nguồn sự thật, Rust chỉ nhìn thấy ABI phẳng do mình
 * định nghĩa.
 *
 *   macOS   src/bridge_darwin.swift  -> swiftc -> libzlang_bridge.a (tĩnh)
 *   Windows src/bridge_windows.c     -> cc     -> zlang_bridge.lib  (tĩnh)
 */
fn main() {
    napi_build::setup();

    let target_os = env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();

    match target_os.as_str() {
        "macos" => build_swift_bridge(),
        "windows" => {
            cc::Build::new()
                .file("src/bridge_windows.c")
                .compile("zlang_bridge");
            // Extended Linguistic Services (MappingRecognizeText & co.).
            println!("cargo:rustc-link-lib=elscore");
            println!("cargo:rerun-if-changed=src/bridge_windows.c");
        }
        // Linux và các OS khác: không có backend, module báo unavailable.
        _ => {}
    }

    println!("cargo:rerun-if-changed=src/zlang_bridge.h");
}

/**
 * Build bridge Swift thành static archive rồi link vào .node.
 *
 * Vì sao TĨNH chứ không phải dylib như zocr: zocr phải xuất
 * libzocr_vision.dylib vì ZaloCapture (native, ngoài Node) cũng dùng chung nó.
 * zlang không có consumer nào khác, nên link tĩnh để chỉ phải ship đúng một file
 * .node — không rpath, không install_name, không phải ký thêm binary thứ hai.
 *
 * Swift runtime thì vẫn link động, vào /usr/lib/swift của hệ điều hành: từ
 * macOS 10.14.4 Swift đã ABI-stable và nằm sẵn trong OS, nên không cần đóng gói
 * runtime theo app.
 */
fn build_swift_bridge() {
    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR"));
    let archive = out_dir.join("libzlang_bridge.a");

    let arch = match env::var("CARGO_CFG_TARGET_ARCH").unwrap_or_default().as_str() {
        "aarch64" => "arm64",
        "x86_64" => "x86_64",
        other => panic!("zlang: arch macOS không hỗ trợ: {}", other),
    };

    // Phải khớp MACOSX_DEPLOYMENT_TARGET trong .cargo/config.toml, nếu không
    // .node mang LC_BUILD_VERSION lệch giữa phần Swift và phần Rust.
    let deployment_target =
        env::var("MACOSX_DEPLOYMENT_TARGET").unwrap_or_else(|_| "10.15".to_string());
    let triple = format!("{}-apple-macosx{}", arch, deployment_target);

    let status = Command::new("swiftc")
        .args(["-emit-library", "-static"])
        .args(["-module-name", "zlang_bridge"])
        .args(["-target", &triple])
        // Nạp ABI dùng chung để Swift thấy ZlangHypothesis, ZLANG_TAG_CAP, ZLANG_ERR_*.
        .args(["-import-objc-header", "src/zlang_bridge.h"])
        // -O + whole-module để hàm @_cdecl không bị bỏ qua khi tối ưu.
        .args(["-O", "-wmo"])
        .arg("-o")
        .arg(&archive)
        .arg("src/bridge_darwin.swift")
        .status()
        .expect("zlang: không chạy được swiftc — cần Xcode Command Line Tools");

    if !status.success() {
        panic!("zlang: swiftc thất bại ({})", status);
    }

    println!("cargo:rustc-link-search=native={}", out_dir.display());
    println!("cargo:rustc-link-lib=static=zlang_bridge");

    // Swift runtime của hệ điều hành. -rpath để dyld tìm được lúc chạy.
    println!("cargo:rustc-link-search=native=/usr/lib/swift");
    println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");

    println!("cargo:rustc-link-lib=framework=Foundation");
    println!("cargo:rustc-link-lib=framework=NaturalLanguage");

    println!("cargo:rerun-if-changed=src/bridge_darwin.swift");
    println!("cargo:rerun-if-env-changed=MACOSX_DEPLOYMENT_TARGET");
}
