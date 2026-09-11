import * as React from 'react';

import { NativeCapabilities } from '@shared/ipc';

/** Giá trị đang gõ, giữ nguyên dạng text để người dùng gõ dở không bị nhảy số. */
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

export interface NativeOptionsProps {
	value: NativeOptionText;
	onChange: (next: NativeOptionText) => void;
	/** null khi chưa đọc được `info()` — coi như chưa biết, tạm khoá. */
	capabilities: NativeCapabilities | null;
}

interface RowProps {
	id: string;
	label: string;
	/** Property của Apple mà ô này ánh xạ tới. */
	maps: string;
	hint: string;
	placeholder: string;
	value: string;
	disabled: boolean;
	onChange: (next: string) => void;
}

function Row(props: RowProps): JSX.Element {
	return (
		<div className="field">
			<label className="field__label" htmlFor={props.id}>
				{props.label}
			</label>
			<input
				id={props.id}
				className="input"
				type="text"
				spellCheck={false}
				value={props.value}
				placeholder={props.placeholder}
				disabled={props.disabled}
				onChange={function (event) {
					props.onChange(event.target.value);
				}}
			/>
			<span className="field__hint">
				<code>{props.maps}</code> — {props.hint}
			</span>
		</div>
	);
}

/**
 * Truyền thẳng option của `NLLanguageRecognizer` xuống native.
 *
 * Ô nào backend không hỗ trợ thì bị khoá, đọc từ `info().capabilities` chứ không
 * đoán theo `process.platform` — native tự khai nó làm được gì. Trên Windows
 * (ELS) cả hai ô constraints/hints đều khoá, vì ELS chỉ nhận văn bản.
 */
export function NativeOptions(props: NativeOptionsProps): JSX.Element {
	const caps = props.capabilities;
	const value = props.value;

	function set(key: keyof NativeOptionText): (next: string) => void {
		return function (next: string) {
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
		};
	}

	/**
	 * Ô nào backend không hiểu thì nói thẳng lý do. `null` = chưa đọc được
	 * capabilities, khi đó giữ mô tả bình thường chứ đừng vu cho backend.
	 */
	function hintFor(supported: boolean | null | undefined, usable: string): string {
		if (caps && supported === false) return 'backend này không hỗ trợ — ô bị khoá';
		return usable;
	}

	return (
		<div className="options">
			<Row
				id="opt-max-results"
				label="maxResults"
				maps="languageHypotheses(withMaximum:)"
				hint="số giả thuyết tối đa, 1..16. Bỏ trống = không truyền, native xin tối đa."
				placeholder="bỏ trống"
				value={value.maxResults}
				disabled={false}
				onChange={set('maxResults')}
			/>

			<p className="options__group">macOS — Apple NaturalLanguage</p>

			<Row
				id="opt-constraints"
				label="constraints"
				maps="languageConstraints"
				hint={hintFor(
					caps && caps.constraints,
					'thẻ BCP 47, cách nhau bởi dấu phẩy. Ràng buộc MỀM: ngôn ngữ ngoài danh sách vẫn có thể xuất hiện với confidence 0.'
				)}
				placeholder="en, fr, zh-Hant"
				value={value.constraints}
				disabled={!caps || !caps.constraints}
				onChange={set('constraints')}
			/>

			<Row
				id="opt-hints"
				label="hints"
				maps="languageHints"
				hint={hintFor(
					caps && caps.hints,
					'prior dạng thẻ:trọng số, cách nhau bởi dấu phẩy.'
				)}
				placeholder="vi:0.9, en:0.1"
				value={value.hints}
				disabled={!caps || !caps.hints}
				onChange={set('hints')}
			/>

			<p className="options__group">Windows — Extended Linguistic Services</p>

			<Row
				id="opt-input-language"
				label="inputLanguage"
				maps="MAPPING_ENUM_OPTIONS.pszInputLanguage"
				hint={hintFor(
					caps && caps.inputLanguage,
					'thẻ IETF. Lọc DỊCH VỤ chứ không lọc kết quả — khác constraints của Apple.'
				)}
				placeholder="vi"
				value={value.inputLanguage}
				disabled={!caps || !caps.inputLanguage}
				onChange={set('inputLanguage')}
			/>

			<Row
				id="opt-input-script"
				label="inputScript"
				maps="MAPPING_ENUM_OPTIONS.pszInputScript"
				hint={hintFor(
					caps && caps.inputScript,
					'hệ chữ viết của văn bản đầu vào. Cũng lọc dịch vụ.'
				)}
				placeholder="Latn"
				value={value.inputScript}
				disabled={!caps || !caps.inputScript}
				onChange={set('inputScript')}
			/>

			<Row
				id="opt-start-index"
				label="startIndex"
				maps="MappingRecognizeText.dwIndex"
				hint={hintFor(
					caps && caps.startIndex,
					'vị trí ký tự bắt đầu đọc. macOS không có tham số này — tự cắt chuỗi trước khi gọi.'
				)}
				placeholder="0"
				value={value.startIndex}
				disabled={!caps || !caps.startIndex}
				onChange={set('startIndex')}
			/>
		</div>
	);
}
