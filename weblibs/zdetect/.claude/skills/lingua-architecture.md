# Skill: Kiến trúc nhận diện ngôn ngữ của lingua-rs

Chắt lọc từ đọc mã nguồn `lingua-rs` (Apache-2.0, Peter M. Stahl) — `src/detector.rs`,
`src/model.rs`, `src/writer.rs`, `src/ngram.rs`, `src/alphabet.rs`, `src/constant.rs`.

Mục đích: ghi lại **những quyết định thuật toán đáng mượn**, kèm lý do, để port sang
bộ detector JS mà không phải đọc lại 13k dòng Rust.

---

## Vấn đề lingua giải, mà Cavnar–Trenkle không giải được

Cavnar–Trenkle 1994 (thứ hầu hết thư viện dùng, gồm cả bản zdetect đầu tiên) so
**thứ hạng** n-gram: dựng top-N n-gram của văn bản, so với top-N của từng ngôn ngữ,
cộng độ lệch hạng. Nó có hai điểm yếu chết người với văn bản ngắn:

1. **Văn bản ngắn không đủ n-gram để xếp hạng.** Một câu 3 từ sinh ra chừng 20
   n-gram; xếp hạng 20 thứ rồi so với bảng 300 thứ là so nhiễu với nhiễu.
2. **Chỉ dùng trigram.** Càng ngắn càng ít trigram. Hết tín hiệu.

lingua thay bằng **Naive Bayes trên xác suất có điều kiện**, cộng **n-gram bậc 1–5**,
cộng **rule engine chạy trước**. Đây là ba thứ đáng mượn.

---

## 1. Mô hình: xác suất có điều kiện, không phải thứ hạng

### Lúc train (`model.rs::compute_relative_frequencies`)

```
P(ngram) = count(ngram) / count(prefix dài n-1)      với n >= 2
P(unigram) = count(unigram) / tổng số unigram        với n = 1
```

Lưu **`ln()` của giá trị đó**, không lưu xác suất trần.

Đây là chuỗi Markov: `P("abc")` không phải tần suất của "abc" trong corpus, mà là
**xác suất thấy "c" khi đã có "ab"**. Nhờ vậy mô hình bắt được cấu trúc chính tả
chứ không chỉ tần suất thô.

### Lúc chạy (`detector.rs::compute_sum_of_ngram_probabilities`)

```
sum = Σ  log P(ngram)        cộng log = nhân xác suất, tránh underflow
```

---

## 2. Backoff — mẹo quan trọng nhất

`ngram.rs::range_of_lower_order_ngrams` sinh dãy **cắt dần từ phải**:

```
"äbcde" -> "äbcd" -> "äbc" -> "äb" -> "ä"
```

`compute_sum_of_ngram_probabilities` duyệt dãy đó và **dừng ở cái ĐẦU TIÊN tìm
thấy trong mô hình** (`break`).

```rust
for ngrams in ngram_model {           // mỗi phần tử là một dãy backoff
    for ngram in ngrams {
        if let Some(p) = look_up(language, ngram) {
            sum += p;
            break;                    // <- dừng ngay, không cộng tiếp bậc thấp
        }
    }
}
```

**Vì sao quan trọng:** corpus nhỏ thì 5-gram gần như luôn vắng mặt. Không có backoff
thì hoặc phải gán một hằng phạt (bịa), hoặc bỏ qua (mất tín hiệu). Backoff dùng
**bậc cao nhất còn quan sát được** — tự động thích nghi theo độ thưa của dữ liệu.
Đây là lý do lingua chạy tốt trên văn bản ngắn mà vẫn không cần smoothing phức tạp.

---

## 3. Bậc n-gram thay đổi theo độ dài văn bản

`detector.rs:665`

```rust
let ngram_length_range = if character_count >= 120 { 3..4 } else { 1..6 };
```

- **< 120 ký tự** → dùng n-gram bậc **1,2,3,4,5**. Ngắn thì cần mọi tín hiệu có được.
- **>= 120 ký tự** → **chỉ trigram**. Dài thì trigram đã đủ, bậc cao chỉ tốn thời gian.

Ngưỡng 120 là hằng số thực nghiệm của lingua, không phải lý thuyết.

---

## 4. Chuẩn hoá theo số unigram khớp

