# zdetect

Nhận diện ngôn ngữ **thuần JavaScript**, chạy được trong trình duyệt. Đây là bộ
detector mà **bản web của app dùng** — không phải Web API `LanguageDetector` của
trình duyệt.

Không tải model, không cần mạng, không phụ thuộc thư viện ngoài: mô hình n-gram
được inline thẳng vào bundle (~226KB, ~73KB sau gzip).

Thuật toán thống kê **port từ [lingua-rs](https://github.com/pemistahl/lingua-rs)**
(Apache-2.0) — Naive Bayes trên xác suất có điều kiện + backoff, thay cho
Cavnar–Trenkle rank-distance của bản đầu. Xem
[`.claude/skills/lingua-architecture.md`](.claude/skills/lingua-architecture.md)
để biết mượn gì, vì sao, và **hai chỗ buộc phải làm khác lingua**.

Đối trọng với [`nativelibs/zlang`](../../nativelibs/zlang/README.md): zlang mượn
model có sẵn của hệ điều hành (bản desktop), zdetect tự tính (bản web).

---

## Ngôn ngữ hỗ trợ

`ko` · `zh` · `vi` · `en` — kể cả **teencode tiếng Việt** (bỏ dấu + viết tắt).

Thêm ngôn ngữ chỉ cần sửa `src/config.ts`; engine ở `src/core-detector.ts` hoàn
toàn generic, không biết ngôn ngữ nào cả.

---

## Kiến trúc

```
Raw text
   │
   ▼
L0  normalize.ts      NFC + bỏ URL/email/số
   │
   ▼
L1  script-utils.ts   tách run theo Unicode script (generic)
   │
   ▼
L2  core-detector.ts  ROUTING, theo thứ tự ưu tiên:
   │                    1) customClassifiers[category]  hook can thiệp sâu
   │                    2) scriptDirectMap[category]    map thẳng (ko, zh)
   │                    3) scriptGroups[category]       cần phân loại (vi, en)
   ▼
L3  classifier.ts     1) KÝ TỰ RIÊNG   — ă â đ ê ô ơ ư + dấu thanh -> chốt vi
   │                  2) LEXICON       — bắt teencode khi đã mất dấu
   │                  3) N-GRAM BAYES  — xác suất có điều kiện + backoff
   ▼
L4  core-detector.ts  tổng hợp theo trọng số ký tự
```

Ba tầng ở L3 xếp theo **độ chắc chắn giảm dần, chi phí tăng dần**. Tầng nào chốt
được thì dừng luôn; `details[].decisionSource` cho biết tầng nào đã quyết định.

**Vì sao lexicon nằm giữa.** Ký tự riêng là tín hiệu chắc nhất nhưng teencode bỏ
hết dấu nên tầng đó mù. Lúc ấy thống kê ký tự cũng dễ sai (mất dấu làm tiếng Việt
trông giống tiếng Anh), nhưng việc từng từ trùng danh sách đã biết vẫn chính xác.
Lexicon sinh **tự động** bằng cách bỏ dấu corpus tiếng Việt — teencode phần lớn
không phải từ vựng khác, mà là cách gõ thiếu dấu của chính từ bình thường.

**Lexicon loại từ trùng ngôn ngữ khác.** `can con the ban do la no` (bỏ dấu của
"cần còn thế bạn đó lá nó") đều là từ tiếng Anh thật. Thiếu bộ lọc này, độ chính
xác tiếng Anh tụt còn 45.5%.

---

## API

```js
import { detect, detectTop, info } from 'zdetect';

info();
// { backend: 'zdetect-js', scoreKind: 'proportion', version: '1.0.0',
//   languages: ['ko', 'zh', 'vi', 'en'] }

detect({ text: 'Hello 안녕하세요 xin chào' });
// {
//   ranked: [ { lang: 'ko', proportion: 0.5, confidence: 1 }, … ],
//   details: [ { text, category, lang, confidence, decisionSource }, … ]
// }

detectTop({ text: 'Xin chào các bạn' });
// { lang: 'vi', proportion: 1, confidence: 1 }

confidenceValues({ text: 'Hello everyone how are you today' });
// [ { detectedLanguage: 'en', confidence: 0.871 },
//   { detectedLanguage: 'vi', confidence: 0.129 },
//   { detectedLanguage: 'ko', confidence: 0 },
//   { detectedLanguage: 'zh', confidence: 0 } ]
```

### `confidenceValues()` — điểm gốc cho mọi ngôn ngữ

Tương ứng [`compute_language_confidence_values()`](https://github.com/pemistahl/lingua-rs#103-confidence-values)
của lingua, và trả về **cùng hình dạng với `zlang.detect()`** của bản desktop —
nhờ vậy UI dùng chung một component cho cả hai nền tảng.

| | `detect().ranked` | `confidenceValues()` |
|---|---|---|
| Liệt kê | chỉ ngôn ngữ **thực sự xuất hiện** | **mọi** ngôn ngữ engine biết |
| Con số | `proportion` (tỉ lệ ký tự) + `confidence` riêng | một `confidence` duy nhất |
| Tổng | `proportion` cộng bằng 1 | `confidence` cộng bằng 1 |

Ngôn ngữ bị loại vẫn có mặt với `confidence: 0` — thấy được cả những ứng viên
engine đã cân nhắc rồi bỏ, thay vì chỉ biết ai thắng.

Giống lingua: tầng luật chốt (script / ký tự riêng / lexicon) thì gán **1.0** cho
ngôn ngữ đó và 0 cho phần còn lại; chỉ tầng thống kê mới cho phân phối mềm.

### Hai con số, đừng nhầm

| | Nghĩa |
|---|---|
| `proportion` | **Bao nhiêu phần văn bản** thuộc ngôn ngữ đó. Cộng lại bằng 1. |
| `confidence` | **Chắc chắn đến đâu** về phán đoán đó. Độc lập với `proportion`. |

Văn bản ngắn có thể `proportion: 1` mà `confidence: 0.44` — chiếm trọn văn bản
nhưng không đủ dữ liệu để chắc. Muốn gộp thành một con số thì tự nhân, và đó là
quyết định của bên gọi chứ không phải của engine — xem
`src/renderer/services/detection/providers/ZDetectProvider.ts`.

`details[].decisionSource` cho biết kết luận đến từ đâu: `unique-chars` ·
`lexicon` · `ngram` · `script-map` · `custom`.

`ranked` **rỗng** khi không kết luận được (văn bản rỗng, hoặc toàn ký tự thuộc
script chưa config) — đó là kết quả hợp lệ, không phải lỗi.

---

## Build

```bash
cd weblibs/zdetect
npm run build     # -> dist/index.js + dist/types/
npm test          # smoke test, có assert, fail thì exit != 0
```

**App dùng `dist/`, không dùng source.** Alias `@zdetect` trong `tsconfig.json` và
`scripts/build.js` ở repo root trỏ thẳng vào `dist/index.js` — sửa `src/` mà quên
build lại thì app vẫn chạy bản cũ.

`dist/` **được commit**, giống `nativelibs/zlang`: bên tiêu thụ dùng luôn artifact.
Bundle cố tình **không minify** — nó nằm trong git, diff đọc được đáng giá hơn vài KB.

Chạy bằng **Node 14** như phần còn lại của repo (`nvm use`).

---

## Độ chính xác

Đo trên `corpus/eval/` — 20% held-out, không câu nào dùng lúc train.

```bash
npm run eval     # pipeline đầy đủ, 4 ngôn ngữ
npm run bench    # chỉ tầng thống kê, cũ vs mới — dùng khi đổi thuật toán
```

| Lát cắt | vi | en | ko | zh | tổng |
|---|---|---|---|---|---|
| Câu đầy đủ | 100.0 | 100.0 | 100.0 | 100.0 | **100.0%** |
| 4 từ đầu | 100.0 | 99.5 | 100.0 | 100.0 | **99.9%** |
| 2 từ đầu | 99.0 | 98.0 | 99.0 | 100.0 | **98.9%** |
| 4 từ đầu, vi bỏ dấu | 100.0 | 99.5 | 100.0 | 100.0 | **99.9%** |

`npm run bench` cô lập riêng tầng n-gram (tắt luật ký tự + lexicon) để so mô hình
mới với Cavnar–Trenkle cũ trên cùng dữ liệu. Bản mới thắng rõ nhất ở văn bản rất
ngắn — đúng chỗ lingua tuyên bố:

| | cũ | mới |
|---|---|---|
| 4 từ đầu | 98.8% | **99.3%** |
| 2 từ đầu | 96.8% | **97.0%** |

---

## Train lại mô hình

```bash
npm run train -- vi --min-count=2   # -> profiles/vi.model.json + vi.lexicon.json
npm run train -- en --min-count=2
npm run train -- fr                 # thêm ngôn ngữ: tạo corpus/fr.txt rồi chạy
```

Train xong phải `npm run build` lại, vì mô hình được inline vào bundle.

`--min-count=N` cắt n-gram xuất hiện dưới N lần ở bậc >= 3. Đây là núm đánh đổi
kích thước/độ chính xác:

| min-count | n-gram | bundle | 2 từ đầu |
|---|---|---|---|
| 1 | 25 171 | ~480KB | 98.5% |
| **2** | **14 312** | **~226KB** | **97.3%** |
| 3 | 10 911 | ~170KB | 97.0% |
| 5 | 7 891 | ~130KB | 96.8% |

| Thư mục | Nội dung |
|---|---|
| `corpus/<lang>.txt` | Văn bản train (80%) |
| `corpus/eval/<lang>.txt` | Tập held-out (20%), chỉ dùng để đo |
| `corpus/<lang>-abbreviations.txt` | Viết tắt **thật** (không chỉ bỏ dấu) — sửa tay |
| `profiles/<lang>.model.json` | `ngram -> ln P` + `floor` |
| `profiles/<lang>.lexicon.json` | Từ không dấu sinh tự động + viết tắt |

### Nguồn corpus

`corpus/*.txt` lấy từ `language-models/<lang>/testdata/sentences.txt` của
[lingua-rs](https://github.com/pemistahl/lingua-rs) (Apache-2.0), vốn bắt nguồn
từ [Wortschatz corpora](https://wortschatz.uni-leipzig.de) của Đại học Leipzig
(CC BY-NC 4.0). Chia 80/20 bằng `head`/`tail`.

**Đây là dữ liệu TEST của lingua, không phải dữ liệu train của nó** — nên dùng
làm corpus train ở đây là hợp lệ, không rò rỉ từ mô hình gốc.

---

## Mở rộng: hook can thiệp sâu

Ngôn ngữ cần logic riêng mà n-gram + lexicon không đủ (tiếng Nhật trộn
Kanji/Hiragana/Katakana, tiếng Đức cần tách từ ghép, hay muốn gọi ra một model
ML) thì đăng ký `customClassifiers` cho script category đó — engine ưu tiên gọi
hàm của bạn, **không phải sửa `core-detector.ts`**.

```ts
new LanguageDetector({
  customClassifiers: {
    hiragana: (runText) => ({ lang: 'ja', confidence: 1, decisionSource: 'custom' }),
  },
});
```
