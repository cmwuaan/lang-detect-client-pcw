import * as React from 'react';

import { NativeLanguageHypothesis } from '@shared/ipc';

import { languageName } from '../lib/languageName';

export interface HypothesisMeterProps {
	hypotheses: NativeLanguageHypothesis[];
	/** `info().scoreKind` — 'probability' | 'rank' | … */
	scoreKind: string | null;
}

/**
 * Danh sách giả thuyết kèm thanh độ dài.
 *
 * Vì sao vẽ thanh chứ không chỉ in số: xác suất của Apple trải từ 1 xuống 1e-10,
 * mắt người không so được hai con số như vậy, còn thanh thì thấy ngay "một cái
 * gần như chắc chắn, phần còn lại là nhiễu".
 *
 * Backend chỉ xếp hạng (ELS) thì `confidence` là null — KHÔNG vẽ thanh, hiện
 * `#1 #2 #3`. Vẽ thanh cho một thứ không có điểm là bịa ra độ dài.
 */
export function HypothesisMeter(props: HypothesisMeterProps): JSX.Element {
	const items = props.hypotheses;

	if (items.length === 0) {
		return <p className="field__hint">No hypotheses — the text is too short to call.</p>;
	}

	const isRank = props.scoreKind === 'rank';

	return (
		<div className="meter">
			{items.map(function (item, index) {
				const confidence = item.confidence;
				const hasScore = confidence !== null && confidence !== undefined;
				const name = languageName(item.detectedLanguage);

				return (
					<div className="meter__row" key={item.detectedLanguage + ':' + index}>
						<span className="meter__label">
							<span className="meter__tag">{item.detectedLanguage}</span>
							{name !== item.detectedLanguage ? (
								<span className="meter__name">{name}</span>
							) : null}
						</span>

						{hasScore ? (
							<span className="meter__value">
								{(confidence as number) >= 0.0005
									? (confidence as number).toFixed(3)
									: '~0'}
							</span>
						) : (
							<span className="meter__rank">#{index + 1}</span>
						)}

						{hasScore ? (
							<span className="meter__track">
								<span
									className="meter__fill"
									style={{ width: Math.max(0, Math.min(1, confidence as number)) * 100 + '%' }}
								/>
							</span>
						) : null}
					</div>
				);
			})}

			{isRank ? (
				<p className="field__hint">
					This backend only ranks languages — it returns no score, so there is nothing to
					plot.
				</p>
			) : null}
		</div>
	);
}
