import * as React from 'react';

import { SAMPLES } from '../lib/samples';

export interface SampleChipsProps {
	onPick: (text: string) => void;
	/**
	 * Thẻ BCP 47 mà engine đang chạy kết luận được.
	 *
	 * `undefined` = KHÔNG BIẾT (provider native không khai được tập ngôn ngữ của
	 * model OS), khi đó mở tất cả. Khoá mẫu dựa trên một danh sách mình không có
	 * thì chỉ là đoán, mà đoán sai ở đây là chặn nhầm thứ vốn chạy được.
	 */
	supportedLanguages?: string[];
}

/**
 * Mẫu bấm nhanh. Mẫu thuộc ngôn ngữ engine không hỗ trợ thì **khoá chứ không
 * ẩn**: vẫn thấy nó tồn tại và biết giới hạn nằm ở đâu, thay vì tưởng engine
 * nhận mọi thứ rồi tự hỏi sao kết quả sai.
 */
export function SampleChips(props: SampleChipsProps): JSX.Element {
	const onPick = props.onPick;
	const supported = props.supportedLanguages;

	return (
		<div className="u-row">
			{SAMPLES.map(function (sample) {
				const isSupported = !supported || supported.indexOf(sample.lang) !== -1;

				return (
					<button
						key={sample.label}
						type="button"
						className={'button button--chip' + (isSupported ? '' : ' is-unsupported')}
						disabled={!isSupported}
						// Nói thẳng lý do bị khoá, đừng để người dùng tự đoán.
						title={
							isSupported
								? undefined
								: sample.label + ' is not supported by this engine — see "Why only these four?"'
						}
						onClick={function () {
							onPick(sample.text);
						}}
					>
						{sample.label}
					</button>
				);
			})}
		</div>
	);
}
