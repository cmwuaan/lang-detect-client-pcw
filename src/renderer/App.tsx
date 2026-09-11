import * as React from 'react';

import { ActiveMethod } from './components/ActiveMethod';
import { HypothesisMeter } from './components/HypothesisMeter';
import {
	DEFAULT_OPTION_TEXT,
	isDefaultOptionText,
	NativeOptions,
	NativeOptionText,
} from './components/NativeOptions';
import { NativeRawLog } from './components/NativeRawLog';
import { SampleChips } from './components/SampleChips';
import { languageName } from './lib/languageName';
import {
	parseHints,
	parseMaxResults,
	parseStartIndex,
	parseTagList,
	parseText,
} from './lib/nativeOptionText';
import { SAMPLES } from './lib/samples';
import { useDebouncedValue } from './lib/useDebouncedValue';
import { useConfidenceValues } from './lib/useConfidenceValues';
import { useLanguageDetector } from './lib/useLanguageDetector';
import { useNativeRaw } from './lib/useNativeRaw';
import {
	LanguageDetectionResult,
	LanguageDetectorProvider,
	NativeDetectorOptions,
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
	// Tất cả rỗng = không truyền option nào; native để OS giữ mặc định của nó.
	const [optionText, setOptionText] = React.useState<NativeOptionText>(DEFAULT_OPTION_TEXT);

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

	/*
	 * Option gõ dở được chuyển sang hình dạng native ngay mỗi render. Rẻ, và nhờ
	 * vậy cả kết quả hiển thị lẫn panel log raw đều dùng CÙNG một bộ option —
	 * không có chuyện hai bên chạy hai cấu hình khác nhau.
	 */
	const nativeOptions = React.useMemo(
		function (): NativeDetectorOptions {
			const constraints = parseTagList(optionText.constraints);
			const hints = parseHints(optionText.hints);
			// undefined ở mọi field = không truyền gì cả, không phải "truyền giá
			// trị mặc định". Ô trống thì OS giữ hành vi gốc của nó.
			return {
				maxResults: parseMaxResults(optionText.maxResults),
				constraints: constraints.length > 0 ? constraints : undefined,
				hints: Object.keys(hints).length > 0 ? hints : undefined,
				inputLanguage: parseText(optionText.inputLanguage),
				inputScript: parseText(optionText.inputScript),
				startIndex: parseStartIndex(optionText.startIndex),
			};
		},
		[optionText]
	);

	// Hook lo vòng đời session: availability, transient activation, tiến độ tải.
	const state = useLanguageDetector(provider, nativeOptions);
	const detector = state.detector;

	// Session mới -> kết quả cũ không còn ý nghĩa.
	React.useEffect(
		function () {
			setResults(null);
		},
		[detector]
	);

	const detectText = useDebouncedValue(text, DETECT_DEBOUNCE_MS);

	// Log raw dùng cùng văn bản đã debounce và cùng option để hai phần không lệch nhau.
	const raw = useNativeRaw(detectText, nativeOptions);

	/*
	 * Điểm gốc cho mọi ngôn ngữ. Hai nền tảng lấy từ hai đường khác nhau nhưng
	 * CÙNG một hình dạng `{ detectedLanguage, confidence }`:
	 *   desktop  zlang.detect() qua IPC — đã có sẵn trong `raw`
	 *   web      zdetect.confidenceValues() — gọi thẳng, không qua IPC
	 * Nhờ vậy HypothesisMeter không cần biết đang chạy nền tảng nào.
	 */
	const webConfidences = useConfidenceValues(provider, detectText);
	const hypotheses = raw.hasBridge
		? raw.detect.value
			? raw.detect.value.hypotheses
			: []
		: webConfidences;

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
	else if (isUndetermined) display = 'Undetermined';
	else display = languageName(best.detectedLanguage);

	const confidenceText = best && !isUndetermined ? Math.round(best.confidence * 100) + '%' : null;
	const dominant = raw.detect.value ? raw.detect.value.dominantLanguage : null;

	return (
		<main className="shell">
			<header className="shell__header">
				<div className="shell__title">
					<h1>Lang Detect</h1>
					<span className="shell__tagline">Language detection playground</span>
				</div>
				<div className="u-row">
					<span className={'badge' + (platform.isDesktop ? ' badge--desktop' : '')}>
						<span className="badge__dot" aria-hidden="true" />
						{info ? info.label : '…'}
					</span>
				</div>
			</header>

			{/*
			 * Hai cột: TRÁI là mọi thứ điền vào, PHẢI là mọi thứ đọc ra. Ranh giới
			 * đó giữ được kể cả khi thêm option mới — cứ thêm vào cột trái.
			 * Màn hình hẹp thì _layout.scss xếp lại thành một cột, trái trước.
			 */}
			<div className="split">
				<div className="split__col">
					<section className="card">
						<h2 className="card__title">Input</h2>
						<div className="field">
							<label className="field__label" htmlFor="input-text">
								Text to detect
							</label>
							<textarea
								id="input-text"
								className="textarea"
								value={text}
								spellCheck={false}
								placeholder="Paste or type text here…"
								onChange={function (event) {
									setText(event.target.value);
								}}
							/>
							<span className="field__hint">{text.length} characters</span>
						</div>
						<SampleChips onPick={setText} supportedLanguages={provider.supportedLanguages} />
					</section>

					{raw.hasBridge ? (
						<section className="card">
							<div className="card__head">
								<h2 className="card__title">Native options</h2>
								{/* Tắt khi đã ở mặc định: nút bấm không làm gì là một lời nói dối nhỏ. */}
								<button
									type="button"
									className="button button--ghost button--small"
									disabled={isDefaultOptionText(optionText)}
									onClick={function () {
										setOptionText(DEFAULT_OPTION_TEXT);
									}}
								>
									Reset to defaults
								</button>
							</div>
							<p className="field__hint">
								Passed straight through to the OS API. Leave a field empty to send nothing and keep
								the OS default. Changing any value re-runs both the result and the raw log.
							</p>
							<NativeOptions
								value={optionText}
								onChange={setOptionText}
								capabilities={raw.info.value ? raw.info.value.capabilities : null}
							/>
						</section>
					) : null}
				</div>

				<div className="split__col">
					<section className="card">
						<h2 className="card__title">Result</h2>

						{/* aria-live vì nó tự đổi khi gõ, không có sự kiện nào báo. */}
						<div className="hero" aria-live="polite" aria-atomic="true" aria-busy={isBusy}>
							<span className={'hero__value' + (best && !isUndetermined ? '' : ' is-muted')}>
								{display}
							</span>
							<span className="hero__meta">
								{confidenceText ? <span className="hero__confidence">{confidenceText}</span> : null}
								<span className="hero__note">
									{dominant ? 'dominant ' + dominant : 'confidence'}
								</span>
							</span>
						</div>

						<HypothesisMeter
							hypotheses={hypotheses}
							scoreKind={raw.info.value ? raw.info.value.scoreKind : null}
						/>

						<ActiveMethod
							isDesktop={platform.isDesktop}
							backend={raw.info.value ? raw.info.value.backend : null}
							scoreKind={raw.info.value ? raw.info.value.scoreKind : null}
							availability={state.availability}
							supportedLanguages={provider.supportedLanguages}
						/>

						{/* Spec đòi transient activation: model chỉ được tải từ trong một
						    sự kiện do người dùng kích hoạt, không tự tải lúc mount. */}
						{state.needsUserGesture ? (
							<div className="u-row">
								<button type="button" className="button" onClick={state.requestCreate}>
									Download language model
								</button>
								<span className="field__hint">
									The browser requires a user gesture before downloading a model.
								</span>
							</div>
						) : null}

						{state.progress !== null ? (
							<span className="field__hint">
								Downloading model… {Math.round(state.progress * 100)}%
							</span>
						) : null}

						{state.error ? <p className="field__hint">{state.error}</p> : null}
					</section>

					<section className="card">
						<h2 className="card__title">Raw native output</h2>
						<p className="field__hint">
							Exactly what the <code>nativelibs/zlang</code> facade returns, before the Web API
							adapter above touches it.
						</p>
						<NativeRawLog state={raw} />
					</section>

					{/* Gập lại: tra một lần lúc gỡ lỗi, không cần chiếm chỗ thường trực. */}
					<details className="group">
						<summary className="group__summary">Runtime</summary>
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
							<p className="field__hint">Reading platform info…</p>
						)}
					</details>
				</div>
			</div>

			<footer className="shell__footer">
				<span>
					Engine chosen by platform · <code>{provider.id}</code>
				</span>
				<span>{isBusy ? 'detecting…' : 'idle'}</span>
			</footer>
		</main>
	);
}