`detector.rs::sum_up_probabilities`

```rust
sum = Σ log P(ngram)   trên mọi bậc
if unigram_counter.contains(language) {
    sum /= unigram_counter[language]      // <- chia cho SỐ UNIGRAM KHỚP
}
probability = sum.exp()
```

`unigram_counter[language]` = số unigram của văn bản mà **ngôn ngữ đó có trong mô
hình**. Đây vừa là chuẩn hoá độ dài, vừa là phạt ngầm: ngôn ngữ nào phủ được ít ký
tự của văn bản thì mẫu số nhỏ, log-prob (âm) chia cho số nhỏ thành **âm hơn** →
xác suất thấp hơn.

---

## 5. Confidence = softmax, không phải margin

`detector.rs::compute_confidence_values`

```rust
denominator = Σ probabilities
confidence[lang] = probabilities[lang] / denominator
```

Tổng các confidence **bằng 1**. Ngôn ngữ do rule engine chốt thì gán thẳng 1.0,
phần còn lại 0.0.

Bẫy đã được xử lý: văn bản rất dài làm `sum.exp()` underflow về 0 hết, `denominator`
thành 0. Lúc đó lingua lấy ngôn ngữ có log-prob lớn nhất và gán 1.0 — chứ không
chia cho 0.

---

## 6. Rule engine chạy TRƯỚC mô hình thống kê

Hai tầng, cả hai ở `detector.rs`:

### 6a. `detect_language_with_rules` — chốt luôn nếu đủ chắc

Với mỗi **từ**, đếm ký tự thuộc:
- alphabet chỉ một ngôn ngữ dùng (Hangul → ko, Hiragana → ja…)
- `unique_characters` của từng ngôn ngữ (ký tự chỉ ngôn ngữ đó có)

Từ nào chốt được một ngôn ngữ → một phiếu. Cộng phiếu toàn văn bản; nếu có ngôn
ngữ thắng rõ → **trả về ngay, confidence 1.0, không đụng tới mô hình thống kê**.

Chi tiết đáng chú ý: phiếu `None` (từ không chốt được) chỉ bị loại nếu **ít hơn một
nửa số từ**. Nhiều từ không nhận ra được thì không được phép kết luận.

### 6b. `filter_languages_by_rules` — thu hẹp ứng viên

1. Đếm alphabet theo số ký tự, lấy **alphabet nhiều nhất**, giữ lại ngôn ngữ nào
   dùng alphabet đó.
2. Dùng bảng `CHARS_TO_LANGUAGES_MAPPING` (ký tự → tập ngôn ngữ có ký tự đó) để
   thu hẹp tiếp: ngôn ngữ nào được "bầu" **>= một nửa số từ** thì giữ.

Chỉ những ngôn ngữ sống sót mới được nạp mô hình. Ít mô hình = ít bộ nhớ, chạy nhanh.

---

## 7. Tokenizer: CJK tách từng ký tự

`constant.rs:34`

```
\p{Han}|\p{Hangul}+|\p{Hiragana}|\p{Katakana}|\p{L}+|…
```

Để ý **`\p{Han}` KHÔNG có `+`**, còn `\p{Hangul}+` và `\p{L}+` thì có.

Tiếng Trung/Nhật không có khoảng trắng giữa từ, nên mỗi chữ Hán là **một token
riêng**. Gom cả câu Hán thành một token thì n-gram sẽ bắt ngẫu nhiên qua ranh giới
từ và vô nghĩa.

---

## 8. Những thứ lingua CỐ TÌNH KHÔNG làm

- **Không từ điển từ vựng.** Chỉ thống kê ký tự + luật ký tự. Đổi lại: mô hình nhỏ,
  không phải bảo trì danh sách từ.
- **Không mạng nơ-ron.** Chạy offline, không phụ thuộc runtime nào.
- **Không đệm khoảng trắng quanh từ** khi sinh n-gram — khác Cavnar–Trenkle. Ranh
  giới từ đã được tokenizer lo, không cần mã hoá lại vào n-gram.

---

## Bảng port sang zdetect (4 ngôn ngữ: ko/zh/vi/en)

