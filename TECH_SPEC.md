# Tech Spec — Language Detection cho Zalo PC (Web + Desktop)

| | |
|---|---|
| **Status** | `Draft` / `In Review` / `Approved` / `Implemented` — `[[FILL]]` |
| **Author** | `[[FILL]]` |
| **Reviewers** | `[[FILL: tên + vai trò — nên có 1 người từ team Web, 1 từ Desktop, 1 từ team consumer của feature]]` |
| **Created** | `[[FILL: YYYY-MM-DD]]` |
| **Last updated** | `[[FILL]]` |
| **Ticket** | `[[FILL: ZPC-xxx]]` |
| **Target release** | `[[FILL]]` |
| **Repo** | `nativelibs/zlangdetect` + `zalo-pc-app` |

---

> ## 📖 CÁCH DÙNG TEMPLATE NÀY
>
> **Marker cần fill:** mọi chỗ cần số liệu / nội dung của bạn đều là `[[FILL: mô tả]]`.
> Kiểm tra còn sót chỗ nào:
> ```bash
> rg -c '\[\[FILL' zlangdetect/TECH_SPEC.md          # đếm tổng
> rg -n '\[\[FILL' zlangdetect/TECH_SPEC.md          # liệt kê từng chỗ
> ```
> **Không được merge spec khi count > 0** (trừ các mục đã đánh dấu `OPTIONAL`).
>
> **Block hướng dẫn:** mọi đoạn bắt đầu bằng `> 📝` là hướng dẫn cách viết/đo — **xoá hết trước khi publish**:
> ```bash
> # xoá các dòng hướng dẫn (kiểm tra kỹ trước khi ghi đè)
> rg -v '^> 📝' zlangdetect/TECH_SPEC.md > /tmp/spec.clean && mv /tmp/spec.clean zlangdetect/TECH_SPEC.md
> ```
>
> **Thứ tự viết được khuyến nghị** (không viết tuần tự từ trên xuống):
> 1. §3 Đối tượng & bài toán → §4 Requirements → §5 Problems  ← **viết trước, đây là xương sống**
> 2. §10 Proof Obligations — chốt ngưỡng đạt/không đạt **TRƯỚC KHI ĐO**
> 3. §6 Corpus + harness → dựng đo
> 4. §7 Benchmark → fill số
> 5. §8 Cơ chế & trade-off → §9 Kết luận → §11 Đề xuất → §12 Plan
> 6. §1, §2 viết cuối (dễ nhất, và lúc đó bạn đã biết mình nói gì)
>
> **Nguyên tắc số liệu:** mọi con số trong doc phải trace được về một lệnh chạy lại được.
> Nếu không có lệnh → không phải số liệu, chỉ là ý kiến. Ghi lệnh vào §6.4.

---

## 1. Tổng quan tính năng

### 1.1. Một câu

> 📝 Một câu, không kỹ thuật. Dạng: "Xác định ngôn ngữ của <đơn vị dữ liệu> để <consumer> có thể <hành động>."
> Nếu không viết nổi một câu thì scope đang sai.

`[[FILL]]`

### 1.2. Bối cảnh & động lực

> 📝 Trả lời: **tại sao bây giờ?** Nêu trigger cụ thể — feature nào đang bị block, số liệu nào cho thấy vấn đề.
> Tránh viết chung chung kiểu "nâng cao trải nghiệm người dùng". Nêu con số hoặc ticket.

`[[FILL: 3-6 câu + link ticket/số liệu trigger]]`

### 1.3. Consumer của feature này

> 📝 Đây là mục **quan trọng nhất của §1** và hay bị bỏ qua. Mỗi consumer có yêu cầu accuracy/latency
> khác nhau, và chính chúng quyết định thiết kế. Đặc biệt cột "chi phí khi SAI" — nó quyết định
> bạn tối ưu precision hay recall.

| # | Consumer | Dùng field nào của output | Latency budget | Chi phí khi SAI | Ưu tiên |
|---|---|---|---|---|---|
| C1 | `[[FILL: vd. Gợi ý dịch tin nhắn]]` | `[[FILL: primary + confidence]]` | `[[FILL]]` | `[[FILL: vd. hiện nút dịch sai → user annoyed, cost thấp/trung bình]]` | `[[FILL: P0/P1/P2]]` |
| C2 | `[[FILL: vd. Spellcheck / gợi ý gõ]]` | `[[FILL: spans (per-token)]]` | `[[FILL]]` | `[[FILL]]` | `[[FILL]]` |
| C3 | `[[FILL: vd. Search indexing / tokenizer selection]]` | `[[FILL: tập lang xuất hiện]]` | `[[FILL]]` | `[[FILL: sai → index sai, khó sửa hồi tố → cost CAO]]` | `[[FILL]]` |
| C4 | `[[FILL: vd. TTS / accessibility]]` | `[[FILL]]` | `[[FILL]]` | `[[FILL]]` | `[[FILL]]` |
| C5 | `[[FILL: vd. Content moderation routing]]` | `[[FILL]]` | `[[FILL]]` | `[[FILL]]` | `[[FILL]]` |

> 📝 **Sau khi fill bảng này, chốt luôn:** consumer nào là *primary* cho v1?
> Spec sẽ được tối ưu cho nó, các consumer khác là best-effort.

**Primary consumer cho v1:** `[[FILL]]`
**Lý do:** `[[FILL]]`

### 1.4. Non-goals

> 📝 Viết thẳng thắn. Non-goals là thứ bảo vệ bạn khỏi scope creep trong review.
> Gợi ý các non-goal thường đúng cho v1: dịch máy, phát hiện phương ngữ/vùng miền,
> phát hiện ngôn ngữ trong ảnh (đó là việc của zocr), >N ngôn ngữ, per-character labeling.

- `[[FILL]]`
- `[[FILL]]`
- `[[FILL]]`

### 1.5. Output contract

> 📝 Chốt shape output **ngay từ đầu** và không đổi. Đây là thứ mọi consumer phụ thuộc vào.
> Shape dưới đây là đề xuất — sửa nếu §1.3 cho thấy cần khác, nhưng đừng bỏ `engine_id`.

```rust
pub struct Detection {
    pub primary: Option<Lang>,   // None = abstain (KHÔNG phải Lang::Unknown)
    pub confidence: f32,         // [0,1], calibrated — xem §6.5
    pub spans: Vec<Span>,        // rỗng nếu không segment được
    pub is_mixed: bool,
    pub romanized: bool,         // VI không dấu / telex residue
    pub engine_id: EngineId,     // provenance — BẮT BUỘC, xem §11.4
}

pub struct Span { pub start: usize, pub end: usize,  // byte offset, UTF-8
                  pub lang: Lang, pub confidence: f32 }

pub struct EngineId { pub core_version: &'static str,
                      pub model_hash: &'static str,
                      pub os_engine: Option<OsEngine>,   // None nếu core-only
                      pub os_version: Option<String> }
```

> 📝 **Ba quyết định trong shape này cần bạn xác nhận, đừng nhận mặc định:**
> 1. `primary: Option<Lang>` — abstain là `None`, không phải một biến thể của `Lang`. Buộc consumer
>    phải handle "không biết" tường minh, thay vì âm thầm coi `Unknown` là một ngôn ngữ.
> 2. `spans` dùng **byte offset UTF-8**, không phải char index. Lý do: JS dùng UTF-16, Rust dùng UTF-8,
>    char index sẽ lệch khi có emoji/CJK. Chốt một đơn vị và document rõ ở JS binding.
> 3. `engine_id` — nếu bỏ field này, bạn sẽ không bao giờ debug được divergence Mac/Windows. Xem §11.4.

---

## 2. Hiện trạng hạ tầng

> 📝 Mục này để reviewer hiểu bạn **không xây trên đất trống**. Điền bằng fact + đường dẫn file,
> không phải mô tả chung. Phần dưới đã được điền từ khảo sát repo — **verify lại trước khi publish**
> vì code có thể đã đổi.

### 2.1. `nativelibs` (repo này)

| Hạng mục | Hiện trạng | Đường dẫn |
|---|---|---|
| Modules hiện có | `db-cross-v4, file-utilities, file-utils, logger, mp4thumb, sqlite3, v8-profiles, win-utils, zcall, zfile, zimage, zjxl, zocr, zwalker` | root |
| Rust workspace đã có | ✅ `zocr/host` — có vendored engine core, pattern build per-platform | `zocr/host/Cargo.toml` |
| WASM target | ❌ **Không có.** Không có `wasm32-*` trong build config, không có emcc | — |
| `wasm-bindgen` trong Cargo.lock | Chỉ là transitive dep, target-gated (qua `getrandom`/`pulp`) — không build ra wasm | `zocr/host/Cargo.lock` |
| Convention | 1 module = 1 thư mục + `README.md` | `zocr/README.md`, `zfile/README.md` |

**Kết luận hạ tầng:** `[[FILL: 1-2 câu — repo này native-only, việc thêm wasm target là hạ tầng MỚI, cần tính vào effort §12]]`

### 2.2. `zalo-pc-app` — kiến trúc WASM hiện tại

> 📝 Đây là phần reviewer desktop/web sẽ đọc kỹ nhất. Giữ nguyên các đường dẫn file — nó chứng minh
> bạn đã đọc code thật.

**Toolchain:** `wasm-bindgen` (Rust) là toolchain duy nhất. 5 module wasm đang ship, không có emcc.

| Module | Binary | Size | Đường dẫn |
|---|---|---|---|
| Trusted-device protocol (E2EE, device linking) | `trusted_device_protocol_bg.wasm` | 350 KB | `src/utils/zprotocol/infrastructure/trust-protocol/libzproto.worker/wasm/` |
| Sync v2 — sync proto | `libzproto_wasm_bg.wasm` | 291 KB | `src/zalo/features/sync-v2/shared/sync-proto/wasm/` |
| Sync v2 — message backup | `libzproto_backup_wasm_bg.wasm` | 130 KB | `src/zalo/features/sync-v2/backup-service/backup-proto/wasm/` |
| Web-login bridge (secure auth) | `trusted_auth_bridge_bg.wasm` | 244 KB | `src/zalo/web-login-bridge/protocol/bridge-secure/native/wasm/` |
| Web-login bridge playground | `libzproto_wasm_bg.wasm` | 387 KB | `src/zalo/web-login-bridge/_playground/core/native/wasm/` |

Ngoài ra có 2 wasm path không commit binary vào `src`:
- **AES-GCM trong worker** — `src/file/aes-crypto/aes-wasm/` (`AesGcmWasmFactory`), bootstrap ở `src/file/wasm/boostrap.ts`, health-check qua `WORKER_ROUTER.TEST_WASM` (`src/file/download-optimize/worker/ping-wasm.middleware.ts`)
- **libjxl codec** — `src/utils/images/jxl-decoder/infra/{decoder,encoder}/wasm.ts`, `src/utils/images/resize/infrastructure/factories/libjxl.wasm.resizer.ts`

**Pattern có thể tái sử dụng — 4 thứ:**

1. **Load qua webpack asset** — `import wasmUrl from './wasm/xxx_bg.wasm'`; `*.wasm` khai báo là module trả string path (`global.d.ts:146`); glue `fetch` rồi `instantiateStreaming`, fallback `instantiate` khi MIME sai (`libzproto.js:1127-1140`).
2. **Native-vs-wasm selection qua factory** — `src/utils/images/resize/infrastructure/factories/resizer.factory.ts:29-40`, gate bằng `__PLATFORM__ !== 'WEB'` + remote config `ImageLoaderConfig.nestedKey('offload_config.*')`. → **wasm là tier cho WEB, native addon cho desktop.** Chính là shape cần cho feature này.
3. **Worker pool + router tập trung** — `WORKER_ROUTER` enum (`worker-event-handler.ts:1-16`), `WorkerEventHandler` middleware chain, `PoolWorker.getWorkerByType()`, `WorkerHelper.postMessageAsync(worker, route, payload, [buffer])` với transfer list zero-copy.
4. **Resilience + QoS** — `TrustedProtocolLibWrapper.callWasmSafe()` bắt `WebAssembly.RuntimeError` → re-init → retry; `fibonacciRetry` + `MAX_ATTEMPT_INIT_WASM=3`; `PromiseWait` dedupe concurrent init. `SIMDBoostrap` probe SIMD bằng `WebAssembly.validate` → QoS `97135` (WEB) / `97136` (desktop).

