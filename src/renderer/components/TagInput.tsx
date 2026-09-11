import * as React from 'react';

export interface TagInputProps {
	id: string;
	/** Comma-separated value, kept as-is so the parent state shape never changed. */
	value: string;
	onChange: (next: string) => void;
	placeholder: string;
	disabled: boolean;
}

function split(value: string): string[] {
	return value
		.split(',')
		.map(function (part) {
			return part.trim();
		})
		.filter(function (part) {
			return part.length > 0;
		});
}

/**
 * Nhập nhiều giá trị bằng chip xoá được.
 *
 * Vì sao không để nguyên một ô text: chuỗi `'en, fr, zh-Hant'` bắt người dùng
 * tự quản lý dấu phẩy, và muốn bỏ một thẻ ở giữa thì phải chỉnh tay cả dấu
 * phân cách. Chip thì mỗi giá trị là một đối tượng bấm × là xong.
 *
 * State vẫn là chuỗi ghép bằng dấu phẩy — đúng hình dạng cũ, nên tầng parse ở
 * lib/nativeOptionText.ts không phải đổi gì.
 */
export function TagInput(props: TagInputProps): JSX.Element {
	const [draft, setDraft] = React.useState<string>('');
	const tags = split(props.value);

	function commit(raw: string): void {
		const next = raw.trim();
		// Trùng thì bỏ qua: gửi thẻ lặp xuống native không thêm thông tin gì.
		if (!next || tags.indexOf(next) !== -1) {
			setDraft('');
			return;
		}
		props.onChange(tags.concat([next]).join(', '));
		setDraft('');
	}

	function removeAt(index: number): void {
		props.onChange(
			tags
				.filter(function (_tag, i) {
					return i !== index;
				})
				.join(', ')
		);
	}

	function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
		// Enter/Tab/dấu phẩy đều chốt một thẻ — ba thói quen phổ biến, đỡ phải đoán.
		if (event.key === 'Enter' || event.key === ',' || event.key === 'Tab') {
			if (!draft.trim()) return;
			event.preventDefault();
			commit(draft);
			return;
		}
		// Backspace ở ô rỗng xoá thẻ cuối, giống mọi ô nhập tag khác.
		if (event.key === 'Backspace' && draft === '' && tags.length > 0) {
			event.preventDefault();
			removeAt(tags.length - 1);
		}
	}

	return (
		<div className={'tags' + (props.disabled ? ' is-disabled' : '')}>
			{tags.map(function (tag, index) {
				return (
					<span className="tags__chip" key={tag}>
						{tag}
						<button
							type="button"
							className="tags__remove"
							aria-label={'Remove ' + tag}
							disabled={props.disabled}
							onClick={function () {
								removeAt(index);
							}}
						>
							×
						</button>
					</span>
				);
			})}
			<input
				id={props.id}
				className="tags__input"
				type="text"
				spellCheck={false}
				autoComplete="off"
				value={draft}
				placeholder={tags.length === 0 ? props.placeholder : ''}
				disabled={props.disabled}
				onChange={function (event) {
					setDraft(event.target.value);
				}}
				onKeyDown={onKeyDown}
				// Rời ô mà còn chữ dở thì chốt luôn, đừng âm thầm vứt đi.
				onBlur={function () {
					if (draft.trim()) commit(draft);
				}}
			/>
		</div>
	);
}