| Ý tưởng của lingua | Có đáng port không | Ghi chú |
|---|---|---|
| Xác suất có điều kiện + log | **Có** — thay hẳn rank-distance | Thắng lớn nhất về độ chính xác |
| Backoff bậc cao → thấp | **Có** | Bắt buộc đi kèm mục trên khi corpus nhỏ |
| n-gram 1..5, trigram khi >=120 ký tự | **Có** | |
| Chia cho số unigram khớp | **Có** | |
| Softmax confidence | **Có** | Thay `margin/marginScale` |
| Han tách từng ký tự | **Có** | Tokenizer hiện tại tách theo khoảng trắng |
| Rule engine 6a (alphabet đơn ngôn ngữ) | **Đã có** | `scriptDirectMap` của zdetect tương đương |
| Rule engine 6b (`CHARS_TO_LANGUAGES`) | **Có, dạng rút gọn** | Chỉ có vi/en cùng script Latin; ký tự riêng của vi (ă â đ ê ô ơ ư + dấu thanh) là tín hiệu chốt rất mạnh |
| FST lưu mô hình trên đĩa | **Không** | Mô hình 4 ngôn ngữ chỉ vài chục KB, nhét thẳng vào bundle đơn giản hơn |
| Đa luồng | **Không** | Chạy trong renderer, văn bản ngắn |
| Low-accuracy mode | **Không** | Chỉ có nghĩa khi nạp hàng chục mô hình |

**Thứ zdetect có mà lingua KHÔNG có:** lexicon coverage cho teencode. lingua tuyên
bố không dùng từ điển, nên nó không có cách nào bắt "ko", "bit", "j", "wa". Giữ
tầng đó — nó chạy **trước** mô hình thống kê, đúng vị trí của một luật chốt nhanh.

---

## HAI CHỖ PHẢI LÀM KHÁC lingua — tìm ra bằng đo, không phải bằng đọc

Port y nguyên là **sai**. Hai lần đầu đo trên tập held-out đều cho kết quả tệ hơn
bản Cavnar–Trenkle cũ. Nguyên nhân và cách sửa:

### A. N-gram lạ phải bị PHẠT, không được bỏ qua

`compute_sum_of_ngram_probabilities` của lingua chỉ cộng khi tra được, n-gram lạ
cộng 0 và đi tiếp. Với corpus khổng lồ của lingua thì vô hại: ngôn ngữ nào cũng
phủ gần hết ký tự Latin nên số hạng gần bằng nhau.

Với corpus nhỏ thì **hỏng nặng**. Đo trên `"hẹn gặp lại nhé"`:

```
vi  sum= -80.7  khớp 22 term   (10/10 unigram, 8/8 bigram)
en  sum= -46.2  khớp 15 term   ( 6/10 unigram — không có ẹ ặ ạ é)
```

Model tiếng Anh **thắng vì nó dốt hơn**: không biết ký tự nào thì không phải
cộng số âm nào. Càng ít biết càng ít bị trừ điểm.

Sửa: n-gram mà cả chuỗi backoff đều không tra được thì cộng một mức phạt
`floor = ln(1 / (tổng_unigram + 1))` — hiếm hơn thứ hiếm nhất từng thấy. Sau đó
số hạng bằng nhau giữa mọi ngôn ngữ, và mẫu số chuẩn hoá đổi từ "số unigram
khớp" sang "số n-gram đã chấm".

Kết quả: nhánh có dấu từ 81% lên **100%**.

### B. Lexicon phải loại từ trùng ngôn ngữ khác

Không liên quan lingua (nó không có lexicon), nhưng lộ ra đúng lúc đổi sang
corpus lớn. Lexicon "không dấu" sinh tự động từ corpus tiếng Việt: corpus nhỏ
cho 234 từ, corpus lớn cho 904 từ — và trong 904 từ đó có `can con the ban do la
no ta` (bỏ dấu của "cần còn thế bạn đó lá nó tá"), **đều là từ tiếng Anh thật**.

Đo được: độ chính xác tiếng Anh tụt còn **45.5%** vì lexicon nuốt luôn câu tiếng
Anh. Sửa bằng cách trừ đi tập token của mọi corpus ngôn ngữ khác (66 từ bị loại)
→ tiếng Anh về **99.5%**.

Bài học chung: một heuristic tốt ở quy mô nhỏ có thể lật ngược dấu khi dữ liệu
lớn lên. Đổi corpus thì phải đo lại, không được giả định.