### 2.3. Nợ kỹ thuật của hạ tầng wasm hiện tại

> 📝 Nêu ra để (a) không lặp lại, (b) justify vì sao thiết kế mới làm khác. Mỗi dòng có bằng chứng.

| # | Vấn đề | Bằng chứng | Ảnh hưởng tới feature này |
|---|---|---|---|
| D1 | Glue JS bị sửa tay — comment out `new URL(..., import.meta.url)` → mỗi lần regen `wasm-bindgen` phải patch lại | `libzproto.js:1506-1507`; tái diễn ở commit `ZPC-686 config wasm absolute path` | Phải dùng `--target bundler` + fix bằng webpack config, **không patch file sinh tự động** |
| D2 | 3/5 module là biến thể `libzproto` trùng nhau (~1 MB dư), không có shared loader/registry | `sync-proto/`, `backup-proto/`, `_playground/` | Nên thiết kế 1 loader dùng chung ngay từ đầu |
| D3 | `libzproto.binary.js` 2.1 MB inline bytes nằm trong repo nhưng **đang tắt** | `native-bridge.ts:19` đã comment | Không đi theo hướng inline base64 |
| D4 | Không cache `WebAssembly.Module` → mỗi cold start compile lại | không thấy `compileStreaming` + IndexedDB | Cơ hội cải thiện — xem §11.5 |
| D5 | Loading remote đã gãy thật trên field | commits: `ZPC-740 fix wasm lib load failure under poor network`, `ZPC-317 cache busting`, `ZPC-317 shorter TTL`, `c996596c support fallback wasm` | Model phải bundle, **không fetch remote** |

### 2.4. Ràng buộc từ hạ tầng

> 📝 Liệt kê ràng buộc **cứng** — thứ thiết kế không được phá.

| # | Ràng buộc | Nguồn |
|---|---|---|
| K1 | Toolchain wasm = `wasm-bindgen`/Rust. Thêm emcc = thêm toolchain thứ 2 vào CI. | §2.2 |
| K2 | Không có SharedArrayBuffer / COOP-COEP header trên Zalo Web → **không dùng wasm threads** (`wasm-bindgen-rayon` loại) | `[[FILL: confirm với team infra web]]` |
| K3 | Bundle size budget cho Web | `[[FILL: hỏi team web — con số KB cụ thể]]` |
| K4 | Electron version / Node ABI version cho napi addon | `[[FILL]]` |
| K5 | OS version tối thiểu phải support | `[[FILL: vd. macOS 11+, Windows 10 1809+ — hỏi team release]]` |
| K6 | Browser matrix phải support (Zalo Web) | `[[FILL: lấy từ analytics thật, không đoán]]` |

---

## 3. Xác định đúng đối tượng & đúng bài toán

> 📝 **Mục này quyết định spec thành hay bại.** Sai ở đây thì mọi benchmark phía sau đều vô nghĩa
> vì bạn đo sai thứ. Dành thời gian nhiều nhất cho §3.

### 3.1. Đối tượng dữ liệu (unit of detection)

> 📝 Chốt chính xác bạn detect trên cái gì. Mỗi lựa chọn cho ra một bài toán khác nhau.

| Câu hỏi | Trả lời | Ghi chú |
|---|---|---|
| Đơn vị detect là gì? | `[[FILL: 1 message / 1 conversation / 1 đoạn user đang gõ / 1 file name]]` | |
| Detect lúc nào? | `[[FILL: on-receive / on-render / on-demand khi user bấm / khi index]]` | Quyết định latency budget |
| Volume ước tính | `[[FILL: N detect/giây ở peak, M detect/ngày/user]]` | Quyết định có cần cache/batch |
| Có cần detect lại không? | `[[FILL: 1 lần rồi cache theo message id, hay mỗi lần render?]]` | |
| Text có sẵn plaintext ở tầng nào? | `[[FILL: renderer / worker / main — ảnh hưởng chỗ đặt engine]]` | E2EE: chỉ plaintext sau decrypt |

### 3.2. Phân bố dữ liệu thật

> 📝 **Không đoán bảng này.** Lấy từ sample thật (xem §6.1 cách lấy sample hợp pháp).
> Đây là bảng mà toàn bộ phần còn lại của spec dựa vào: nó nói cho bạn biết tối ưu cho bucket nào.
> Nếu bucket "VI không dấu" chiếm 30% thì mọi lib off-the-shelf đều fail 30% traffic — và đó là
> luận điểm trung tâm của spec.

| Bucket | % traffic | Ví dụ thật (đã anonymize) |
|---|---|---|
| VI có dấu, đầy đủ | `[[FILL]]` | `[[FILL]]` |
| VI **không dấu** | `[[FILL]]` | `[[FILL]]` |
| VI teencode / viết tắt | `[[FILL]]` | `[[FILL]]` |
| VI + EN **mixed** | `[[FILL]]` | `[[FILL]]` |
| EN thuần | `[[FILL]]` | `[[FILL]]` |
| zh / ja / ko | `[[FILL]]` | `[[FILL]]` |
| th / km / lo (thị trường khác) | `[[FILL]]` | `[[FILL]]` |
| Noise-only (emoji / sticker / số / URL) | `[[FILL]]` | `[[FILL]]` |
| Telex/VNI residue chưa convert | `[[FILL]]` | `[[FILL]]` |

**Phân bố độ dài:**

| Độ dài | % traffic |
|---|---|
| 1–3 token | `[[FILL]]` |
| 4–10 token | `[[FILL]]` |
| 11–30 token | `[[FILL]]` |
| > 30 token | `[[FILL]]` |

> 📝 **Cảnh báo diễn giải:** nếu bucket 1–3 token chiếm phần lớn (rất có thể, chat là vậy), thì
> "accuracy tổng thể 92%" của bất kỳ lib nào cũng vô nghĩa — vì lib nào cũng tệ ở text ngắn.
> Đây là lý do §7 bắt buộc report **per-bucket**, không report aggregate.

### 3.3. Tập ngôn ngữ cần support (allowlist)

> 📝 **Giới hạn tập ngôn ngữ là đòn tăng accuracy mạnh nhất và rẻ nhất.** Mọi lib đều có API
> allowlist/constraint. Đừng support 176 ngôn ngữ khi user của bạn dùng 6.

| Tier | Ngôn ngữ | Lý do | Ngưỡng accuracy yêu cầu |
|---|---|---|---|
| T1 — bắt buộc | `[[FILL: vd. vi, en]]` | `[[FILL]]` | `[[FILL]]` |
| T2 — quan trọng | `[[FILL: vd. zh-Hans, ja, ko, th]]` | `[[FILL]]` | `[[FILL]]` |
| T3 — best effort | `[[FILL]]` | `[[FILL]]` | `[[FILL]]` |
| Không support | `[[FILL]]` | trả `None` (abstain) | — |

### 3.4. Bài toán thật là gì (reframe)

> 📝 Mục này để tránh cái bẫy lớn nhất. Viết ra tường minh, reviewer sẽ cảm ơn bạn.

**Bài toán KHÔNG phải:** single-label document classification (`text → 1 language`).

**Bài toán THẬT LÀ:** token-level sequence labeling + aggregation, với hai đặc thù không lib nào cover:
1. Một ngôn ngữ **mất hệ thống dấu** (VI không dấu) → n-gram profile train trên text có dấu không match
2. **Code-switching trong cùng script Latin** (VI + EN loanword) → API document-level không biểu diễn được

`[[FILL: bổ sung đặc thù thứ 3 nếu §3.2 lộ ra thêm]]`

**Hệ quả:** một classifier trả 1 nhãn là **shape sai**. Output contract ở §1.5 (spans + is_mixed + abstain) là shape đúng. Mọi lib ở §7 sẽ bị đánh giá cả trên tiêu chí *"có biểu diễn được shape này không"*, không chỉ accuracy.

---

## 4. Requirements

> 📝 Mỗi requirement phải **đo được**. Nếu không viết được cách đo, đó là nguyện vọng, không phải requirement.
> Cột "Cách đo" trỏ tới metric ở §6.3. Cột ngưỡng là **cam kết** — sẽ dùng ở §10 để judge pass/fail.

### 4.1. Functional

| ID | Requirement | Ngưỡng | Cách đo | Priority |
|---|---|---|---|---|
| FR1 | Detect đúng ngôn ngữ trội của 1 message | `[[FILL: top-1 acc ≥ X% trên bucket T1]]` | §6.3 M1 | P0 |
| FR2 | Nhận diện VI không dấu | `[[FILL: recall ≥ X% trên bucket VI-ascii]]` | §6.3 M1 | P0 |
| FR3 | Nhận diện message mixed + trả spans | `[[FILL: is_mixed F1 ≥ X%, span boundary F1 ≥ Y%]]` | §6.3 M4 | `[[FILL]]` |
| FR4 | Abstain khi không đủ tín hiệu | `[[FILL: precision ≥ X% ở ngưỡng conf mặc định]]` | §6.3 M3 | P0 |
| FR5 | Kết quả **giống nhau** giữa Web / macOS / Windows | `[[FILL: divergence rate ≤ X%; 0 flip primary trên bucket VI & CJK]]` | §6.3 M8 | P0 |
| FR6 | Hoạt động khi OS API không khả dụng | Degrade về core-only, không throw | §6.3 M7 | P0 |
| FR7 | `[[FILL]]` | `[[FILL]]` | `[[FILL]]` | `[[FILL]]` |

### 4.2. Non-functional

| ID | Requirement | Ngưỡng | Cách đo |
|---|---|---|---|
| NFR1 | Latency 1 detect (input ≤ 512B) | `[[FILL: p50 ≤ X µs, p95 ≤ Y µs, p99 ≤ Z ms]]` | §6.3 M5 |
| NFR2 | Không block main thread | `[[FILL: long-task > 50ms = 0]]` | §6.3 M5 |
| NFR3 | Size — wasm + model (Web) | `[[FILL: ≤ X KB brotli]]` (tham chiếu: module lớn nhất hiện tại 387 KB) | §6.3 M6 |
| NFR4 | Size — native addon (desktop) | `[[FILL]]` | §6.3 M6 |
| NFR5 | Cold start (init + first detect) | `[[FILL: ≤ X ms]]` | §6.3 M5 |
| NFR6 | Memory sau init | `[[FILL: RSS delta ≤ X MB]]` | §6.3 M6 |
| NFR7 | Determinism: cùng input → cùng output | 100%, mọi platform, mọi lần chạy | §6.3 M8 |
| NFR8 | Browser support | `[[FILL: theo K6 ở §2.4]]` | §6.3 M7 |
| NFR9 | `[[FILL]]` | `[[FILL]]` | `[[FILL]]` |

### 4.3. Ràng buộc vận hành

| ID | Ràng buộc |
|---|---|
| OR1 | Model phải **bundle**, không fetch remote (bài học D5, §2.3) |
| OR2 | Mọi kết quả mang `engine_id` để invalidate được khi model/OS đổi |
| OR3 | Có QoS metric trên field cho: tỉ lệ OS tier khả dụng, abstain rate, latency p95 |
| OR4 | Có feature flag tắt được từ remote config, không cần release |
| OR5 | `[[FILL]]` |

---

## 5. Problems — phân rã bài toán con

> 📝 Đây là danh sách sẽ được dùng làm **checklist đánh giá** cho từng giải pháp ở §7 và §8, và làm
> **proof obligation** ở §10. Mỗi problem phải: (a) độc lập đánh giá được, (b) có ví dụ input cụ thể,
> (c) trace được về requirement nào.
>
> Bảng dưới đã liệt kê các problem đã xác định qua phân tích. Thêm/sửa theo §3.2 của bạn.

