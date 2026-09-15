/**
 * Bề mặt THÔ của file .node — bản chiếu TypeScript của src/lib.rs.
 *
 * Tên field ở đây là tên một từ mà napi sinh ra (`tag`, `confidence`), chưa đổi
 * tên, chưa gate availability, chưa chuẩn hoá gì. Việc đó là của index.ts.
 *
 * KHÔNG có gì kiểm tra file này khớp với phía Rust — nó là bản chép tay, giống
 * hệt quan hệ giữa src/backend.rs và src/zlang_bridge.h. Thêm hoặc sửa một hàm
 * `#[napi]` thì phải sửa cả đây, nếu không sai lệch chỉ lộ ra lúc chạy.
 *
 * Tách khỏi index.ts để bề mặt ABI là một artifact nhìn thấy được, đặt cạnh
 * zlang_bridge.h cho dễ đối chiếu khi thêm backend mới.
 */

/**
 * Ý nghĩa con số trong `confidence` — do backend quyết định, không phải do tầng
 * TS chọn. Xem `backend::score_kind()` trong src/backend.rs.
 *
 *   'probability'  xác suất thật của model (Apple NaturalLanguage)
 *   'rank'         chỉ có thứ hạng, `confidence` là null (Windows/ELS)
 *   'none'         nền tảng không có backend nào
 *   'unknown'      bridge trả con trỏ null — không nên xảy ra
 */
export type ZLangScoreKind = 'probability' | 'rank' | 'none' | 'unknown';

/**
 * Một ô ZlangHypothesis sau khi đi qua napi.
 * Khớp `#[napi(object)] pub struct Hypothesis` trong src/lib.rs.
 */
export interface ZLangNativeHypothesis {
	/** Thẻ BCP 47 thô của OS, chưa chuẩn hoá. */
	tag: string;
	/**
	 * `null` khi backend không cho điểm — bên C là ZLANG_NO_CONFIDENCE (NaN),
	 * backend.rs đổi thành `None`, napi đổi thành `null`.
	 */
	confidence: number | null;
}

/** Toàn bộ hàm `#[napi]` trong src/lib.rs, đúng thứ tự khai báo ở đó. */
export interface ZLangNativeBinding {
	version(): string;
	backend(): string;
	available(): boolean;
	scores(): ZLangScoreKind;
	/**
	 * `maxResults` không truyền = xin hết sức chứa buffer (ZLANG_MAX_RESULTS).
	 * Chạy trên libuv threadpool, không chặn luồng JS.
	 */
	detect(text: string, maxResults?: number): Promise<ZLangNativeHypothesis[]>;
}
