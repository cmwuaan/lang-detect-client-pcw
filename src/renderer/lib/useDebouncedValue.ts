import * as React from 'react';

/**
 * Trả về `value` sau khi nó ngừng đổi trong `delay` ms.
 *
 * Panel kết quả nằm NGAY TRÊN khung input, nên nếu render lại theo từng phím
 * thì kết quả nhấp nháy và chiều cao panel thay đổi liên tục, đẩy khung input
 * nhảy trong lúc đang gõ. Debounce ngắn cho kết quả "đứng lại" mà vẫn còn cảm
 * giác tức thời.
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [settled, setSettled] = React.useState<T>(value);

  React.useEffect(function () {
    const timer = setTimeout(function () {
      setSettled(value);
    }, delay);

    return function () {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return settled;
}
