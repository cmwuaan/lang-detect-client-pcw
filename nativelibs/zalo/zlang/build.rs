use std::env;
use std::path::PathBuf;
use std::process::Command;

/// Fallback deployment target — keep in sync with MACOSX_DEPLOYMENT_TARGET in
/// .cargo/config.toml.
///
/// That file is the source of truth: cargo exports it as an env var, so this
/// value is only used when the build runs outside cargo's config (a bare
/// `rustc`, or a vendored copy without .cargo/). Both must agree, otherwise the
/// Swift half and the Rust half of the .node carry different LC_BUILD_VERSION.
///
/// 10.14 is where NaturalLanguage.framework first shipped.
const MACOS_MIN_VERSION: &str = "10.14";

fn main() {
    napi_build::setup();

    let target_os = env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();

    match target_os.as_str() {
        "macos" => build_swift_bridge(),
        "windows" => build_clang_bridge(),
        other => {
            println!(
                "cargo:warning=zlang: target_os '{other}' is not supported by a dedicated bridge yet; the build will lack OS-specific features."
            );
        }
    }
}

/// Build the Swift bridge on macOS, exposing NaturalLanguage.framework
/// (NLLanguageRecognizer) to Rust through FFI/N-API.
fn build_swift_bridge() {
    println!("cargo:rerun-if-changed=src/bridge_darwin.swift");
    println!("cargo:rerun-if-changed=src/zlang_bridge.h");
    println!("cargo:rerun-if-env-changed=MACOSX_DEPLOYMENT_TARGET");

    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR"));
    let archive = out_dir.join("libzlang_bridge.a");

    let arch = match env::var("CARGO_CFG_TARGET_ARCH").as_deref() {
        Ok("aarch64") => "arm64",
        Ok("x86_64") => "x86_64",
        other => panic!("zlang: unsupported macOS architecture: {:?}", other),
    };

    let target_version = env::var("MACOSX_DEPLOYMENT_TARGET")
        .unwrap_or_else(|_| MACOS_MIN_VERSION.to_string());
    let triple = format!("{arch}-apple-macosx{target_version}");

    // Get the SDK path through xcrun instead of assuming swiftc is already in PATH.
    let sdk = xcrun(&["--sdk", "macosx", "--show-sdk-path"]);

    let status = Command::new("xcrun")
        .args(["swiftc"])
        .args(["-emit-library", "-static"])
        .args(["-module-name", "zlang_bridge"])
        .args(["-target", &triple])
        .args(["-sdk", &sdk])
        // Load the shared ABI so Swift can see ZlangHypothesis, ZLANG_TAG_CAP, and ZLANG_ERR_*.
        .args(["-import-objc-header", "src/zlang_bridge.h"])
        // -O + whole-module optimization to prevent @_cdecl functions
        // from being stripped during optimization.
        .args(["-O", "-wmo"])
        .arg("-o")
        .arg(&archive)
        .arg("src/bridge_darwin.swift")
        .status()
        .expect("zlang: failed to run swiftc — Xcode Command Line Tools are required");

    if !status.success() {
        panic!("zlang: swiftc failed ({status})");
    }

    println!("cargo:rustc-link-search=native={}", out_dir.display());
    println!("cargo:rustc-link-lib=static=zlang_bridge");

    // Force-load the archive so the linker does not strip the @_cdecl functions
    // that are only referenced through FFI from Rust (dynamic lookup is not enough
    // to keep the symbols alive).
    println!("cargo:rustc-link-arg=-Wl,-force_load,{}", archive.display());

    // Swift runtime library paths: obtain them from both the SDK and the toolchain
    // currently selected by xcrun, to support different machines/CI environments.
    let toolchain =
        xcrun(&["--find", "swiftc"]).replace("/usr/bin/swiftc", "/usr/lib/swift/macosx");
    println!("cargo:rustc-link-arg=-L{sdk}/usr/lib/swift");
    println!("cargo:rustc-link-arg=-L{toolchain}");
    println!("cargo:rustc-link-search=native=/usr/lib/swift");
    println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");

    println!("cargo:rustc-link-lib=framework=Foundation");
    println!("cargo:rustc-link-lib=framework=NaturalLanguage");
}

/// Build the C bridge on Windows, exposing Extended Linguistic Services
/// (elscore.h: MappingRecognizeText & related APIs) to Rust through FFI/N-API.
fn build_clang_bridge() {
    println!("cargo:rerun-if-changed=src/bridge_windows.c");
    println!("cargo:rerun-if-changed=src/zlang_bridge.h");

    // ELS is available on Windows 7+. The `cc` crate automatically reads
    // CARGO_CFG_TARGET_ARCH / CARGO_CFG_TARGET_ENV to select the appropriate
    // toolchain (MSVC or MinGW).
    cc::Build::new()
        .file("src/bridge_windows.c")
        .include("src") // So bridge_windows.c can find zlang_bridge.h.
        .warnings(true)
        .flag_if_supported("/W4") // MSVC
        .flag_if_supported("-Wall") // MinGW/clang
        .compile("zlang_bridge");

    // Extended Linguistic Services (MappingRecognizeText & related APIs).
    println!("cargo:rustc-link-lib=elscore");
}

/// Shared helper: runs `xcrun <args>` and returns trimmed stdout.
/// Only called on macOS.
fn xcrun(args: &[&str]) -> String {
    let output = Command::new("xcrun")
        .args(args)
        .output()
        .unwrap_or_else(|e| panic!("zlang: failed to run xcrun {args:?}: {e}"));

    if !output.status.success() {
        panic!(
            "zlang: xcrun {args:?} failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    String::from_utf8(output.stdout)
        .expect("zlang: xcrun output is not valid UTF-8")
        .trim()
        .to_string()
}
