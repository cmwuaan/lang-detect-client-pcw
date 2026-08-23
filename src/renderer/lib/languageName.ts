/**
 * Đổi thẻ BCP 47 (`detect()` trả về thẻ, không trả về tên) thành tên đọc được.
 *
 * `Intl.DisplayNames` có từ Chromium 81 nên Electron 22 (Chromium 108) và mọi
 * browser hiện hành đều dùng được; nếu không có thì trả nguyên thẻ.
 */

interface DisplayNamesLike {
  of(code: string): string | undefined;
}

let cached: DisplayNamesLike | null | undefined;

function displayNames(): DisplayNamesLike | null {
  if (cached !== undefined) return cached;

  const intl = Intl as unknown as {
    DisplayNames?: new (
      locales: string[],
      options: { type: string }
    ) => DisplayNamesLike;
  };

  cached = intl.DisplayNames ? new intl.DisplayNames(['en'], { type: 'language' }) : null;
  return cached;
}

export function languageName(tag: string): string {
  const names = displayNames();
  if (!names) return tag;
  try {
    return names.of(tag) || tag;
  } catch {
    // Thẻ không hợp lệ -> hiện nguyên thẻ, không làm sập UI.
    return tag;
  }
}
