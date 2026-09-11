import * as React from 'react';

import { formatRawJson } from '../lib/rawJson';
import { NativeRawState, RawCall } from '../lib/useNativeRaw';

function render<T>(call: RawCall<T>): string {
	if (call.error !== null) return 'Error: ' + call.error;
	if (call.value === null) return call.pending ? '…' : '(chưa có)';
	// formatRawJson, không phải JSON.stringify: xác suất của Apple nhỏ tới cỡ
	// 1e-10 và dạng mũ trông như lỗi hiển thị. Giá trị giữ nguyên, chỉ đổi cách in.
	return formatRawJson(call.value, '');
}

interface RawEntryProps {
	/** Ký hiệu gọi đúng như trong facade TS, để đối chiếu với index.d.ts. */
	signature: string;
	call: RawCall<unknown>;
}

function RawEntry(props: RawEntryProps): JSX.Element {
	return (
		<div className="log__entry">
			<div className="log__head">
				<code className="log__signature">{props.signature}</code>
				{props.call.pending ? <span className="log__badge">đang gọi…</span> : null}
				{props.call.error !== null ? (
					<span className="log__badge log__badge--error">reject</span>
				) : null}
			</div>
			<pre className="log__body">{render(props.call)}</pre>
		</div>
	);
}

export interface NativeRawLogProps {
	state: NativeRawState;
}

/**
 * Log nguyên trạng những gì facade `nativelibs/zlang` trả về, một khối cho mỗi
 * hàm công khai của nó.
 *
 * Đây KHÔNG phải kết quả đang hiển thị ở trên: phần trên đã đi qua adapter Web
 * API (quy đổi hạng thành số, chèn phần tử 'und'). Chỗ này cố tình bỏ qua adapter
 * để đối chiếu được hai bên — đặc biệt trên Windows, nơi `confidence` thật là
 * `null`.
 */
export function NativeRawLog(props: NativeRawLogProps): JSX.Element {
	const state = props.state;

	if (!state.hasBridge) {
		return (
			<p className="field__hint">
				Bản web không có bridge sang native, nên không có gì để log. Mở bản desktop
				(<code>npm start</code>) để xem kết quả thô của nativelibs/zlang.
			</p>
		);
	}

	return (
		<div className="log">
			<RawEntry signature="zlang.info()" call={state.info} />
			<RawEntry signature="zlang.availability()" call={state.availability} />
			<RawEntry signature="zlang.detect({ text })" call={state.detect} />
		</div>
	);
}