| ID | Problem | Ví dụ input | Vì sao khó | Requirement liên quan | Severity |
|---|---|---|---|---|---|
| **P1** | **VI không dấu** — chính tả mất toàn bộ hệ dấu | `khong co gi dau ban oi` | n-gram profile của mọi lib train trên VI **có dấu** → feature space không khớp. Text trở thành ASCII thuần, cạnh tranh trực tiếp với EN/ID/MS | FR2 | **Critical** |
| **P2** | **Mixed language trong cùng script Latin** | `mai mình meeting với client nhé` | API document-level chỉ trả 1 nhãn. Không phân biệt được "câu VI có từ vay EN" vs "câu EN thật" | FR3 | **Critical** |
| **P3** | **Text cực ngắn** (1–3 token) | `ok`, `chua`, `dc ko` | Không đủ tín hiệu thống kê. `chua` = VI(chưa/chua/chùa) hoặc noise | FR1, FR4 | **High** |
| **P4** | **Teencode / viết tắt** | `k dc dau b`, `ntn`, `cx`, `nhma` | Không có trong bất kỳ lexicon/corpus training nào | FR2 | **High** |
| **P5** | **Từ vay EN đã nhập tịch** | `ok`, `check`, `file`, `deadline`, `meeting` | Phải ra `primary: vi, is_mixed: true` — **không phải** `en`. Không lib nào biết ranh giới này cho tiếng Việt | FR1, FR3 | **High** |
| **P6** | **Va chạm âm tiết: pinyin / romaji vs VI** | `ni hao`, `hao`, `ma`, `lan` | `ni`, `hao`, `ma` đều là âm tiết VI **hợp lệ** → syllable-ratio approach false-positive nặng | FR1 | **High** |
| **P7** | **Cross-platform divergence** | cùng 1 message trên Mac/Win/Web | Nếu mỗi platform dùng engine khác → kết quả khác → bug không reproduce, cache/index nhiễm bẩn | FR5, NFR7 | **High** |
| **P8** | **Noise-only input** | `😂😂`, `:))`, `123`, `https://...`, `@user` | Không có nội dung ngôn ngữ. Đoán bừa = false positive tốn kém | FR4 | **Medium** |
| **P9** | **Telex/VNI residue** | `khoong`, `dduocj`, `a1`, `o7` | Sequence gõ chưa được IME convert. Không giống VI mà cũng không giống gì khác | FR2 | **Medium** |
| **P10** | **Unicode normalization** | `ế` = U+1EBF hoặc `ê`+U+0301 | VI tồn tại cả 2 dạng. Không NFC trước → lexicon miss, n-gram lệch | FR1 | **Medium** |
| **P11** | **Lặp ký tự biểu cảm** | `khoongggg`, `duocccc`, `haaaa` | Phá lookup lexicon | FR2 | **Medium** |
| **P12** | **Trộn có dấu + không dấu trong 1 message** | `mình ko biết nữa` | Nửa message match profile VI, nửa không | FR1, FR2 | **Medium** |
| **P13** | **VI ↔ ngôn ngữ Latin gần** | vi_ascii vs `ms`, `id`, `tl` | Sau khi bỏ dấu, VI giống các ngôn ngữ Đông Nam Á khác dùng Latin | FR1 | **Medium** |
| **P14** | **ALL CAPS / mixed case** | `KHONG DUOC`, `KhOnG` | Ảnh hưởng char n-gram nếu không fold case | FR1 | **Low** |
| **P15** | **Tên riêng VI trong câu EN** | `I met Nguyen Van A yesterday` | Token VI hợp lệ trong câu EN thật → false mixed | FR3 | **Low** |
| **P16** | **Zero-width / control chars** | ZWJ, ZWNJ, RTL marks | Phá tokenization | FR1 | **Low** |
| **P17** | `[[FILL: problem riêng của domain bạn phát hiện từ §3.2]]` | `[[FILL]]` | `[[FILL]]` | `[[FILL]]` | `[[FILL]]` |

> 📝 **Ma trận Problem × Solution** — điền sau khi làm §7. Đây là bảng reviewer sẽ nhìn để hiểu
> "vì sao không dùng lib có sẵn". Ký hiệu: ✅ giải quyết được · ⚠️ partial · ❌ không · `—` không áp dụng

| Problem | S1 franc | S2 tinyld | S3 whatlang | S4 lingua | S5 fastText | S6 CLD3 | S7 macOS | S8 macOS+hint | S9 Win ELS | S10 Chrome | **S11 Đề xuất** |
|---|---|---|---|---|---|---|---|---|---|---|---|
| P1 VI không dấu | `[[FILL]]` | | | | | | | | | | |
| P2 Mixed | `[[FILL]]` | | | | | | | | | | |
| P3 Ngắn | | | | | | | | | | | |
| P4 Teencode | | | | | | | | | | | |
| P5 Loanword | | | | | | | | | | | |
| P6 Pinyin collision | | | | | | | | | | | |
| P7 Divergence | | | | | | | | | | | |
| P8 Noise | | | | | | | | | | | |
| P9 Telex residue | | | | | | | | | | | |
| P10 NFC | | | | | | | | | | | |
| P11 Lặp ký tự | | | | | | | | | | | |
| P12 Trộn dấu | | | | | | | | | | | |
| P13 VI vs ms/id | | | | | | | | | | | |
| P14 Case | | | | | | | | | | | |
| P15 Tên riêng | | | | | | | | | | | |
| P16 Control chars | | | | | | | | | | | |

---

## 6. Phương pháp đo — corpus, metric, harness

> 📝 **Đây là mục làm spec này đáng tin.** Viết §6 xong rồi mới đo, không đo trước rồi viết lại
> tiêu chí cho khớp số. Nếu reviewer không reproduce được §7 bằng §6 thì §7 không có giá trị.

### 6.1. Golden corpus

**Nguồn & tính hợp pháp:**

| Câu hỏi | Trả lời |
|---|---|
| Nguồn dữ liệu | `[[FILL: internal dogfood / corpus đã anonymize / tự soạn / public dataset]]` |
| Đã duyệt privacy/legal? | `[[FILL: ai duyệt, ngày nào, ticket nào]]` |
| Cách anonymize | `[[FILL: strip PII, thay tên/số điện thoại bằng placeholder, ...]]` |
| Lưu ở đâu, ai truy cập được | `[[FILL]]` |

> 📝 **Đừng skip mục này.** Corpus chat là dữ liệu người dùng. Nếu chưa có approval thì
> phương án thay thế: tự soạn corpus synthetic dựa trên *pattern* quan sát được (không copy nội dung
> thật) + public dataset (VLSP, UD Vietnamese, OSCAR-vi) + dogfood từ chính team.

**Cấu trúc & kích thước:**

| Bucket (khớp §3.2) | Số sample mục tiêu | Đã có | Ai label | Cách label |
|---|---|---|---|---|
| VI có dấu | `[[FILL: ≥ 500]]` | `[[FILL]]` | `[[FILL]]` | `[[FILL]]` |
| VI không dấu | `[[FILL: ≥ 500]]` | `[[FILL]]` | | |
| VI teencode | `[[FILL: ≥ 300]]` | | | |
| VI+EN mixed | `[[FILL: ≥ 500]]` — **cần label span, không chỉ nhãn document** | | | |
| EN | `[[FILL: ≥ 300]]` | | | |
| zh / ja / ko | `[[FILL]]` | | | |
| th (+ khác) | `[[FILL]]` | | | |
| Noise-only | `[[FILL: ≥ 200]]` | | | |
| Telex residue | `[[FILL: ≥ 100]]` | | | |
| Adversarial (P6, P15) | `[[FILL: ≥ 200]]` — pinyin/romaji, tên riêng VI trong câu EN | | | |

**Stratify chéo theo độ dài:** mỗi bucket trên **phải** có sample ở cả 4 nhóm độ dài của §3.2, tỉ lệ khớp phân bố thật.

