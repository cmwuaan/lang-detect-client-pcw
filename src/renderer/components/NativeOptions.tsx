import * as React from 'react';

import { NativeCapabilities } from '@shared/ipc';

import { DocLink } from './DocLink';
import { TagInput } from './TagInput';

/** Raw text as typed, so a half-typed value never jumps under the cursor. */
export interface NativeOptionText {
	maxResults: string;
	// macOS — Apple NaturalLanguage
	constraints: string;
	hints: string;
	// Windows — Extended Linguistic Services
	inputLanguage: string;
	inputScript: string;
	startIndex: string;
}

/**
 * Trạng thái mặc định = MỌI Ô ĐỀU RỖNG.
 *
 * Không phải chỗ này lười điền sẵn: rỗng nghĩa là "không truyền option đó", và
 * khi đó OS giữ hành vi gốc của chính nó. Điền sẵn một con số vào đây là tự đặt
 * ra mặc định thay cho Apple/Microsoft — đúng thứ module cố tình tránh.
 */
export const DEFAULT_OPTION_TEXT: NativeOptionText = {
	maxResults: '',
	constraints: '',
	hints: '',
	inputLanguage: '',
	inputScript: '',
	startIndex: '',
};

/** Đã ở mặc định chưa — để nút Reset tự tắt khi không còn gì để reset. */
export function isDefaultOptionText(value: NativeOptionText): boolean {
	const keys = Object.keys(DEFAULT_OPTION_TEXT) as Array<keyof NativeOptionText>;
	return keys.every(function (key) {
		return value[key] === DEFAULT_OPTION_TEXT[key];
	});
}

/**
 * Đường dẫn tài liệu CHÍNH THỨC của từng option, đã kiểm chứng từng URL.
 *
 * `languageHints` mang hậu tố `-7dwgv` do Apple phải phân biệt biến thể Swift
 * với biến thể Objective-C; bản không hậu tố trả về 404 thật, đừng "dọn cho
 * gọn".
 */
const DOCS = {
	maxResults:
		'https://developer.apple.com/documentation/naturallanguage/nllanguagerecognizer/languagehypotheses(withmaximum:)',
	constraints:
		'https://developer.apple.com/documentation/naturallanguage/nllanguagerecognizer/languageconstraints',
	hints:
		'https://developer.apple.com/documentation/naturallanguage/nllanguagerecognizer/languagehints-7dwgv',
	enumOptions:
		'https://learn.microsoft.com/en-us/windows/win32/api/elscore/ns-elscore-mapping_enum_options',
	recognizeText:
		'https://learn.microsoft.com/en-us/windows/win32/api/elscore/nf-elscore-mappingrecognizetext',
};

/** Khớp ZLANG_MAX_RESULTS. */
const MAX_RESULTS_CAP = 16;

export interface NativeOptionsProps {
	value: NativeOptionText;
	onChange: (next: NativeOptionText) => void;
	/** null while `info()` has not been read yet — treat as unknown, keep locked. */
	capabilities: NativeCapabilities | null;
}

interface FieldProps {
	htmlFor?: string;
	label: string;
	/** Native symbol this field maps to. */
	maps: string;
	docHref: string;
	hint: string;
	children: React.ReactNode;
}

function Field(props: FieldProps): JSX.Element {
	return (
		<div className="field">
			<div className="field__labelrow">
				<label className="field__label" htmlFor={props.htmlFor}>
					{props.label}
				</label>
				<DocLink href={props.docHref} label={props.maps + ' documentation'} />
			</div>
			{props.children}
			<span className="field__hint">{props.hint}</span>
		</div>
	);
}

/**
 * Pass NLLanguageRecognizer / ELS options straight through to native.
 *
 * Ô nào backend không hỗ trợ thì khoá, đọc từ `info().capabilities` chứ không
 * đoán theo `process.platform` — native tự khai nó làm được gì. Nhóm nào khoá
 * hết thì gập lại để khỏi chiếm chiều cao vô ích.
 */
