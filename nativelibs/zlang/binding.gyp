{
  # Bản C++ của zlang. Bản Rust dùng Cargo.toml + build.rs, hai bên độc lập và
  # dùng chung bridge ở src/. Xem src-cpp/addon.cc.
  "variables": {
    # Một nguồn sự thật cho version: đọc từ package.json, không gõ lại ở đây.
    "zlang_version": "<!(node -p \"require('./package.json').version\")",
    # KHÔNG dùng `require('node-addon-api').include_dir`: nó trả về đường dẫn
    # tương đối theo cwd, nên đổi nơi gọi là gyp tìm không ra header.
    "napi_include": "<!(node -p \"require('path').dirname(require.resolve('node-addon-api/package.json'))\")"
  },
  "targets": [
    {
      "target_name": "zlang",
      "sources": ["src-cpp/addon.cc"],
      "include_dirs": ["<(napi_include)"],
      "defines": [
        # Không dùng C++ exception: ThrowAsJavaScriptException() và
        # AsyncWorker::SetError() chạy đúng ở chế độ này, và tắt exception giúp
        # binary nhỏ hơn cùng ít khác biệt giữa hai compiler.
        "NAPI_DISABLE_CPP_EXCEPTIONS",
        # Sàn Node-API. Electron 22.3.9 mang Node 16.17.1 => Node-API 8.
        # Nhờ ABI ổn định của Node-API, artifact KHÔNG phải build lại theo từng
        # phiên bản Electron.
        "NAPI_VERSION=8",
        "ZLANG_VERSION=\"<(zlang_version)\""
      ],
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "conditions": [
        [
          "OS=='mac'",
          {
            # Bridge Swift được biên dịch thành static archive TRƯỚC khi node-gyp
            # chạy (gyp không có luật build Swift) — xem scripts/build-cpp.js.
            "libraries": [
              "<(module_root_dir)/.build-cpp/libzlang_bridge.a",
              "-framework Foundation",
              "-framework NaturalLanguage"
            ],
            "xcode_settings": {
              # Phải khớp deployment target dùng cho swiftc, nếu không .node mang
              # LC_BUILD_VERSION lệch giữa phần Swift và phần C++.
              "MACOSX_DEPLOYMENT_TARGET": "10.15",
              "GCC_ENABLE_CPP_EXCEPTIONS": "NO",
              "CLANG_CXX_LIBRARY": "libc++",
              "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
              # Swift runtime link động vào /usr/lib/swift của OS: từ macOS
              # 10.14.4 Swift đã ABI-stable và nằm sẵn trong hệ điều hành, nên
              # không phải đóng gói runtime theo app.
              "OTHER_LDFLAGS": ["-L/usr/lib/swift", "-Wl,-rpath,/usr/lib/swift"]
            }
          }
        ],
        [
          "OS=='win'",
          {
            # Bridge Windows là C thuần, gyp biên dịch trực tiếp — không cần
            # bước tiền xử lý nào như phía macOS.
            "sources": ["src/bridge_windows.c"],
            # Extended Linguistic Services (MappingRecognizeText & co.).
            "libraries": ["elscore.lib"],
            "defines": [
              # SÀN WINDOWS 7. Đây là lý do tồn tại của bản C++ này: MSVC cho
              # khai báo phiên bản Windows tối thiểu một cách tường minh, không
              # gắn nó vào phiên bản compiler như std của Rust.
              "WINVER=0x0601",
              "_WIN32_WINNT=0x0601"
            ],
            "msvs_settings": {
              "VCCLCompilerTool": {
                "ExceptionHandling": 0,
                "AdditionalOptions": ["/std:c++17"]
              }
            },
            "configurations": {
              # RuntimeLibrary 0 = /MT, 1 = /MTd: CRT link TĨNH. Không có nó thì
              # .node đòi bộ VC++ redistributable trên máy người dùng, và
              # assertWin7Safe() sẽ chặn build vì thấy import VCRUNTIME/MSVCP.
              "Release": {
                "msvs_settings": { "VCCLCompilerTool": { "RuntimeLibrary": 0 } }
              },
              "Debug": {
                "msvs_settings": { "VCCLCompilerTool": { "RuntimeLibrary": 1 } }
              }
            }
          }
        ]
      ]
    }
  ]
}
