# Đưa zlang sang zalo-pc-app

Ghi lại đường đi cụ thể, dựa trên `zalo-pc-app` tại thời điểm đọc code
(branch `comm-feat/alpha/zpc-1611-update-voice-to-text-promotion`) và `nativelibs`
tại `tronghd/feat/zocr`.

**Tin tốt: ba trong bốn mắt nối đã có sẵn**, vì zlang cố tình đi theo đúng hợp
đồng mà nativelibs đang dùng.

| Mắt nối | Trạng thái ở zalo-pc-app |
|---|---|
| Alias TypeScript `nativelibs` | Đã có — `tsconfig.json`: `"nativelibs": ["native/nativelibs"]` |
| Webpack external | Đã có — `configs/zalo-externals.plugin.ts` map `nativelibs` sang `commonjs2 ../native/nativelibs` cho WIN32 và DARWIN |
| Preload expose | Đã có — `main/preload/node/index.ts`: `nativelibs: { asyncSqlite, ...require('nativelibs') }` |
| electron-builder | **Cần thêm** — xem bước 3 |

## 1. Copy module vào submodule nativelibs

`native/nativelibs` là git submodule của `https://zalogit2.zing.vn/zalo-pc/nativelibs.git`
(branch `master`). Bản checkout hiện tại chưa có `zocr` — zocr đang ở branch
riêng — nên zlang cũng phải vào nativelibs trước, rồi app bump submodule.

```bash
cp -R <repo này>/nativelibs/zlang <nativelibs>/zlang
```

Thêm một dòng vào `<nativelibs>/index.js`:

```js
    zlang: () => {
        return require('./zlang/index.js');
    },
```

và vào `<nativelibs>/index.d.ts`:

```ts
import type * as Zlang from './zlang'
// …
  zlang: () => typeof Zlang
```

Thêm vào `<nativelibs>/.gitignore` (đi cùng các dòng `zocr/target/` đã có):

```
zlang/target/
```

Không cần sửa gì thêm ở phía app cho phần resolve: alias, external và preload
đã trỏ vào `native/nativelibs` rồi.

## 2. Build đủ 4 slice và commit

`electron-builder.config.js` của app đặt `mac.target.arch = "universal"`, nên bản
mac cần **cả hai** slice; Windows hiện chỉ build 32-bit (xem comment
`// for x64. remove temp for now. ZPC 32bit only`), nhưng build luôn cả x64 để
sau này bật là dùng được.

Trên máy macOS (cần Xcode Command Line Tools — `build.rs` gọi `swiftc`):

```bash
cd native/nativelibs/zlang
npm run build:node:darwin-arm64
npm run build:node:darwin-x64
npm run build:types
```

Bridge macOS viết bằng Swift nhưng link **tĩnh** vào `.node`, nên khác zocr:
không có dylib nào phải copy vào bản build và không có binary thứ hai phải ký.
Swift runtime lấy từ `/usr/lib/swift` của hệ điều hành — zocr đã phụ thuộc đúng
chỗ đó, nên không phát sinh yêu cầu mới cho máy user.

Trên máy Windows (cần Visual Studio Build Tools + Windows SDK):

```bash
rustup target add i686-pc-windows-msvc x86_64-pc-windows-msvc
cd native\nativelibs\zlang
npm run build:node:win32-ia32
npm run build:node:win32-x64
npm test
```

Lần build Windows đầu tiên là lúc `src/bridge_windows.c` được biên dịch thật —
xem phần "Trạng thái" trong `nativelibs/zlang/README.md`.

Commit `darwin-arm64/`, `darwin-x64/`, `win32-ia32/`, `win32-x64/`, `index.js`,
`index.d.ts`. Không commit `target/`.

## 3. electron-builder

`asarUnpack: ['native/nativelibs']` đã có ở cả `win` và `mac`, nên `.node` sẽ
được unpack — không cần thêm.

Cần thêm vào `files` của **cả hai** khối để nguồn Rust/Swift/TS không lọt vào
bản build. Lưu ý `files` toàn cục đã loại `.h`, `.c`, `.cpp`, `.md`… nhưng
**không** loại `.swift`, `.rs`, `.ts`, `Cargo.*`:

```js
      '!native/nativelibs/zlang/src',
      '!native/nativelibs/zlang/scripts',
      '!native/nativelibs/zlang/target',
      '!native/nativelibs/zlang/Cargo.toml',
      '!native/nativelibs/zlang/Cargo.lock',
      '!native/nativelibs/zlang/build.rs',
      '!native/nativelibs/zlang/.cargo',
      '!native/nativelibs/zlang/*.ts',
      '!native/nativelibs/zlang/tsconfig.json',
```

Rồi loại slice của nền tảng khác, đúng cách `zwalker`/`mp4thumb` đang làm.

Trong khối `win.files`:

```js
      '!native/nativelibs/zlang/darwin-arm64',
      '!native/nativelibs/zlang/darwin-x64',
      'native/nativelibs/zlang/win32-ia32',
      '!native/nativelibs/zlang/win32-x64', // bật khi ZPC build x64
```

Trong khối `mac.files`:

```js
      '!native/nativelibs/zlang/win32-ia32',
      '!native/nativelibs/zlang/win32-x64',
      'native/nativelibs/zlang/darwin-arm64',
      'native/nativelibs/zlang/darwin-x64',
```

Không có gì cần ký thêm và không có `extraFiles`: zlang không có exe phụ, không
có model file. Đây là khác biệt lớn nhất so với zocr — zocr phải copy cả cây
`runtime/` sang `plugins/ocr/` và ký `zocr-host.exe`.

## 4. Feature module trong main/preload

Preload đã expose cả object `nativelibs`, nên về mặt kỹ thuật renderer gọi được
ngay. Nhưng theo cách các module khác đang làm (`main/preload/features/libjxl`,
`main/preload/features/zwalker`), nên có một feature module để renderer không
phải biết native:

```
main/preload/features/zlang/
  index.ts        # nạp trễ, cache instance, map lỗi
  invoker.ts      # kiểu cho handle API (nếu đi qua ipc)
  handler.ts      # PreloadHandlerConfig (nếu đi qua ipc)
```

`index.ts` theo đúng khuôn của `libjxl/index.ts`:

```ts
import nodeUtils from 'nativelibs';

let lib: any = null;

export const detectLanguage = async (text: string, maxResults = 3) => {
  if (!lib) lib = nodeUtils.zlang();
  const status = lib.availability();
  if (!status.supported) throw new Error(`zlang unavailable: ${status.reason}`);
  return lib.detect(text, { maxResults });
};

export const languageDetectionAvailability = () => {
  if (!lib) lib = nodeUtils.zlang();
  return { ...lib.availability(), ...lib.info() };
};
```

Khác `libjxl` một chỗ đáng chú ý: `libjxl` phải tự làm thread pool và hàng đợi vì
libjxl chiếm nhiều thread và có thể làm peak RAM trên Windows 32-bit. zlang
**không cần**: mỗi lời gọi chỉ tạo một recognizer nhẹ trong OS, chạy trên libuv
threadpool, không giữ tài nguyên nào giữa các lần gọi. Đừng copy phần
`acquireThreadLock` sang.

## 5. Điểm cần cân nhắc khi tích hợp thật

- **Ngưỡng độ dài.** Dưới ~15 ký tự thì model nào cũng đoán bừa (xem case
  `short` trong smoke test: `'ok'` ra `pl` 0.29). Nếu dùng để chọn ngôn ngữ
  dịch, nên đặt ngưỡng độ dài và ngưỡng confidence tối thiểu ở tầng nghiệp vụ,
  không ở zlang.
- **`scoreKind` khác nhau giữa hai nền tảng.** macOS cho xác suất, Windows cho
  thứ hạng. Đừng đặt một ngưỡng confidence dùng chung cho cả hai; hoặc chỉ
  dùng thứ tự (phần tử đầu) và bỏ qua con số.
- **Windows 32-bit.** ELS nằm trong `elscore.dll` của hệ thống, có ở cả ia32 và
  x64, không có vấn đề bitness như các lib khác trong nativelibs.
- **Zalo PC hỗ trợ Windows cũ hơn zlang cần?** ELS có từ Windows 7 nên không có
  vấn đề. Trên macOS, NaturalLanguage cần 10.14+; `.cargo/config.toml` chốt
  deployment target 10.15.
