import * as React from 'react';

import { ActiveMethod } from './components/ActiveMethod';
import { NativeRawLog } from './components/NativeRawLog';
import { SampleChips } from './components/SampleChips';
import { languageName } from './lib/languageName';
import { SAMPLES } from './lib/samples';
import { useDebouncedValue } from './lib/useDebouncedValue';
import { useLanguageDetector } from './lib/useLanguageDetector';
import { useNativeRaw } from './lib/useNativeRaw';
import {
	LanguageDetectionResult,
	LanguageDetectorProvider,
	UNDETERMINED_LANGUAGE,
} from './services/detection/LanguageDetector';
import { IPlatformService, PlatformInfo } from './services/platform/IPlatformService';

const DETECT_DEBOUNCE_MS = 200;

export interface AppProps {
	/** Đúng một provider, do nền tảng quyết định — xem services/container.ts. */
	provider: LanguageDetectorProvider;
	platform: IPlatformService;
}

export function App(props: AppProps): JSX.Element {
	const provider = props.provider;
	const platform = props.platform;

	const [text, setText] = React.useState<string>(SAMPLES[0].text);
	const [info, setInfo] = React.useState<PlatformInfo | null>(null);
	const [results, setResults] = React.useState<LanguageDetectionResult[] | null>(null);

	React.useEffect(
		function () {
			let alive = true;
			void platform.getInfo().then(function (next) {
				if (alive) setInfo(next);
			});
			return function () {
				alive = false;
			};
		},
		[platform]
	);

	// Hook lo vòng đời session: availability, transient activation, tiến độ tải.
	const state = useLanguageDetector(provider);
	const detector = state.detector;

	// Session mới -> kết quả cũ không còn ý nghĩa.
	React.useEffect(
		function () {
			setResults(null);
		},
		[detector]
	);

	const detectText = useDebouncedValue(text, DETECT_DEBOUNCE_MS);

	// Log raw dùng cùng văn bản đã debounce để hai phần không lệch nhau.
	const raw = useNativeRaw(detectText);

	React.useEffect(
		function () {
			let alive = true;
			if (detector) {
				detector.detect(detectText).then(
					function (next) {
						if (alive) setResults(next);
					},
					function () {
						if (alive) setResults([]);
					}
				);
			}
			return function () {
				alive = false;
			};
		},
		[detector, detectText]
	);

	// detect() trả mảng đã sắp giảm dần theo confidence, phần tử cuối luôn là 'und'.
	const best = results && results.length > 0 ? results[0] : null;
	const isUndetermined = best !== null && best.detectedLanguage === UNDETERMINED_LANGUAGE;
	const isBusy = detector !== null && (detectText !== text || results === null);

	let display: string;
	if (!detector) display = '—';
	else if (isBusy) display = '…';
	else if (!best) display = '—';
	else if (isUndetermined) display = 'Không xác định';
	else display = languageName(best.detectedLanguage);

	return (
		<main className="shell">
			<header className="shell__header">
				<div>
					<h1>Lang Detect</h1>
				</div>
				<div className="u-row">
					<span className={'badge' + (platform.isDesktop ? ' badge--desktop' : '')}>
						<span className="badge__dot" aria-hidden="true" />
						{info ? info.label : '…'}
					</span>
				</div>
			</header>

			<section className="card">
				<div className="field">
					<div className="field__header">
						<label className="field__label" htmlFor="input-text">
							Văn bản cần nhận diện
						</label>
						{/* Kết quả nằm ngay cạnh label. aria-live vì nó tự đổi khi gõ. */}
						<span
							className="field__result"
							aria-live="polite"
							aria-atomic="true"
							aria-busy={isBusy}
							title={
								best && !isUndetermined
									? 'Độ tin cậy ' + Math.round(best.confidence * 100) + '%'
									: undefined
							}
						>
							{display}
						</span>
					</div>
					<textarea
						id="input-text"
						className="textarea"
						value={text}
						spellCheck={false}
						placeholder="Dán hoặc gõ văn bản vào đây…"
						onChange={function (event) {
							setText(event.target.value);
						}}
					/>
					<span className="field__hint">{text.length} ký tự</span>
				</div>
				<SampleChips onPick={setText} />
			</section>

			<section className="card">
				<ActiveMethod
					isDesktop={platform.isDesktop}
					backend={raw.info.value ? raw.info.value.backend : null}
					scoreKind={raw.info.value ? raw.info.value.scoreKind : null}
					availability={state.availability}
				/>

				{/* Spec đòi transient activation: model chỉ được tải từ trong một
				    sự kiện do người dùng kích hoạt, không tự tải lúc mount. */}
				{state.needsUserGesture ? (
					<div className="u-row">
						<button type="button" className="button" onClick={state.requestCreate}>
							Tải model ngôn ngữ
						</button>
						<span className="field__hint">
							Trình duyệt yêu cầu thao tác của người dùng trước khi tải model.
						</span>
					</div>
				) : null}

				{state.progress !== null ? (
					<span className="field__hint">Đang tải model… {Math.round(state.progress * 100)}%</span>
				) : null}

				{state.error ? <p className="field__hint">{state.error}</p> : null}
			</section>

			<section className="card">
				<h2 className="card__title">Kết quả thô từ native</h2>
				<p className="field__hint">
					Nguyên trạng từ facade <code>nativelibs/zlang</code>, chưa qua adapter Web API
					ở trên.
				</p>
				<NativeRawLog state={raw} />
			</section>

			<section className="card">
				<h2 className="card__title">Môi trường thực thi</h2>
				{info ? (
					<dl className="kv">
						{info.details.map(function (row) {
							return (
								<React.Fragment key={row.name}>
									<dt>{row.name}</dt>
									<dd>{row.value}</dd>
								</React.Fragment>
							);
						})}
					</dl>
				) : (
					<p className="field__hint">Đang đọc thông tin platform…</p>
				)}
			</section>

			<footer className="shell__footer">
				Phương pháp do nền tảng quyết định · đang dùng <code>{provider.id}</code>
			</footer>
		</main>
	);
}