> 📝 **Quy tắc labeling — chốt trước khi label, không thì label sẽ không nhất quán:**
> 1. **2 người label độc lập, đo inter-annotator agreement (Cohen's κ).** Nếu κ < 0.8 thì
>    guideline chưa rõ, không phải người label sai — viết lại guideline. Ghi κ vào §6.6.
> 2. Bucket mixed cần label **span** (byte offset + lang). Tốn công nhất, đừng đánh giá thấp.
> 3. Chốt quy ước cho case tranh chấp **trước**: từ vay EN tính là span EN hay không (→ P5)?
>    Tên riêng tính không? Emoji giữa câu có ngắt span không?
> 4. **Hold-out set:** tách 20% corpus, **không dùng để tune**. Chỉ đo 1 lần ở cuối §10.
>    Không có hold-out thì mọi con số ở §7 là overfit.
> 5. Dùng `NLLanguageRecognizer` / ELS / Chrome API làm **oracle offline** để tìm chỗ bất đồng
>    → đẩy ra review tay. Nhanh hơn label mù nhiều.

**Format corpus** (đề xuất — JSONL, 1 sample/dòng):
```jsonl
{"id":"vi_ascii_0001","text":"khong co gi dau ban oi","bucket":"vi_ascii","len_bucket":"4-10","gold":{"primary":"vi","is_mixed":false,"romanized":true,"spans":[{"start":0,"end":22,"lang":"vi"}]},"note":""}
{"id":"mixed_0001","text":"mai mình meeting với client nhé","bucket":"vi_en_mixed","len_bucket":"4-10","gold":{"primary":"vi","is_mixed":true,"romanized":false,"spans":[{"start":0,"end":13,"lang":"vi"},{"start":14,"end":21,"lang":"en"},{"start":22,"end":26,"lang":"vi"},{"start":27,"end":33,"lang":"en"},{"start":34,"end":41,"lang":"vi"}]},"note":"loanword meeting/client — xem P5"}
```

### 6.2. Ứng viên cần benchmark

> 📝 Đừng bỏ **S0**. Không có baseline thì bạn không biết một lib có thực sự cộng thêm gì không.
> Rất hay xảy ra chuyện S0 (rule thuần) đánh bại lib ML trên bucket ngắn.

| ID | Giải pháp | Loại | Platform khả dụng | Ghi chú |
|---|---|---|---|---|
| **S0** | **Baseline: script/Unicode rule thuần** | own, 0 model | tất cả | **Floor bắt buộc phải đo** |
| S1 | `franc` / `franc-min` | pure JS, trigram | tất cả | Nhẹ nhất |
| S2 | `tinyld` | pure JS | tất cả | |
| S3 | `whatlang-rs` → wasm + napi | Rust, trigram | tất cả | |
| S4 | `lingua-rs` → wasm + napi | Rust, n-gram 1..5 | tất cả | Đo **2 biến thể**: full vs `low_accuracy_mode` |
| S5 | fastText `lid.176.ftz` | model ~917 KB | cần runtime (emcc hoặc tự viết loader Rust) | Vi phạm K1 nếu dùng emcc |
| S6 | CLD3 (`cld3-asm`) | NN, emscripten | tất cả | Vi phạm K1 |
| S7 | macOS `NLLanguageRecognizer` — bare | OS native | macOS 10.14+ | |
| S8 | macOS `NLLanguageRecognizer` + `languageConstraints` + `languageHints` | OS native | macOS 10.14+ | **Đo riêng S7 vs S8** — delta này là luận điểm chính |
| S9 | Windows ELS `Microsoft.Language.Detection` | OS native | Win 7+ | |
| S10 | Chrome `LanguageDetector` (built-in AI) | Browser native | Chrome 138+ | Cần `availability()` |
| **S11** | **Đề xuất (§11)** | hybrid | tất cả | |

### 6.3. Metric — định nghĩa chính xác

> 📝 Định nghĩa từng metric bằng công thức, không bằng lời. Hai người đọc phải tính ra cùng con số.

| ID | Metric | Định nghĩa | Đơn vị | Report theo |
|---|---|---|---|---|
| **M1** | Top-1 accuracy | `#(pred.primary == gold.primary) / #samples` | % | **per-bucket × per-len_bucket** |
| **M2** | Macro-F1 | trung bình F1 **không trọng số** qua các lang trong allowlist §3.3 | % | per-bucket |
| **M3** | Precision @ abstain threshold τ | `#(đúng ∧ conf≥τ) / #(conf≥τ)`; kèm coverage `#(conf≥τ)/#samples` | % | vẽ **curve** theo τ ∈ [0,1] |
| **M4** | Mixed metrics | (a) `is_mixed` P/R/F1 · (b) token-level accuracy · (c) span boundary F1 (exact match byte offset) | % | bucket mixed |
| **M5** | Latency | p50/p95/p99 **mỗi call**, warm. Kèm cold-start (init→first result) riêng | µs / ms | per-len_bucket, per-platform |
| **M6** | Footprint | (a) binary bytes · (b) gzip · (c) brotli · (d) RSS delta sau init · (e) peak RSS khi detect | KB / MB | per-platform |
| **M7** | Availability | `#(API khả dụng) / #(lần thử)` trên field | % | per-platform × per-OS-version |
| **M8** | Divergence | `#(kết quả khác nhau giữa ≥2 platform) / #samples`. Tách riêng: **flip `primary`** vs chỉ lệch `confidence` | % | cross-platform |
| **M9** | Determinism | chạy 2 lần cùng input cùng platform → khác nhau? Phải = 0% | % | per-platform |
| **M10** | `[[FILL: metric riêng nếu consumer §1.3 cần]]` | | | |

> 📝 **Ba lỗi đo phổ biến, tránh:**
> - **Report aggregate accuracy.** Vô nghĩa nếu phân bố bucket lệch (§3.2). Luôn per-bucket.
> - **Đo latency chưa warm-up.** Lần gọi đầu gồm cả compile/JIT/page-fault. Warm-up ≥ 1000 lần,
>   rồi mới đo ≥ 10.000 lần. Report p99, không chỉ mean.
> - **Đo trên máy dev.** Máy dev nhanh hơn máy user. Đo thêm trên cấu hình thấp nhất trong K5/K6.

### 6.4. Harness — lệnh chạy lại được

> 📝 Mọi số ở §7 phải sinh từ một lệnh ghi ở đây. Không có lệnh → không được đưa số vào spec.

```bash
# 1. Accuracy — mọi solution, mọi bucket
cargo run -p zlangdetect-cli --release -- bench accuracy \
    --corpus corpus/golden.jsonl \
    --solutions S0,S1,S2,S3,S4,S4low,S5,S6,S7,S8,S9,S11 \
    --group-by bucket,len_bucket \
    --out results/accuracy.json

# 2. Latency — warm-up rồi đo
cargo run -p zlangdetect-cli --release -- bench latency \
    --corpus corpus/golden.jsonl \
    --warmup 1000 --iters 10000 \
    --out results/latency.json

# 3. Divergence cross-platform — chạy TRÊN TỪNG máy rồi so
cargo run -p zlangdetect-cli --release -- bench dump \
    --corpus corpus/golden.jsonl --out results/dump-$(uname -s).json
# rồi:
cargo run -p zlangdetect-cli --release -- bench diverge \
    results/dump-Darwin.json results/dump-Windows.json results/dump-wasm.json

# 4. Footprint
cargo run -p zlangdetect-cli --release -- bench size --out results/size.json

# 5. Web — wasm, đo trong browser thật (không chỉ node)
[[FILL: lệnh/URL harness web]]
```

**Môi trường đo — ghi lại, số liệu không so được nếu thiếu:**

| | |
|---|---|
| Máy macOS | `[[FILL: model, chip, RAM, macOS version]]` |
| Máy Windows | `[[FILL: model, CPU, RAM, Windows build]]` |
| Browser | `[[FILL: Chrome/Edge/Safari + version]]` |
| Rust toolchain | `[[FILL: rustc -V, target list]]` |
| Electron / Node ABI | `[[FILL]]` |
| Corpus commit hash | `[[FILL]]` |
| Ngày đo | `[[FILL]]` |

### 6.5. Calibration của `confidence`

> 📝 Mục hay bị bỏ. `confidence` chỉ hữu ích nếu **calibrated** — conf 0.8 phải nghĩa là đúng ~80%.
> Score thô của lib (đặc biệt lib n-gram) không calibrated. Consumer sẽ set ngưỡng dựa trên
> con số này, nên nó phải có nghĩa.

- Phương pháp: `[[FILL: reliability diagram + Platt scaling / isotonic regression trên tập calib riêng]]`
- Expected Calibration Error (ECE) trước: `[[FILL]]` → sau: `[[FILL]]`
- Tập calibration (tách khỏi train và hold-out): `[[FILL]]`

### 6.6. Chất lượng corpus

| | |
|---|---|
| Inter-annotator agreement (Cohen's κ) | `[[FILL]]` — cần ≥ 0.8 |
| Số sample bị loại vì tranh chấp | `[[FILL]]` |
| Hold-out set size | `[[FILL]]` (20% corpus) |
| Hold-out **chưa** được dùng để tune? | `[[FILL: YES/NO — phải là YES]]` |

---

## 7. Benchmark — kết quả

> 📝 Fill từ `results/*.json`. **Không làm tròn quá mức** (giữ 1 chữ số thập phân). Ô nào chưa đo
> ghi `n/a` + lý do, đừng để trống — trống nhìn như quên.

### 7.1. Accuracy theo bucket (M1, top-1 %)

| Solution | VI có dấu | **VI không dấu** | VI teencode | **VI+EN mixed** | EN | zh/ja/ko | th | Noise (abstain đúng) | Adversarial | **Macro-F1** |
|---|---|---|---|---|---|---|---|---|---|---|
| S0 baseline rule | `[[FILL]]` | | | | | | | | | |
| S1 franc | | | | | | | | | | |
| S2 tinyld | | | | | | | | | | |
| S3 whatlang | | | | | | | | | | |
| S4 lingua (full) | | | | | | | | | | |
| S4low lingua (low-acc) | | | | | | | | | | |
| S5 fastText ftz | | | | | | | | | | |
| S6 CLD3 | | | | | | | | | | |
| S7 macOS bare | | | | | | | | | | |
| S8 macOS +constr+hints | | | | | | | | | | |
| S9 Windows ELS | | | | | | | | | | |
| S10 Chrome LangDetector | | | | | | | | | | |
| **S11 Đề xuất** | | | | | | | | | | |

### 7.2. Accuracy theo độ dài (M1, top-1 %)

> 📝 Bảng này thường là bảng gây sốc nhất. Chuẩn bị tinh thần thấy mọi lib sụp ở cột 1–3 token.

| Solution | 1–3 token | 4–10 token | 11–30 token | > 30 token |
|---|---|---|---|---|
| S0 | `[[FILL]]` | | | |
| S1 … S10 | | | | |
| **S11** | | | | |

### 7.3. Mixed language (M4)

| Solution | `is_mixed` P | `is_mixed` R | `is_mixed` F1 | Token-level acc | Span boundary F1 | Có API trả span? |
|---|---|---|---|---|---|---|
| S1 … S10 | `[[FILL]]` | | | | | `[[FILL: Yes/No — phần lớn là No]]` |
| **S11** | | | | | | Yes |

### 7.4. Precision / coverage trade-off (M3)

> 📝 Vẽ curve, đừng chỉ đưa 1 điểm. Rồi chọn τ theo consumer ở §1.3 — consumer khác nhau chọn τ khác nhau.

| Solution | τ | Coverage % | Precision % |
|---|---|---|---|
| S11 | 0.5 | `[[FILL]]` | `[[FILL]]` |
| S11 | 0.7 | | |
| S11 | 0.9 | | |

**τ chọn cho từng consumer:** `[[FILL: C1 → τ=?, C3 → τ=?]]`

### 7.5. Performance (M5)

| Solution | Platform | Cold start | p50 | p95 | p99 | Throughput (det/s) |
|---|---|---|---|---|---|---|
| S3 whatlang | wasm/Chrome | `[[FILL]]` | | | | |
| S3 whatlang | napi/macOS | | | | | |
| S4 lingua | wasm/Chrome | | | | | |
| S7 macOS bare | napi/macOS | | | | | |
| S8 macOS +hints | napi/macOS | | | | | |
| S9 Windows ELS | napi/Win | | | | | |
| S10 Chrome API | Chrome | | | | | |
| **S11 (fast path — L1/L2 resolve)** | mọi | | | | | |
| **S11 (slow path — có gọi OS)** | macOS/Win | | | | | |

> 📝 Với S11, **bắt buộc tách fast path / slow path**. Fast path là thứ quyết định p50 thực tế
> (vì đa số traffic VI/CJK không chạm OS API); slow path quyết định p99. Trộn 2 cái sẽ che mất
> điểm mạnh của thiết kế. Ghi luôn **% traffic đi fast path** (đo trên corpus): `[[FILL]]`

### 7.6. Footprint (M6)

| Solution | Binary | +Model | gzip | brotli | RSS sau init | Peak RSS |
|---|---|---|---|---|---|---|
| S1 franc-min | `[[FILL]]` | | | | | |
| S3 whatlang wasm | | | | | | |
| S4 lingua wasm (full) | | | | | | |
| S4low lingua wasm (low-acc) | | | | | | |
| S5 fastText | | 917 KB `[[verify]]` | | | | |
| S6 CLD3 | | | | | | |
| S7-S9 OS native | 0 (đã có trong OS) | 0 | — | — | `[[FILL]]` | `[[FILL]]` |
| **S11** | | | | | | |

**Tham chiếu budget:** module wasm lớn nhất đang ship là 387 KB (`_playground/libzproto_wasm_bg.wasm`); module production lớn nhất 350 KB (`trusted_device_protocol_bg.wasm`).

### 7.7. Availability & divergence (M7, M8, M9)

| Solution | Availability (field) | Divergence vs S11-core | Flip `primary`? | Determinism |
|---|---|---|---|---|
| S7/S8 macOS | `[[FILL: % máy có macOS ≥10.14]]` | `[[FILL]]` | `[[FILL]]` | `[[FILL]]` |
| S9 Windows ELS | `[[FILL: % máy load được elscore + service]]` | | | |
| S10 Chrome | `[[FILL: % có availability()=available]]` | | | |
| S11 core-only | 100% | 0 (là reference) | — | `[[FILL: phải 100%]]` |

> 📝 Availability trên field lấy bằng QoS metric, không đo được ở lab. Dùng pattern
> `SIMDBoostrap` (`src/file/wasm/boostrap.ts`, QoS 97135/97136) làm mẫu: ship một probe trước,
> thu số 1-2 tuần, rồi mới quyết định có đầu tư OS tier hay không.

---

## 8. Cơ chế chi tiết & trade-off từng phương pháp

> 📝 Phần cơ chế dưới đây là **kiến thức nền, đã viết sẵn** — bạn chỉ cần verify và fill số đo + kết luận.
> Mỗi mục có cấu trúc: Cơ chế → Ưu → Nhược → Cách implement → Verdict.

### 8.1. S0 — Script / Unicode rule (baseline)

**Cơ chế.** Đếm codepoint theo Unicode script/block: Hangul, Hiragana, Katakana, Han, Thai, Cyrillic, Arabic, Hebrew, Devanagari, Latin. Ngôn ngữ nào có script riêng thì resolve xong ngay. Với Latin, dùng sự hiện diện của ký tự đặc thù (VI: dấu thanh + `đ ă â ê ô ơ ư`; DE: `ß äöü`; ES: `ñ`) làm tín hiệu.

**Ưu**
- 0 byte model, latency ở mức micro-giây
- Deterministic tuyệt đối, giống nhau mọi platform → giải P7 miễn phí
- Resolve gần hết non-Latin và VI-có-dấu

**Nhược**
- Không phân biệt được các ngôn ngữ cùng script (P1, P13)
- Han: không tách được zh vs ja (khi không có kana)
- Vô dụng với ASCII thuần → **không giải P1**

**Implement.** Bảng script từ `unicode-script` crate hoặc tự sinh từ `Scripts.txt` của UCD. ~200 dòng Rust.

**Verdict.** `[[FILL: phải là "floor bắt buộc, luôn chạy làm L1, không đủ một mình"]]`. Số đo: `[[FILL: điền acc từ §7.1 hàng S0]]`

### 8.2. S1/S2 — `franc`, `tinyld` (pure JS)

**Cơ chế.** `franc`: trigram profile sinh từ corpus UDHR; so cosine/out-of-place distance giữa trigram profile của input và của từng ngôn ngữ. `franc-min` (~82 lang) / `franc-all` (~400 lang). `tinyld` tương tự nhưng profile lớn hơn, có thêm heuristic.

**Ưu**
- Không cần wasm, không thêm toolchain → **không vi phạm K1**
- Tích hợp trong 1 buổi, tốt để làm mốc so sánh nhanh
- Có `only`/allowlist option

**Nhược**
- Corpus UDHR là văn bản pháp lý formal → mismatch nặng với chat (P3, P4)
- Chỉ trả document-level, **không giải P2**
- Không giải P1 (profile VI train trên text có dấu)
- Chạy trong JS → chậm hơn wasm/native rõ rệt, và trên main thread thì tốn long-task

**Implement.** `npm i franc-min`; `franc(text, {only: [...], minLength: N})`. Lưu ý `franc` trả ISO-639-3 (`vie`, `eng`) → cần map sang BCP-47.

**Verdict.** `[[FILL]]`

### 8.3. S3 — `whatlang-rs` → wasm + napi

**Cơ chế.** Trigram-based. Với mỗi ngôn ngữ có một tập trigram phổ biến; score = tổng rank của trigram input trong bảng đó. Có bước script-detection trước để hẹp tập candidate. `Detector::with_allowlist(&[Lang::Vie, Lang::Eng, ...])`. Trả `Info { lang, script, confidence }`.

**Ưu**
- Pure Rust, no thread, compile `wasm32-unknown-unknown` sạch → **khớp K1, K2**
- Model nhỏ, một core → build được cả wasm và napi từ cùng source → **giải P7**
- Có `confidence()` để abstain (P8)
- `with_allowlist` tăng accuracy đáng kể (§3.3)

**Nhược**
- Trigram thuần → yếu ở text ngắn (P3)
- Không giải P1, P2, P4, P5 (không có kiến thức về VI orthography, không có span)
- Confidence chưa calibrated (§6.5)

**Implement.**
```toml
whatlang = { version = "0.16", default-features = false }
```
```rust
let det = Detector::with_allowlist(vec![Lang::Vie, Lang::Eng, Lang::Cmn, Lang::Jpn, Lang::Kor, Lang::Tha]);
let info = det.detect(text);  // Option<Info>
```
Build: `wasm-pack build --target bundler` cho web; `napi build --release` cho desktop.

**Verdict.** `[[FILL]]`

### 8.4. S4 — `lingua-rs` → wasm + napi

**Cơ chế.** N-gram 1..5 (uni→penta). Với mỗi ngôn ngữ và mỗi độ dài n, có một model xác suất n-gram (lưu dạng FST nén). Detection = tính log-prob của input dưới từng model, cộng thêm rule-based filter (alphabet check, single-language-character check) để loại candidate trước. `low_accuracy_mode()` bỏ 4-gram và 5-gram → model nhỏ hơn nhiều, accuracy short-text giảm ít.

**Ưu**
- **Accuracy cao nhất trong nhóm n-gram**, đặc biệt trên text ngắn (nhờ 5-gram + rule filter)
- Có **per-language Cargo feature** → chỉ compile ngôn ngữ cần (§3.3), cắt size mạnh
- Trả `confidence_values()` — distribution đầy đủ
- Pure Rust → một core, hai binding (P7)

**Nhược**
- **Size là vấn đề lớn nhất** — cần đo thật với đúng feature set của bạn (§7.6)
- **`rayon` phải tắt.** Bản parallel cần thread; `wasm-bindgen-rayon` yêu cầu SharedArrayBuffer + COOP/COEP header → **vi phạm K2**. Phải build với `default-features = false` và không bật parallel
- Không giải P1, P2, P4, P5 (vẫn là document-level, vẫn train trên VI có dấu)
- Cold start nặng hơn (load + deserialize model lớn)

**Implement.**
```toml
lingua = { version = "1", default-features = false, features = [
    "vietnamese", "english", "chinese", "japanese", "korean", "thai",
    # [[FILL: khớp allowlist §3.3]]
] }
```
```rust
let detector = LanguageDetectorBuilder::from_languages(&[...])
    .with_low_accuracy_mode()          // đo cả 2 biến thể
    .with_minimum_relative_distance(0.9)
    .build();
```
> 📝 **Đo bắt buộc:** size wasm với (a) full feature set của bạn, (b) + `low_accuracy_mode`.
> Delta accuracy vs delta size chính là quyết định S4 vs S4low. Điền vào §7.1 và §7.6.

**Verdict.** `[[FILL]]`

### 8.5. S5 — fastText `lid.176.ftz`

**Cơ chế.** Supervised fastText: embedding cho char n-gram + word, average pooling, softmax trên 176 nhãn ngôn ngữ. `.ftz` là bản **quantized** (product quantization) → ~917 KB. Inference = lookup embedding + average + một phép nhân ma trận nhỏ.

**Ưu**
- Accuracy/size tốt nhất trong nhóm, mạnh cả trên text ngắn
- 176 ngôn ngữ trong <1 MB
- Inference đơn giản về mặt toán học (~200 dòng nếu tự viết)

**Nhược**
- **Runtime là vấn đề.** Bản chính thức là C++ → cần emcc → **vi phạm K1** (thêm toolchain thứ 2 vào CI). Hoặc tự viết loader `.ftz` bằng Rust — khả thi nhưng phải tự parse format quantized, ước `[[FILL: effort]]`
- Vẫn document-level → không giải P2
- Không giải P1, P4, P5
- Model là blob nhị phân của bên thứ 3, khó tune theo domain

**Implement — 2 nhánh:**
- (a) `fasttext.wasm.js` / emcc build → nhanh nhưng vi phạm K1
- (b) Tự viết reader `.ftz` trong Rust: parse header → dict → quantized matrix (PQ codebook) → forward pass. Giữ được K1.

**Verdict.** `[[FILL]]`

### 8.6. S6 — CLD3

**Cơ chế.** Neural: embedding của n-gram (1..3) trên các "fragment" của text → average → hidden layer → softmax. ~107 ngôn ngữ. Bản gốc C++ (protobuf model), `cld3-asm` là build emscripten.

**Ưu**
- Mạnh trên text ngắn (thiết kế cho mục đích đó)
- Đã có npm package sẵn dùng
- Có `findMostFrequentLanguages` trả nhiều candidate

**Nhược**
- emscripten → **vi phạm K1**
- Không có binding Rust chín → khó dùng chung cho napi tier
- Document-level; không giải P1, P2, P4, P5
- Model protobuf, không tune được

**Implement.** `npm i cld3-asm`; `const factory = await loadModule(); const id = factory.create(minBytes, maxBytes); id.findLanguage(text)`.

**Verdict.** `[[FILL]]`

### 8.7. S7 / S8 — macOS `NLLanguageRecognizer`

**Cơ chế.** Natural Language framework (macOS 10.14+). Model on-device của Apple (không public chi tiết). API:
- `processString(_:)` → nạp text
- `dominantLanguage` → `NLLanguage?`
- `languageHypotheses(withMaximum:)` → `[NLLanguage: Double]` — **có xác suất thật**
- `languageConstraints: [NLLanguage]` → **giới hạn tập candidate**
- `languageHints: [NLLanguage: Double]` → **prior probability**
- `reset()` → tái sử dụng instance

**Ưu**
- 0 byte ship, Apple maintain, coverage rộng, chất lượng tốt trên text well-formed
- `languageConstraints` → hẹp về allowlist §3.3, accuracy tăng ngay
- ★ **`languageHints` là đòn mạnh nhất:** feed posterior của rule layer VI vào làm **prior** cho model Apple. Bằng chứng syllable-FST *chảy vào trong* model thay vì cạnh tranh với nó:
  ```swift
  recognizer.languageHints = [.vietnamese: 0.7, .english: 0.3]
  ```
  → được chất lượng model Apple **đã điều kiện hoá theo domain knowledge của mình**. Không lib off-the-shelf nào cho được điều này.
- `languageHypotheses` cho distribution → map thẳng thành score cho voter

**Nhược**
- **macOS only** → không giải được gì cho Web, và tự nó tạo ra P7
- Model đi theo OS version → kết quả đổi âm thầm khi user update OS → nhiễm bẩn dữ liệu đã cache/index
- **Document-level → không giải P2** (không có span)
- Không biết gì về VI không dấu / teencode → **không giải P1, P4, P5**
- Chi phí: ObjC dispatch + alloc mỗi call, chậm hơn Rust n-gram cỡ một order of magnitude
- **Không thread-safe** → 1 instance/thread hoặc serialize

**Implement.**
- Binding: `objc2` + framework crate cho NaturalLanguage. Nếu binding crate thiếu API cần → viết **ObjC shim nhỏ** (`.m` file + `cc` crate), đường an toàn hơn.
- **Reuse một instance**, gọi `reset()` giữa các lần — đừng tạo mới mỗi call.
- Wrap trong napi `AsyncTask` → **không chạy trên main thread**.
- Guard version: `if #available(macOS 10.14)` / kiểm tra class tồn tại trước khi dùng.

> 📝 **Đo S7 và S8 riêng.** Delta giữa chúng chính là bằng chứng cho luận điểm "OS API đáng dùng
> khi được feed prior". Nếu delta nhỏ thì `languageHints` không hiệu quả và OS tier mất phần lớn giá trị.

**Verdict.** `[[FILL]]`

### 8.8. S9 — Windows ELS (Extended Linguistic Services)

**Cơ chế.** `elscore.dll`, API C phẳng (không phải COM interface phức tạp):
1. `MappingGetServices` — enumerate service, tìm `Microsoft.Language.Detection`
2. `MappingRecognizeText` — nạp text, nhận `MAPPING_PROPERTY_BAG`
3. Đọc `MAPPING_DATA_RANGE[]` → `pszDescription` = language tag, **theo thứ tự rank**
4. `MappingFreeResults`, `MappingFreeServices`

ELS còn có **Script Detection service** → trả *ranges theo script trong text*, tức một segmentation primitive miễn phí.

**Ưu**
- 0 byte ship, có từ Win 7
- API C phẳng → bind từ Rust dễ (`windows` crate, `Win32::Globalization`) hoặc `extern "system"` thủ công
- Script Detection cho ranges → hữu ích cho cross-check L1

**Nhược**
- ★ **Không có confidence score** — chỉ có thứ tự rank. Đây là hạn chế nghiêm trọng cho scheme voting: phải convert rank → pseudo-score bằng decay cố định (`score = decay^rank`), và đặt weight thấp hơn macOS
- Chất lượng cho tiếng Việt **không có tài liệu** → phải đo mới biết (§7.1)
- Yếu trên text ngắn
- Document-level → không giải P2
- Không giải P1, P4, P5
- `MappingGetServices` đắt → phải cache; `MappingFreeResults` bắt buộc mỗi call → **leak nếu quên**
- Thread-safety không được document rõ → coi như cần sync ngoài
- Windows only → tự nó tạo ra P7

**Implement.**
- Cache `MAPPING_SERVICE_INFO` **một lần cho cả process lifetime**
- Wrap `MAPPING_PROPERTY_BAG` trong **RAII guard Rust** — `Drop` gọi `MappingFreeResults`. Không làm là leak
- Chạy trên worker thread qua napi `AsyncTask`
- Fallback: `LoadLibrary("elscore.dll")` fail hoặc service không enumerate được → core-only

> 📝 `[[FILL: verify GUID/tên service và signature hàm với MSDN hiện tại trước khi code —
> đừng hardcode GUID lấy từ blog cũ. Enumerate bằng MappingGetServices thay vì hardcode nếu được.]]`

**Verdict.** `[[FILL]]`

### 8.9. S10 — Chrome `LanguageDetector` (built-in AI)

**Cơ chế.** On-device model của Chrome (Chrome 138+), thuộc nhóm built-in AI API. Flow: `LanguageDetector.availability()` → `LanguageDetector.create()` (có thể trigger download model) → `detector.detect(text)` → array `{detectedLanguage, confidence}`.

**Ưu**
- 0 byte ship trên Web, Google maintain
- Có confidence score
- On-device → không gửi text ra ngoài

**Nhược**
- **Chrome-only, 138+** → cần fallback cho mọi browser khác trong K6 → **core vẫn phải build**
- **Async/Promise** → không nhét được vào lời gọi wasm sync
- Model có thể chưa download → `availability()` trả `downloadable`/`downloading` → không dùng được ngay
- Document-level → không giải P2
- Không giải P1, P4, P5
- API còn đang chuẩn hoá, shape có thể đổi

**Implement.** Ở tầng **JS**, như một **async refinement pass**: chạy core (sync, wasm) trước cho kết quả tức thì; nếu `confidence < τ` thì gọi Chrome API để upgrade. Không bao giờ block kết quả đầu tiên.

> 📝 `[[FILL: verify tên API và shape hiện tại — API này còn đang thay đổi, tên trước đây là ai.languageDetector]]`

**Verdict.** `[[FILL]]`

### 8.10. Tổng hợp trade-off

| Solution | Giải P1 | Giải P2 | Cross-platform | Vi phạm K? | Size | Tune theo domain |
|---|---|---|---|---|---|---|
| S0 | ❌ | ❌ | ✅ | — | 0 | ✅ |
| S1/S2 | ❌ | ❌ | ✅ | — | nhỏ | ❌ |
| S3 | ❌ | ❌ | ✅ | — | nhỏ | ❌ |
| S4 | ❌ | ❌ | ✅ | — | **lớn** | ❌ |
| S5 | ❌ | ❌ | ✅ | **K1** (nhánh a) | ~1 MB | ❌ |
| S6 | ❌ | ❌ | ✅ | **K1** | ~2 MB | ❌ |
| S7/S8 | ❌ | ❌ | **❌ macOS only** | — | 0 | ⚠️ chỉ qua hints |
| S9 | ❌ | ❌ | **❌ Win only** | — | 0 | ❌ |
| S10 | ❌ | ❌ | **❌ Chrome only** | — | 0 | ❌ |

> 📝 **Kết luận cần rút ra từ bảng này (verify bằng số của bạn):** không giải pháp có sẵn nào
> giải được P1 hoặc P2 — hai problem Critical. Đây là lý do phải có S11.
> Nếu số liệu của bạn cho thấy khác, **sửa kết luận theo số liệu**, đừng sửa số theo kết luận.

---

## 9. Kết luận từ benchmark

> 📝 Viết mục này **sau khi** §7 đã fill xong. Mỗi câu phải trỏ về một ô cụ thể trong §7.

### 9.1. Ba phát hiện chính

1. `[[FILL: vd. "Không lib có sẵn nào vượt X% trên bucket VI-không-dấu (§7.1) — trong khi bucket này chiếm Y% traffic (§3.2)"]]`
2. `[[FILL: vd. "Không lib nào có API trả span (§7.3) → P2 không giải được bằng cách chọn lib"]]`
3. `[[FILL: vd. "S8 hơn S7 Z điểm nhờ constraints+hints → OS API đáng dùng NẾU được feed prior"]]`

### 9.2. Vì sao không chọn thuần một giải pháp có sẵn

| Solution | Lý do loại (kèm số) |
|---|---|
| S1/S2 | `[[FILL]]` |
| S3 | `[[FILL]]` |
| S4 | `[[FILL]]` |
| S5/S6 | `[[FILL]]` |
| S7-S10 | `[[FILL]]` |

### 9.3. Thành phần đáng giữ lại từ các giải pháp có sẵn

> 📝 Đừng loại sạch. Chỉ ra cái nào dùng lại được — spec sẽ đáng tin hơn nhiều so với "tự viết hết".

| Thành phần | Từ đâu | Dùng vào đâu trong S11 |
|---|---|---|
| Script segmentation | S0 | L1 |
| Char n-gram scorer | `[[FILL: S3 hoặc S4]]` | Voter V1 |
| `languageConstraints` + `languageHints` | S8 | Voter V2 (macOS) |
| Script Detection ranges | S9 | Cross-check L1 trên Windows |
| Async refinement | S10 | Voter V2 (Web) |

---

## 10. Proof Obligations — chốt TRƯỚC KHI ĐO

> 📝 ⚠️ **Mục này phải fill xong và được reviewer ký TRƯỚC khi bạn chạy benchmark S11.**
> Đây là pre-registration. Nếu set ngưỡng sau khi thấy số, bạn chỉ đang hợp lý hoá kết quả,
> và spec mất giá trị chứng minh. Ghi ngày chốt + ai duyệt.
>
> **Ngày chốt:** `[[FILL]]` · **Duyệt bởi:** `[[FILL]]`

| Problem | Metric chứng minh | Ngưỡng PASS | Đo trên | Kết quả | Verdict |
|---|---|---|---|---|---|
| P1 VI không dấu | M1 trên bucket `vi_ascii` | `[[FILL: ≥ X%]]` | hold-out | `[[FILL]]` | `[[FILL]]` |
| P2 Mixed | M4 `is_mixed` F1 **và** span boundary F1 | `[[FILL]]` | hold-out | | |
| P3 Ngắn | M1 trên len_bucket 1–3 | `[[FILL]]` | hold-out | | |
| P4 Teencode | M1 trên bucket `vi_teencode` | `[[FILL]]` | hold-out | | |
| P5 Loanword | `[[FILL: % câu VI-có-loanword ra primary=vi]]` | `[[FILL]]` | hold-out | | |
| P6 Pinyin collision | M1 trên bucket adversarial | `[[FILL]]` | hold-out | | |
| P7 Divergence | M8 | `[[FILL: ≤ X% và 0 flip primary trên VI/CJK]]` | golden, 3 platform | | |
| P8 Noise | M3 precision @ τ mặc định | `[[FILL]]` | hold-out | | |
| P9 Telex | M1 trên bucket telex | `[[FILL]]` | hold-out | | |
| P10-P16 | `[[FILL: unit test — pass/fail, không cần metric]]` | 100% pass | test suite | | |
| NFR1 latency | M5 | `[[FILL]]` | mọi platform | | |
| NFR3 size | M6 brotli | `[[FILL]]` | wasm build | | |
| NFR7 determinism | M9 | 100% | mọi platform | | |

**Điều kiện GO/NO-GO cho S11:** `[[FILL: vd. "toàn bộ dòng Critical/High PASS; ≤1 dòng Medium FAIL và có mitigation"]]`

---

## 11. Đề xuất: S11 — Hybrid, OS làm voter bị chặn trọng số

> 📝 Kiến trúc dưới đây đã được thiết kế theo các problem §5 và ràng buộc §2.4.
> Bạn cần: (a) verify lại theo số liệu §7, (b) fill các tham số `[[FILL]]`, (c) sửa nếu số liệu nói khác.

### 11.1. Nguyên tắc thiết kế

1. **Core là floor, không optional.** Web không có OS API (S10 chỉ Chrome 138+) → core phải build dù thế nào. OS libs là **tier cộng thêm trên desktop**, không phải thay thế.
2. **OS detector là một voter**, không phải source of truth. Cắm vào đúng một chỗ (L4), mọi tầng khác là code của mình → span logic và VI logic bit-identical mọi platform.
3. **Rule layer đi trước model layer.** VI orthography là hệ **hữu hạn, đóng** → khai thác được bằng rule, chính xác hơn mọi model thống kê trên P1/P4/P9.
4. **Abstain là câu trả lời hợp lệ.** Precision > recall cho phần lớn consumer (§1.3).

### 11.2. Pipeline (giống nhau trên cả 3 platform)

```
raw text
 ↓ [L0] normalize: NFC → strip URL/@mention/#tag/emoji/phone → collapse repeat ≥3 → case-fold
 ↓ [L1] script segmentation → runs                        ← own code, deterministic
 ↓ [L2] VI rule layer: syllable FST + teencode + telex     ← own code, deterministic
 ↓      → prior P(vi), P(vi_ascii), romanized flag
 ↓ [L3] candidate allowlist ← từ L1 + L2
 ↓ [L4] voters, mỗi voter emit (lang, score):
 ↓        V1  own char n-gram             [mọi platform]
 ↓        V2  OS detector                 [macOS/Win/Chrome — CÓ GATE, xem 11.4]
 ↓        V3  VI rule score               [mọi platform]
 ↓ [L5] fusion → per-token emission → Viterbi smoothing → spans
 ↓ [L6] aggregate → Detection (§1.5)
```

### 11.3. Giải P1 (VI không dấu) — khai thác tính hữu hạn của chính tả

> 📝 Đây là đóng góp kỹ thuật trung tâm của spec. Viết kỹ, reviewer sẽ challenge chỗ này.

Tiếng Việt **đơn âm tiết**, mỗi âm tiết là một token phân cách bởi whitespace, và tập âm tiết hợp lệ là **tập đóng hữu hạn**.

| Thành phần | Cơ chế | Size | Giải |
|---|---|---|---|
| **Syllable-validity ratio** ★ | "% token là âm tiết VI ASCII hợp lệ?" `khong co gi dau ban oi` → 6/6 = 1.00. `hello how are you` → 1/4 | FST/perfect-hash, `[[FILL: KB]]` | P1 |
| Function-word dict, weight cao | `khong, duoc, nhung, cua, minh, la, va, co, nay, roi, the, voi, cho, tu, ve, den, khi, neu, ma, thi` | `[[FILL]]` | P1 |
| Cụm ký tự đặc thù VI | Initial `ng nh ch th tr ph kh gi qu`; final `ng nh ch c t p m n`; nucleus `uye uyen oai uoi ieu`. Trigram `ngh` gần như unique trong các ngôn ngữ Latin | — | P1, P13 |
| Teencode normalization | `k/ko/hok`→không, `dc/đc`→được, `j`→gì, `vs`→với, `ny`→này, `bn`→bạn, `mk/mik`→mình, `cx`→cũng, `ntn`→như thế nào, `nhma`→nhưng mà, `z/dz`→vậy | `[[FILL]]` | P4 |
| Telex/VNI residue detector | `oo aa ee dd`, `w` làm vowel modifier, hậu tố `s f r x j` trên âm tiết, `a1 o7` | — | P9 |
| Profile `vi_ascii` trong n-gram | Lấy corpus VI → **strip dấu** → n-gram. Cạnh tranh trực tiếp với EN/ID/MS | `[[FILL]]` | P1, P13 |

**Hai cạm bẫy bắt buộc xử lý:**

- ⚠️ **Trùng từ tiếng Anh.** `no, me, can, may, do, to, so, con, ban, hang, la, cam, tin, sang` đều là âm tiết VI hợp lệ **và** từ EN. → **Không bao giờ quyết định từ một token.** Phải dùng *ratio trên toàn message* + bigram evidence (`khong co`, `cua minh`, `duoc khong`, `co gi`).
- ⚠️ **P6 — pinyin/romaji collision.** `ni`, `hao`, `ma`, `lan` đều là âm tiết VI hợp lệ. `ni hao` sẽ ra ratio 1.00 → false positive VI. **Cần guard riêng:** `[[FILL: thiết kế guard — gợi ý: bảng pinyin syllable + romaji syllable, nếu token khớp CẢ HAI thì hạ weight; thêm bigram VI thực tế làm tiebreak; đo trên bucket adversarial §7.1]]`

**Con số cần chốt:** `[[FILL: số âm tiết VI ASCII-folded — SINH bằng script từ bảng âm vị (phụ âm đầu × nguyên âm × phụ âm cuối, lọc theo quy tắc kết hợp), đừng lấy số từ blog. Ghi lệnh sinh vào §6.4]]`

### 11.4. Giải P2 (Mixed) — Viterbi smoothing

> 📝 Kỹ thuật quyết định accuracy trên mixed. Chỉ ~150 dòng Rust.

**Nhận xét nền:** code-switching có tính **bursty** — ngôn ngữ đi theo cụm, không xen kẽ từng từ. Per-token labeling thuần cho nhãn nhiễu; smooth bằng **linear-chain HMM + Viterbi** biến nhãn nhiễu thành span sạch.

| Thành phần | Chi tiết |
|---|---|
| States | `[[FILL: vd. {vi, en, other} — K=3]]` |
| Emission | log-prob từ V1 (n-gram) + V3 (lexicon: syllable FST, EN dict, loanword list) + V2 (OS, nếu có) |
| Transition | self-transition cao `[[FILL: ~0.95]]`, switch thấp `[[FILL: ~0.05]]`. Hand-set trước; learn từ corpus mixed nếu có đủ label |
| Complexity | O(N·K²), N = số token, K = 2..4 → không đáng kể |

**Loanword allowlist — chỗ tune theo domain, và là cách giải P5:**

`meeting, deadline, ok, check, file, login, book, cancel, confirm, order, ship, sale, event, team, group, call, video, comment, share, tag` `[[FILL: mở rộng từ corpus thật của bạn]]`

Các token này nhận **emission trung tính** (không vote cho EN) → `mai mình meeting với client nhé` ra `primary: vi, is_mixed: true` với span EN, **không phải** `en`.

**Aggregation policy:**
- `primary` = span dài nhất theo **số token có nghĩa** (không phải theo ký tự — CJK sẽ lệch)
- `is_mixed = true` khi có ≥2 span vượt ngưỡng độ dài tối thiểu `[[FILL]]` → một từ vay lẻ không bật cờ mixed

### 11.5. Tích hợp OS voter (V2) — ba luật giữ determinism

> 📝 Ba luật này là thứ làm cho "dùng OS native" trở nên an toàn. Bỏ bất kỳ luật nào là mất P7.

**Luật 1 — Gate sau rule layer.** OS voter **bị skip hoàn toàn** khi:
- L2 kết luận VI-không-dấu với syllable ratio ≥ `[[FILL: 0.8?]]`
- L1 resolve xong bằng script (Hangul / Thai / kana / Cyrillic / …)
- Run ngắn hơn `[[FILL: N]]` token (OS detector không đáng tin ở đó)

→ OS chỉ chạy trên đúng subset nó giỏi: **Latin/Han well-formed, nhiều token** — và đó cũng chính là subset mà macOS/ELS/Chrome đồng thuận với nhau. Luật này vừa cứu determinism vừa cứu performance (fast path, §7.5).

**Luật 2 — Cap trọng số.** OS voter không bao giờ được một mình override rule layer. Nó phá thế cân bằng, nó không quyết định.

| Voter | Weight | Lý do |
|---|---|---|
| V3 rule layer (VI) | `[[FILL]]` | Deterministic, domain-specific, độ tin cao nhất trên P1/P4/P9 |
| V1 own n-gram | `[[FILL]]` | Deterministic, cross-platform |
| V2 macOS `NLLanguageRecognizer` | `[[FILL]]` | Có xác suất thật |
| V2 Windows ELS | `[[FILL: < macOS]]` | **Chỉ có rank, không có confidence** → pseudo-score `decay^rank`, độ tin thấp hơn |
| V2 Chrome | `[[FILL]]` | Async refinement, không block |

**Luật 3 — Stamp `engine_id`.** Mọi kết quả mang `{core_version, model_hash, os_engine, os_version}`. Nhãn nào đã cache/index đều trace được provenance → khi OS update làm kết quả đổi, invalidate **có chọn lọc** thay vì phát hiện drift âm thầm 6 tháng sau.

**Dùng OS API ở mức span, không phải document:** L1 segment trước → gọi OS detector **trên từng Latin run riêng** (nếu run đủ dài) → kết quả thành emission cho L5. Tức là bạn biến API document-level thành span classifier bằng cách tự cung cấp segmentation. Đổi lại: nhiều FFI call/message → **bắt buộc batch + cache**.

### 11.6. Performance design

| Vấn đề | Xử lý |
|---|---|
| `NLLanguageRecognizer` alloc mỗi call | **Reuse 1 instance**, `reset()` giữa các lần |
| ELS `MappingGetServices` đắt | **Cache `MAPPING_SERVICE_INFO`** cho cả process lifetime |
| ELS `MappingFreeResults` bắt buộc | **RAII guard Rust**, `Drop` gọi free. Không làm là leak |
| Thread safety | 1 instance/thread, hoặc serialize qua 1 worker thread |
| Không block main thread (NFR2) | OS voter chạy trong napi `AsyncTask` / tokio threadpool, bounded queue |
| Latency p50 | ★ **Fast path**: L1+L2 resolve confident → **không chạm OS API**. Với traffic VI+CJK chiếm đa số, p50 giữ ở tốc độ pure-Rust |
| Lặp lại | **LRU cache**, key = hash của text đã normalize. Size `[[FILL]]` |
| Core (không OS) | Nhanh cỡ chục µs trên input 512B → **chạy inline main thread**; chỉ batch lớn mới đẩy worker (`WORKER_ROUTER.LANG_DETECT`) |
| Truncate | Cắt input `[[FILL: 512?]]` byte — detection không cần đọc hết message |

### 11.7. Fallback chain

| Điều kiện | Hành vi |
|---|---|
| macOS < 10.14 / class không tồn tại | core-only |
| `elscore.dll` load fail / service không enumerate được | core-only |
| Web: `LanguageDetector.availability()` ≠ available | core-only |
| OS call throw / vượt timeout `[[FILL: ms]]` | core-only + log QoS |
| wasm không khả dụng (`typeof WebAssembly === 'undefined'`) | **chỉ L0+L1+L2 ở JS**, abstain cho Latin ambiguity — degrade, không throw |

### 11.8. Layout code

```
nativelibs/zlangdetect/
  crates/
    core/            # L0-L3, L5, L6 + V1 n-gram. Platform-agnostic, không biết OS là gì.
      src/script.rs        # L1 — unicode script runs
      src/normalize.rs     # L0 — NFC, teencode, telex, collapse repeat
      src/vi_syllable.rs   # L2 — FST âm tiết VI (ascii-folded + có dấu)
      src/lexicon.rs       # L2/V3 — function words, EN dict, loanword allowlist
      src/ngram.rs         # V1 — char n-gram scorer
      src/viterbi.rs       # L5 — HMM smoothing
      src/aggregate.rs     # L6 — spans → Detection
    model/           # build.rs sinh bảng compact từ corpus → include_bytes!
    os-detect/       # V2 — OS là PLUGIN, mock được
      src/lib.rs           # trait OsDetector {
                           #   fn detect(&self, text: &str,
                           #             allowlist: &[Lang],
                           #             hints: &[(Lang, f32)]) -> Vec<(Lang, f32)>;
                           # }
      src/macos.rs         # #[cfg(target_os="macos")]   objc2 + NaturalLanguage (hoặc ObjC shim)
      src/windows.rs       # #[cfg(target_os="windows")] windows crate, Win32::Globalization
      src/noop.rs          # linux + fallback
    napi/            # desktop  → core + os-detect
    wasm/            # WEB      → core only (Chrome API cắm ở tầng JS)
    cli/             # benchmark harness §6.4
  TECH_SPEC.md
  README.md
```

**Vì sao `trait OsDetector`:** fusion layer identical mọi platform; OS mock được trong test; CLI đo được `core-only` vs `core+macOS` vs `core+ELS` trên **cùng một corpus** — chính là con số justify cả tier OS.

### 11.9. Tích hợp vào `zalo-pc-app`

Theo đúng pattern đã có (§2.2), **không phát minh pattern mới**:

| Việc | Làm theo |
|---|---|
| Factory chọn tier | Mirror `ResizerFactory` (`resizer.factory.ts:29-40`): `__PLATFORM__ !== 'WEB'` → napi addon; `'WEB'` → wasm. Cùng interface `IDetector`, caller không branch |
| Load wasm | `import wasmUrl from './wasm/xxx_bg.wasm'` + `global.d.ts` decl. **`--target bundler`, KHÔNG patch glue JS** (D1) |
| Worker (chỉ cho batch) | Thêm `WORKER_ROUTER.LANG_DETECT`, reuse `PoolWorker` + `WorkerHelper.postMessageAsync`. **Không tạo worker riêng** (D2) |
| Resilience | Mirror `callWasmSafe()` + `fibonacciRetry` + `PromiseWait` |
| Feature flag | Remote config, mirror `AppConfig.e2ee.enable_wasm` (OR4) |
| QoS | Mirror `SIMDBoostrap` (QoS 97135/97136). Metric cần: OS-tier availability, abstain rate, latency p95, fast-path ratio |
| Model | **Bundle, không fetch remote** (OR1, bài học D5) |
| Cải thiện so với hiện tại | `compileStreaming` + cache `WebAssembly.Module` vào IndexedDB (D4). ⚠️ structured-clone Module chạy trên Chromium/Firefox, **Safari không** → cần fallback |

---

## 12. Kế hoạch triển khai

> 📝 Mỗi phase có **exit criteria đo được**. Phase không có exit criteria thì không biết khi nào xong.
> Thứ tự này cố ý: **core trước, OS sau** — vì core là floor bắt buộc, và bạn cần baseline để đo delta của OS tier.

### Phase 0 — Corpus & harness

| | |
|---|---|
| Mục tiêu | Có golden corpus + CLI benchmark chạy được trên các lib có sẵn |
| Deliverable | `corpus/golden.jsonl`, `crates/cli`, `results/*.json` cho S0-S6 |
| Exit criteria | κ ≥ 0.8 (§6.6); hold-out tách xong; §7.1/§7.2 fill được cho S0-S6; §10 đã ký |
| Effort | `[[FILL]]` |
| Owner | `[[FILL]]` |
| Rủi ro | Corpus approval chậm → dùng phương án synthetic + public dataset (§6.1) |

### Phase 1 — Core engine (L0-L3, L5, L6 + V1)

| | |
|---|---|
| Mục tiêu | Core Rust chạy được, build ra **cả** wasm và napi |
| Deliverable | `crates/core`, `crates/model`, `crates/wasm`, `crates/napi`; script sinh FST âm tiết VI |
| Exit criteria | P1, P4, P9, P10, P11 PASS ngưỡng §10 · NFR7 determinism = 100% · NFR3 size trong budget |
| Effort | `[[FILL]]` |
| Owner | `[[FILL]]` |
| Rủi ro | Size vượt budget → cắt tập ngôn ngữ T3, quantize n-gram table |

### Phase 2 — Mixed language (L5 Viterbi + loanword)

| | |
|---|---|
| Mục tiêu | Span output đúng, `is_mixed` đáng tin |
| Deliverable | `viterbi.rs`, loanword allowlist, `aggregate.rs` |
| Exit criteria | P2, P5, P15 PASS §10 |
| Effort | `[[FILL]]` |
| Owner | `[[FILL]]` |
| Rủi ro | Thiếu corpus mixed có label span → label thêm; hoặc hand-set transition thay vì learn |

### Phase 3 — Tích hợp app, core-only, ship sau flag

| | |
|---|---|
| Mục tiêu | Feature chạy trên field ở tier core-only, thu QoS thật |
| Deliverable | `IDetector` + factory, `WORKER_ROUTER.LANG_DETECT`, QoS metric, remote flag |
| Exit criteria | NFR1/2/5/6 PASS trên máy cấu hình thấp nhất (K5/K6) · QoS lên dashboard · rollout `[[FILL: %]]` không tăng crash/ANR |
| Effort | `[[FILL]]` |
| Owner | `[[FILL]]` |

> 📝 **Ship Phase 3 trước khi làm Phase 4.** Bạn sẽ có (a) baseline field thật, (b) số availability
> để biết OS tier có đáng đầu tư không. Rất có thể Phase 4 hoá ra không cần.

### Phase 4 — OS voter (V2)

| | |
|---|---|
| Mục tiêu | Cắm OS detector làm voter, **đo delta** |
| Deliverable | `crates/os-detect` + `trait OsDetector` + macos.rs, windows.rs, noop.rs; JS refinement cho Chrome |
| Exit criteria | ★ **Delta accuracy ≥ `[[FILL]]`** so với core-only, per-bucket · P7 divergence PASS §10 · không regression NFR1 p50 (fast path) · 0 leak (ELS RAII) |
| Effort | `[[FILL]]` |
| Owner | `[[FILL]]` |
| Rủi ro | **Delta quá nhỏ → NGƯNG tier này.** Đây là kết quả hợp lệ, không phải thất bại — xem §14 |

### Phase 5 — Calibration & tuning

| | |
|---|---|
| Mục tiêu | `confidence` có nghĩa; τ chọn đúng cho từng consumer |
| Deliverable | Calibration (§6.5), τ per-consumer (§7.4), tuning weight voter |
| Exit criteria | ECE ≤ `[[FILL]]` · P3, P8 PASS §10 · toàn bộ §10 PASS trên **hold-out** |
| Effort | `[[FILL]]` |
| Owner | `[[FILL]]` |

### Phase 6 — Hardening & CI gate

| | |
|---|---|
| Mục tiêu | Không mục dần theo thời gian |
| Deliverable | Unit test P10-P16; CI accuracy gate per-platform; **divergence test** cross-platform |
| Exit criteria | CI fail được khi macro-F1 tụt > `[[FILL]]` điểm · divergence test chạy trên cả 3 runner |
| Effort | `[[FILL]]` |
| Owner | `[[FILL]]` |

**Tổng effort:** `[[FILL]]` · **Timeline:** `[[FILL]]`

### 12.7. Hai CI gate (không phải một)

> 📝 Đây là thứ giữ thiết kế an toàn về dài hạn. Gate 2 đặc biệt quan trọng khi có OS tier:
> nó biến "OS voter có weight bị cap" từ **ý định** thành **bảo đảm được kiểm chứng**.

1. **Accuracy gate per platform** — macOS runner + Windows runner + wasm(node/browser). Report **per-bucket**, fail khi macro-F1 tụt quá ngưỡng.
2. **Divergence test** ★ — chạy golden corpus qua cả 3 platform, assert:
   - disagreement rate ≤ `[[FILL: 2%?]]`
   - **0 disagreement flip `primary` trên bucket VI và CJK**

---

## 13. Trade-off đã chấp nhận

> 📝 Ghi thẳng thắn. Trade-off không ghi ra sẽ bị hiểu là bạn không nghĩ tới. Mỗi dòng: chọn gì,
> mất gì, tại sao chấp nhận được, khi nào cần xem lại.

| # | Trade-off | Được | Mất | Vì sao chấp nhận | Khi nào xem lại |
|---|---|---|---|---|---|
| T1 | Tự build core thay vì dùng lib có sẵn | Giải được P1, P2 — không lib nào giải được | Effort + maintenance dài hạn | §7 cho thấy `[[FILL]]` | Nếu xuất hiện lib giải được P1+P2 |
| T2 | Rule-based cho VI thay vì train model | Chính xác cao trên P1/P4/P9, deterministic, giải thích được | Phải maintain lexicon; teencode tiến hoá theo thời gian | Chính tả VI là hệ hữu hạn đóng → rule là công cụ đúng | Khi teencode drift → cần review lexicon `[[FILL: chu kỳ?]]` |
| T3 | OS libs làm voter, không làm source of truth | Giữ chất lượng model OS + `languageHints`; không mất determinism | Không tận dụng tối đa OS API; thêm code phức tạp cho gating | P7 severity High; divergence là bug không reproduce được | Nếu delta Phase 4 rất lớn → cân nhắc nới weight |
| T4 | ELS weight < macOS weight | Bounded divergence | Windows accuracy thấp hơn macOS ở tier OS | ELS **không có confidence score**, chỉ có rank | Nếu MS bổ sung confidence API |
| T5 | Truncate input `[[FILL]]` byte | Latency ổn định, O(1) theo độ dài message | Mất tín hiệu ở message dài | Detection không cần đọc hết; message dài đã dễ | Nếu M1 trên len_bucket >30 dưới ngưỡng |
| T6 | Abstain thay vì đoán | Precision cao, không false positive tốn kém | Coverage thấp hơn | Chi phí sai của C1/C3 (§1.3) | Per-consumer τ (§7.4) |
| T7 | Model bundle, không fetch remote | Không gãy khi mạng yếu (D5) | Bundle size tăng; update model cần release | D5 cho thấy remote đã gãy thật trên field | Nếu size vượt K3 |
| T8 | `spans` dùng byte offset UTF-8 | Nhất quán Rust↔wasm | JS phải convert khi cần char index | UTF-16 index sẽ lệch với emoji/CJK | — |
| T9 | `[[FILL]]` | | | | |

---

## 14. Chưa làm / cần review thêm

> 📝 Mục này làm spec **đáng tin hơn**, không kém tin hơn. Reviewer sợ nhất là spec giả vờ đã
> nghĩ hết mọi thứ. Mỗi dòng: câu hỏi mở, ai trả lời, cần trước phase nào.

### 14.1. Cần verify trước khi code

| # | Việc | Vì sao | Ai | Cần trước |
|---|---|---|---|---|
| V1 | Verify GUID / tên service / signature ELS với MSDN hiện tại | Đừng hardcode GUID lấy từ blog cũ. Enumerate qua `MappingGetServices` nếu được | `[[FILL]]` | Phase 4 |
| V2 | Verify shape API Chrome `LanguageDetector` | API còn đang chuẩn hoá; tên trước đây là `ai.languageDetector` | `[[FILL]]` | Phase 4 |
| V3 | Verify `objc2` framework crate có đủ API NaturalLanguage cần (`languageHints`, `languageConstraints`) | Nếu thiếu → viết ObjC shim | `[[FILL]]` | Phase 4 |
| V4 | Confirm K2 — Zalo Web thật sự không có COOP/COEP header | Quyết định có loại được `wasm-bindgen-rayon` hay không | team infra web | Phase 1 |
| V5 | Confirm K3 — bundle size budget cụ thể (KB) | Quyết định S4 vs S3 vs tự viết n-gram | team web | Phase 0 |
| V6 | Confirm K5/K6 — OS/browser matrix từ analytics thật | Đừng đoán. Quyết định fallback chain (§11.7) | team release | Phase 0 |
| V7 | Sinh và chốt số âm tiết VI ASCII-folded bằng script | Không lấy số từ blog. Ghi lệnh vào §6.4 | `[[FILL]]` | Phase 1 |
| V8 | Corpus privacy/legal approval | Chặn Phase 0 | `[[FILL]]` | Phase 0 |
| V9 | `[[FILL]]` | | | |

### 14.2. Câu hỏi mở về thiết kế

| # | Câu hỏi | Trạng thái |
|---|---|---|
| Q1 | Guard cho P6 (pinyin/romaji collision) thiết kế thế nào? Bảng pinyin+romaji syllable + hạ weight khi khớp cả hai? | `[[FILL: chưa chốt — cần thử nghiệm trên bucket adversarial]]` |
| Q2 | Transition probability của HMM: hand-set hay learn? Nếu learn thì cần bao nhiêu sample mixed có label span? | `[[FILL]]` |
| Q3 | Loanword allowlist maintain thế nào về dài hạn? Có nên sinh tự động từ corpus (từ EN xuất hiện trong câu VI với tần suất cao)? | `[[FILL]]` |
| Q4 | Trộn `spans` từ nhiều run script khác nhau — merge policy khi 2 run liền nhau cùng lang? | `[[FILL]]` |
| Q5 | `primary` cho message 100% loanword (`ok deadline check`) nên là gì? `vi`? `en`? abstain? | `[[FILL: cần chốt với consumer §1.3]]` |
| Q6 | Có cần detect ngôn ngữ ở tầng conversation (aggregate nhiều message) làm prior cho message đơn lẻ? Đây có thể là đòn mạnh cho P3 | `[[FILL: ý tưởng chưa đánh giá]]` |
| Q7 | `[[FILL]]` | |

### 14.3. Cố ý để lại sau v1

| # | Việc | Vì sao hoãn | Điều kiện làm |
|---|---|---|---|
| L1 | `[[FILL: vd. ngôn ngữ T3]]` | `[[FILL]]` | `[[FILL]]` |
| L2 | `[[FILL: vd. per-character labeling]]` | `[[FILL]]` | `[[FILL]]` |
| L3 | `[[FILL: vd. conversation-level prior (Q6)]]` | `[[FILL]]` | `[[FILL]]` |

### 14.4. Rủi ro & mitigation

| # | Rủi ro | Xác suất | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Size vượt budget K3 | `[[FILL]]` | `[[FILL]]` | Cắt T3, quantize n-gram, `low_accuracy_mode` |
| R2 | Delta OS tier (Phase 4) quá nhỏ → công bỏ ra không đáng | `[[FILL]]` | Trung bình | **Kết quả hợp lệ.** Ship core-only, ghi lại số liệu, đóng tier. Chính vì vậy Phase 3 ship trước Phase 4 |
| R3 | Teencode drift theo thời gian | Cao | Trung bình | CI gate + review lexicon theo chu kỳ `[[FILL]]`; QoS abstain rate làm early warning |
| R4 | Corpus không đủ sample mixed có label span | `[[FILL]]` | Cao (chặn P2) | Bắt đầu label sớm ở Phase 0; hand-set transition thay vì learn |
| R5 | OS update đổi kết quả → nhiễm bẩn dữ liệu đã index | Trung bình | Cao | `engine_id` (§11.5 Luật 3) → invalidate chọn lọc |
| R6 | Consumer set τ sai → false positive tràn lan | `[[FILL]]` | `[[FILL]]` | Calibration §6.5 + τ đề xuất per-consumer §7.4 + QoS |
| R7 | `[[FILL]]` | | | |

---

## 15. Phụ lục

### 15.1. Thuật ngữ

| Thuật ngữ | Nghĩa |
|---|---|
| **Bucket** | Nhóm sample trong corpus theo đặc tính (vi_ascii, mixed, …) |
| **len_bucket** | Nhóm theo độ dài (1–3, 4–10, 11–30, >30 token) |
| **Abstain** | Trả `primary: None` khi không đủ tín hiệu — khác với "đoán sai" |
| **Voter** | Một nguồn evidence trong L4, emit `(lang, score)` |
| **Fast path** | Đường xử lý khi L1+L2 resolve xong, không gọi OS API |
| **Divergence** | Cùng input, khác output giữa các platform |
| **ELS** | Extended Linguistic Services — API ngôn ngữ của Windows (`elscore.dll`) |
| **FST** | Finite State Transducer — cấu trúc lưu tập chuỗi nén, lookup O(len) |
| **Loanword** | Từ vay đã nhập tịch (`meeting`, `ok`) — không tính là code-switch |
| **Romanized** | VI viết không dấu / còn residue telex-VNI |
| **κ (Cohen's kappa)** | Độ đồng thuận giữa người label, hiệu chỉnh theo may mắn |
| **ECE** | Expected Calibration Error — lệch giữa confidence và accuracy thật |
| **Pre-registration** | Chốt ngưỡng PASS trước khi đo (§10) |

### 15.2. Tham chiếu

| | |
|---|---|
| Repo hạ tầng | `nativelibs` — `[[FILL: url]]` · `zalo-pc-app` — `[[FILL: url]]` |
| Lib khảo sát | `lingua-rs`, `whatlang-rs`, `franc`, `tinyld`, `fastText lid.176`, `CLD3` |
| API OS | Apple `NLLanguageRecognizer` · Windows ELS `Microsoft.Language.Detection` · Chrome `LanguageDetector` |
| Dataset VI công khai | `[[FILL: VLSP, UD Vietnamese, OSCAR-vi, …]]` |
| Ticket / design doc liên quan | `[[FILL]]` |

### 15.3. Changelog

| Ngày | Người | Thay đổi |
|---|---|---|
| `[[FILL]]` | `[[FILL]]` | Draft đầu |

---

## ✅ Checklist trước khi gửi review

> 📝 Chạy hết checklist này. Reviewer sẽ hỏi đúng những câu dưới đây.

- [ ] `rg -c '\[\[FILL' TECH_SPEC.md` = 0 (trừ mục `OPTIONAL`)
- [ ] Đã xoá hết block `> 📝` hướng dẫn
- [ ] §3.2 phân bố dữ liệu lấy từ **sample thật**, không đoán
- [ ] §10 Proof Obligations được chốt **trước khi** đo S11, có ngày + người duyệt
- [ ] Mọi số ở §7 trace được về một lệnh ở §6.4
- [ ] §7 report **per-bucket**, không chỉ aggregate
- [ ] Hold-out set chưa từng dùng để tune (§6.6)
- [ ] κ ≥ 0.8 (§6.6)
- [ ] Latency đo **sau warm-up**, có p99, đo trên máy cấu hình thấp nhất
- [ ] S0 baseline đã đo (không có baseline = không biết lib có cộng thêm gì)
- [ ] S7 và S8 đo **riêng** (delta chứng minh giá trị của `languageHints`)
- [ ] §7.5 tách fast path / slow path cho S11, kèm % traffic fast path
- [ ] Mỗi problem §5 có đúng một dòng ở §10
- [ ] Mỗi trade-off §13 có "khi nào xem lại"
- [ ] §14 không rỗng — spec không có open question là spec chưa được nghĩ kỹ
- [ ] Có reviewer từ **cả** team Web và team Desktop
- [ ] Có reviewer từ team consumer (§1.3 primary consumer)
