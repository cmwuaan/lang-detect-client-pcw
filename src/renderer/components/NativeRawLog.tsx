import * as React from 'react';

import { formatRawJson } from '../lib/rawJson';
import { NativeRawState, RawCall } from '../lib/useNativeRaw';

function render<T>(call: RawCall<T>): string {
	if (call.error !== null) return 'Error: ' + call.error;
	if (call.value === null) return call.pending ? '…' : '(nothing yet)';
	// formatRawJson, không phải JSON.stringify: xác suất của Apple nhỏ tới cỡ
	// 1e-10 và dạng mũ trông như lỗi hiển thị. Giá trị giữ nguyên, chỉ đổi cách in.
	return formatRawJson(call.value, '');
}

type TabKey = 'detect' | 'info' | 'availability';

const TABS: Array<{ key: TabKey; signature: string }> = [
	{ key: 'detect', signature: 'detect()' },
	{ key: 'info', signature: 'info()' },
	{ key: 'availability', signature: 'availability()' },
];

export interface NativeRawLogProps {
	state: NativeRawState;
}

/**
 * Raw output of the `nativelibs/zlang` facade, one tab per public function.
 *
 * Trước đây ba khối JSON xếp dọc chiếm gần hết chiều cao cột phải. Tabs giữ
 * nguyên lượng thông tin nhưng chỉ hiện một khối — `detect()` mặc định vì nó là
 * cái đổi theo từng lần gõ.
 *
 * Đây KHÔNG phải kết quả hiển thị ở trên: phần trên đã qua adapter Web API (quy
 * đổi hạng thành số, chèn phần tử 'und'). Chỗ này cố tình bỏ qua adapter để đối
 * chiếu được hai bên.
 */
export function NativeRawLog(props: NativeRawLogProps): JSX.Element {
	const state = props.state;
	const [active, setActive] = React.useState<TabKey>('detect');

	if (!state.hasBridge) {
		return (
			<p className="field__hint">
				The web build has no bridge to native, so there is nothing to log. Run the desktop
				build (<code>npm start</code>) to see raw nativelibs/zlang output.
			</p>
		);
	}

	const call: RawCall<unknown> = state[active];

	return (
		<div className="log">
			<div className="tabs" role="tablist">
				{TABS.map(function (tab) {
					const isActive = tab.key === active;
					const entry: RawCall<unknown> = state[tab.key];
					return (
						<button
							key={tab.key}
							type="button"
							role="tab"
							aria-selected={isActive}
							className={'tabs__tab' + (isActive ? ' is-active' : '')}
							onClick={function () {
								setActive(tab.key);
							}}
						>
							{tab.signature}
							{/* Chấm báo lỗi ngay trên tab: không phải mở từng tab mới biết
							    cái nào đang reject. */}
							{entry.error !== null ? (
								<span className="tabs__dot" aria-label="rejected" />
							) : null}
						</button>
					);
				})}
			</div>

			<pre className="log__body" role="tabpanel">
				{render(call)}
			</pre>
		</div>
	);
}
