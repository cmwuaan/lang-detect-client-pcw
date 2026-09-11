import * as React from 'react';

import { AvailabilityStatus } from '../services/detection/LanguageDetector';

import { DocLink } from './DocLink';

const AVAILABILITY_LABEL: { [K in AvailabilityStatus]: string } = {
	available: 'ready',
	downloadable: 'model needs downloading',
	downloading: 'downloading model',
	unavailable: 'unavailable',
};

/**
 * Nhãn theo backend mà native TỰ KHAI — không suy từ `navigator.platform` hay
 * user agent. Native nói 'apple-nl' thì đúng là Apple NaturalLanguage đang chạy,
 * không phải "chắc là macOS nên chắc là Apple".
 */
const BACKEND: { [backend: string]: { title: string; docHref: string } } = {
	'apple-nl': {
		title: 'macOS native — Apple NaturalLanguage',
		docHref: 'https://developer.apple.com/documentation/naturallanguage/nllanguagerecognizer',
	},
	'windows-els': {
		title: 'Windows native — Extended Linguistic Services',
		docHref: 'https://learn.microsoft.com/en-us/windows/win32/intl/microsoft-language-detection',
	},
};

/** Bản web chạy detector của chính repo; tài liệu là README của package đó. */
const WEB_DOC = 'https://github.com/cmwuaan/lang-detect-client-pcw/tree/main/weblibs/zdetect';

export interface ActiveMethodProps {
	isDesktop: boolean;
	/** Raw `info().backend`; null on web or when it could not be read. */
	backend: string | null;
	/** Raw `info().scoreKind`; null when it could not be read. */
	scoreKind: string | null;
	availability: AvailabilityStatus | null;
	/**
	 * Thẻ BCP 47 provider chắc chắn kết luận được; `undefined` = không biết.
	 * Native để trống vì model của OS nhận nhiều ngôn ngữ hơn mà không API nào
	 * liệt kê ra được.
	 */
	supportedLanguages?: string[];
}

function describe(props: ActiveMethodProps): { title: string; docHref: string } {
	if (!props.isDesktop) {
		return { title: 'Built-in detector — weblibs/zdetect', docHref: WEB_DOC };
	}
	if (props.backend && BACKEND[props.backend]) return BACKEND[props.backend];
	if (props.backend === 'none') {
		return { title: 'OS native — no backend available', docHref: WEB_DOC };
	}
	return { title: 'OS native', docHref: WEB_DOC };
}

function detail(props: ActiveMethodProps): string {
	if (!props.isDesktop) {
		return (
			'Runs entirely in the browser. Unicode script routing decides Korean and Chinese; ' +
			'Vietnamese and English are separated by conditional n-gram probabilities ported ' +
			'from lingua-rs, with a lexicon that still catches Vietnamese typed without ' +
			'accents. Nothing is downloaded, no request leaves the page, and the same input ' +
			'gives the same answer in every browser.'
		);
	}
	const base = 'The model ships inside the OS: nothing to download, no network.';
	if (props.scoreKind === 'rank') {
		return (
			base +
			' This backend only ranks languages — it gives no score, so any percentage you see was derived by the app.'
		);
	}
	if (props.scoreKind === 'probability') {
		return base + ' Confidence values are the model’s real probabilities.';
	}
	return base;
}

/**
 * Reports which engine is running. Not a picker.
 *
 * Nền tảng quyết định phương pháp (xem services/container.ts), nên ở đây không
 * có nút nào bấm được.
 */
export function ActiveMethod(props: ActiveMethodProps): JSX.Element {
	const info = describe(props);

	return (
		<div className="field">
			<div className="field__labelrow">
				<span className="field__label">Detecting with</span>
				<DocLink href={info.docHref} label="Engine documentation" />
			</div>
			<div className="u-row">
				<span className="badge badge--desktop">
					<span className="badge__dot" aria-hidden="true" />
					{info.title}
				</span>
				<span className="field__hint">
					{props.availability ? AVAILABILITY_LABEL[props.availability] : 'checking…'}
				</span>
			</div>
			<span className="field__hint">{detail(props)}</span>
		</div>
	);
}
