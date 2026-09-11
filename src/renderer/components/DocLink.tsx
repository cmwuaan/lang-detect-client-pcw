import * as React from 'react';

export interface DocLinkProps {
	/** Official vendor documentation page for this exact option. */
	href: string;
	/** Screen-reader label, e.g. "languageConstraints documentation". */
	label: string;
}

/**
 * Circled question mark linking to the vendor's own documentation page.
 *
 * Vì sao link ra tài liệu GỐC chứ không viết lại giải thích ở đây: hành vi của
 * mấy option này do Apple/Microsoft định nghĩa và họ đổi lúc nào không báo. Một
 * đoạn mô tả chép tay sẽ lỗi thời âm thầm, còn link thì luôn trỏ tới nguồn sự
 * thật.
 *
 * `target="_blank"` đi qua setWindowOpenHandler ở src/main/main.ts để mở bằng
 * trình duyệt của người dùng, không phải một BrowserWindow không có thanh địa
 * chỉ. `rel` bắt buộc: thiếu `noopener` là trang đích với tay được vào
 * `window.opener`.
 */
export function DocLink(props: DocLinkProps): JSX.Element {
	return (
		<a
			className="doclink"
			href={props.href}
			target="_blank"
			rel="noopener noreferrer"
			aria-label={props.label}
			title={props.label}
		>
			{/* SVG inline thay vì ký tự '?': tròn đều ở mọi font, và không bị
			    font fallback làm méo trên Windows. */}
			<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
				<circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" />
				<path
					d="M6.1 6.1a1.95 1.95 0 1 1 2.6 1.85c-.5.18-.75.55-.75 1.05v.4"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.4"
					strokeLinecap="round"
				/>
				<circle cx="7.95" cy="11.6" r="0.85" fill="currentColor" />
			</svg>
		</a>
	);
}
