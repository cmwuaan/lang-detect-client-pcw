import * as React from 'react';

type Mode = 'system' | 'light' | 'dark';

const NEXT: { [K in Mode]: Mode } = { system: 'light', light: 'dark', dark: 'system' };
const LABEL: { [K in Mode]: string } = { system: 'Theo hệ thống', light: 'Sáng', dark: 'Tối' };

/**
 * Stamp `data-theme` lên <html>. Mode `system` bỏ hẳn attribute để
 * prefers-color-scheme quyết định (xem styles/base/_theme.scss).
 */
export function ThemeToggle(): JSX.Element {
  const [mode, setMode] = React.useState<Mode>('system');

  React.useEffect(function () {
    const root = document.documentElement;
    if (mode === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', mode);
  }, [mode]);

  return (
    <button
      type="button"
      className="button button--ghost"
      onClick={function () { setMode(NEXT[mode]); }}
    >
      Giao diện: {LABEL[mode]}
    </button>
  );
}