export function NativeOptions(props: NativeOptionsProps): JSX.Element {
	const caps = props.capabilities;
	const value = props.value;

	function set(key: keyof NativeOptionText, next: string): void {
		const updated: NativeOptionText = {
			maxResults: value.maxResults,
			constraints: value.constraints,
			hints: value.hints,
			inputLanguage: value.inputLanguage,
			inputScript: value.inputScript,
			startIndex: value.startIndex,
		};
		updated[key] = next;
		props.onChange(updated);
	}

	function setter(key: keyof NativeOptionText): (next: string) => void {
		return function (next: string) {
			set(key, next);
		};
	}

	const appleOn = !!caps && (caps.constraints || caps.hints);
	const elsOn = !!caps && (caps.inputLanguage || caps.inputScript || caps.startIndex);

	// Rỗng = không truyền. Slider cần một số để hiển thị, nên lúc "auto" nó
	// nằm ở mức trần — nhưng giá trị gửi đi vẫn là "không gửi gì".
	const isAuto = value.maxResults === '';
	const sliderValue = isAuto ? MAX_RESULTS_CAP : Number(value.maxResults);

	return (
		<div className="options">
			<Field
				htmlFor="opt-max-results"
				label="maxResults"
				maps="languageHypotheses(withMaximum:)"
				docHref={DOCS.maxResults}
				hint="Auto sends nothing and lets the OS decide. Every backend understands this one."
			>
				<div className="slider">
					<label className="toggle">
						<input
							type="checkbox"
							checked={isAuto}
							onChange={function (event) {
								set('maxResults', event.target.checked ? '' : String(MAX_RESULTS_CAP));
							}}
						/>
						Auto
					</label>
					<input
						id="opt-max-results"
						className="slider__range"
						type="range"
						min={1}
						max={MAX_RESULTS_CAP}
						step={1}
						value={sliderValue}
						disabled={isAuto}
						onChange={function (event) {
							set('maxResults', event.target.value);
						}}
					/>
					<span className="slider__value">{isAuto ? 'auto' : sliderValue}</span>
				</div>
			</Field>

			<details className="group" open={appleOn}>
				<summary className="group__summary">
					macOS — Apple NaturalLanguage
					{caps && !appleOn ? <span className="group__badge">unsupported here</span> : null}
				</summary>

				<Field
					htmlFor="opt-constraints"
					label="constraints"
					maps="languageConstraints"
					docHref={DOCS.constraints}
					hint={
						caps && !caps.constraints
							? 'Not supported by this backend.'
							: 'BCP 47 tags. A SOFT constraint: other languages can still appear, with confidence 0.'
					}
				>
					<TagInput
						id="opt-constraints"
						value={value.constraints}
						onChange={setter('constraints')}
						placeholder="en, fr, zh-Hant"
						disabled={!caps || !caps.constraints}
					/>
				</Field>

				<Field
					htmlFor="opt-hints"
					label="hints"
					maps="languageHints"
					docHref={DOCS.hints}
					hint={
						caps && !caps.hints
							? 'Not supported by this backend.'
							: 'Priors as tag:weight. Strong enough to flip the result on ambiguous text.'
					}
				>
					<TagInput
						id="opt-hints"
						value={value.hints}
						onChange={setter('hints')}
						placeholder="vi:0.9, en:0.1"
						disabled={!caps || !caps.hints}
					/>
				</Field>
			</details>

			<details className="group" open={elsOn}>
				<summary className="group__summary">
					Windows — Extended Linguistic Services
					{caps && !elsOn ? <span className="group__badge">unsupported here</span> : null}
				</summary>

				<Field
					htmlFor="opt-input-language"
					label="inputLanguage"
					maps="MAPPING_ENUM_OPTIONS.pszInputLanguage"
					docHref={DOCS.enumOptions}
					hint={
						caps && !caps.inputLanguage
							? 'Not supported by this backend.'
							: 'IETF tag. Filters which SERVICE is used, not which languages come back.'
					}
				>
					<input
						id="opt-input-language"
						className="input"
						type="text"
						spellCheck={false}
						autoComplete="off"
						value={value.inputLanguage}
						placeholder="vi"
						disabled={!caps || !caps.inputLanguage}
						onChange={function (event) {
							set('inputLanguage', event.target.value);
						}}
					/>
				</Field>

				<Field
					htmlFor="opt-input-script"
					label="inputScript"
					maps="MAPPING_ENUM_OPTIONS.pszInputScript"
					docHref={DOCS.enumOptions}
					hint={
						caps && !caps.inputScript
							? 'Not supported by this backend.'
							: 'Unicode script name of the input text. Also a service filter.'
					}
				>
					<input
						id="opt-input-script"
						className="input"
						type="text"
						spellCheck={false}
						autoComplete="off"
						value={value.inputScript}
						placeholder="Latn"
						disabled={!caps || !caps.inputScript}
						onChange={function (event) {
							set('inputScript', event.target.value);
						}}
					/>
				</Field>

				<Field
					htmlFor="opt-start-index"
					label="startIndex"
					maps="MappingRecognizeText.dwIndex"
					docHref={DOCS.recognizeText}
					hint={
						caps && !caps.startIndex
							? 'Not supported by this backend — slice the string yourself on macOS.'
							: 'Character index to start reading from, 0 to length-1.'
					}
				>
					<input
						id="opt-start-index"
						className="input"
						type="number"
						min={0}
						value={value.startIndex}
						placeholder="0"
						disabled={!caps || !caps.startIndex}
						onChange={function (event) {
							set('startIndex', event.target.value);
						}}
					/>
				</Field>
			</details>
		</div>
	);
}
