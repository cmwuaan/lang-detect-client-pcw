import * as React from 'react';

import { AvailabilityStatus } from '../services/detection/LanguageDetector';

const AVAILABILITY_LABEL: { [K in AvailabilityStatus]: string } = {
	available: 'sẵn sàng',
	downloadable: 'cần tải model',
	downloading: 'đang tải model',
	unavailable: 'không khả dụng',
};

/**
 * Nhãn theo backend mà native tự khai — không suy từ `navigator.platform` hay
 * user agent. Nếu native nói 'apple-nl' thì đúng là Apple NaturalLanguage đang
 * chạy, không phải "chắc là macOS nên chắc là Apple".
 */
const BACKEND_LABEL: { [backend: string]: string } = {
	'apple-nl': 'Native macOS — Apple NaturalLanguage',
	'windows-els': 'Native Windows — Extended Linguistic Services',
};

export interface ActiveMethodProps {
	isDesktop: boolean;
	/** `info().backend` thô từ native; null khi web hoặc chưa đọc được. */
	backend: string | null;
	/** `info().scoreKind` thô; null khi chưa đọc được. */
	scoreKind: string | null;
	availability: AvailabilityStatus | null;
}

function title(props: ActiveMethodProps): string {
	if (!props.isDesktop) return 'Hạ tầng của trình duyệt — Web API LanguageDetector';
	if (props.backend && BACKEND_LABEL[props.backend]) return BACKEND_LABEL[props.backend];
	if (props.backend === 'none') return 'Native của hệ điều hành — không có backend';
	return 'Native của hệ điều hành';
}

function detail(props: ActiveMethodProps): string {
	if (!props.isDesktop) {
		return 'Bản web dùng model của trình duyệt qua window.LanguageDetector (Chromium >= 138). Không có bridge sang native.';
	}
	const score =
		props.scoreKind === 'rank'
			? 'Backend chỉ trả thứ hạng, không có điểm — độ tin cậy hiển thị là do app quy đổi.'
			: props.scoreKind === 'probability'
				? 'Độ tin cậy là xác suất thật của model.'
				: '';
	return ('Model nằm sẵn trong hệ điều hành: không tải, không cần mạng. ' + score).trim();
}

/**
 * Chỉ BÁO đang chạy bằng gì — không phải bộ chọn.
 *
 * Nền tảng quyết định phương pháp (xem services/container.ts), nên ở đây không
 * có nút nào bấm được: desktop luôn là native của OS, web luôn là hạ tầng của
 * trình duyệt.
 */
export function ActiveMethod(props: ActiveMethodProps): JSX.Element {
	return (
		<div className="field">
			<span className="field__label">Đang nhận diện bằng</span>
			<div className="u-row">
				<span className="badge badge--desktop">
					<span className="badge__dot" aria-hidden="true" />
					{title(props)}
				</span>
				<span className="field__hint">
					{props.availability
						? AVAILABILITY_LABEL[props.availability]
						: 'đang kiểm tra…'}
				</span>
			</div>
			<span className="field__hint">{detail(props)}</span>
		</div>
	);
}
