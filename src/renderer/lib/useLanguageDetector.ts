import * as React from 'react';

import {
	AvailabilityStatus,
	DownloadProgressEvent,
	LanguageDetector,
	LanguageDetectorProvider,
	NativeDetectorOptions,
} from '../services/detection/LanguageDetector';

export interface LanguageDetectorState {
	detector: LanguageDetector | null;
	availability: AvailabilityStatus | null;
	/** 0..1 khi đang tải model; null khi không tải. */
	progress: number | null;
	error: string | null;
	/** Cần người dùng bấm để bắt đầu tải model (spec đòi transient activation). */
	needsUserGesture: boolean;
	/** Gọi TỪ TRONG event handler của người dùng, không gọi lúc mount. */
	requestCreate: () => void;
}

/** Tên DOMException mà create() có thể ném, theo spec. */
const ERROR_MESSAGES: { [name: string]: string } = {
	NotAllowedError: 'Blocked — needs a user gesture, or Permissions-Policy is blocking this API.',
	NotSupportedError:
		'The runtime reports a model but cannot download it. Common on Electron: the API ' +
		'exists but Chrome model-download service does not. Use the web build on ' +
		'Chrome/Edge 138+ instead.',
	NetworkError: 'Network error, or the user cancelled the model download.',
	InvalidStateError: 'The document is not ready yet.',
	OperationError: 'Could not create a detection session.',
};

/**
 * Các lỗi mà bấm lại cũng vô ích: runtime không có model thì thử bao nhiêu lần
 * cũng vậy. Đừng mời người dùng bấm nút chỉ để thất bại tiếp.
 */
const FATAL_ERRORS = ['NotSupportedError'];

interface CreateFailure {
	name: string;
	message: string;
	retryable: boolean;
}

function describeError(err: unknown): CreateFailure {
	const asError = err as { name?: string; message?: string } | null;
	const name = asError && asError.name ? asError.name : '';
	const message =
		ERROR_MESSAGES[name] ||
		(asError && asError.message ? asError.message : 'Could not create a detection session.');

	return { name: name, message: message, retryable: FATAL_ERRORS.indexOf(name) === -1 };
}

function toRatio(event: DownloadProgressEvent): number | null {
	if (event.total > 0) return Math.min(1, event.loaded / event.total);
	// Một số bản Chrome phát `loaded` là tỉ lệ 0..1 và để `total` bằng 0.
	if (event.loaded >= 0 && event.loaded <= 1) return event.loaded;
	return null;
}

/**
 * Quản lý vòng đời một session LanguageDetector cho provider đang chọn.
 *
 * Điểm mấu chốt: `create()` cần transient activation khi model chưa tải, nên
 * KHÔNG thể gọi lúc mount. Hook chỉ tự tạo session khi availability đã là
 * 'available'; các trạng thái còn lại phải chờ người dùng bấm (requestCreate).
 */
export function useLanguageDetector(
	provider: LanguageDetectorProvider,
	nativeOptions: NativeDetectorOptions
): LanguageDetectorState {
	// Phụ thuộc bản JSON chứ không phải object: caller dựng object mới mỗi render.
	const nativeKey = JSON.stringify(nativeOptions);
	const [availability, setAvailability] = React.useState<AvailabilityStatus | null>(null);
	const [detector, setDetector] = React.useState<LanguageDetector | null>(null);
	const [progress, setProgress] = React.useState<number | null>(null);
	const [failure, setFailure] = React.useState<CreateFailure | null>(null);
	// Tăng mỗi lần người dùng bấm -> kích hoạt lại effect tạo session.
	const [createAttempt, setCreateAttempt] = React.useState<number>(0);

	// Đổi provider: dọn sạch trạng thái cũ rồi hỏi lại availability.
	React.useEffect(
		function () {
			let alive = true;

			setAvailability(null);
			setDetector(null);
			setProgress(null);
			setFailure(null);
			setCreateAttempt(0);

			provider.availability().then(
				function (status) {
					if (alive) setAvailability(status);
				},
				function () {
					if (alive) setAvailability('unavailable');
				}
			);

			return function () {
				alive = false;
			};
		},
		[provider]
	);

	React.useEffect(
		function () {
			let alive = true;
			let session: LanguageDetector | null = null;

			const isUsable = availability !== null && availability !== 'unavailable';
			// Model sẵn sàng thì tạo luôn; chưa sẵn sàng thì đợi người dùng bấm.
			const shouldCreate = isUsable && (availability === 'available' || createAttempt > 0);

			if (shouldCreate) {
				setFailure(null);

				provider
					.create({
						monitor: function (monitor) {
							monitor.addEventListener('downloadprogress', function (event) {
								if (alive) setProgress(toRatio(event));
							});
						},
						native: JSON.parse(nativeKey) as NativeDetectorOptions,
					})
					.then(
						function (created) {
							if (!alive) {
								created.destroy();
								return;
							}
							session = created;
							setDetector(created);
							setProgress(null);
						},
						function (err) {
							if (!alive) return;
							setProgress(null);
							setFailure(describeError(err));
						}
					);
			}

			return function () {
				alive = false;
				// Session cũ phải đóng khi đổi provider, đổi option, hoặc tạo lại.
				if (session) session.destroy();
			};
		},
		// nativeKey: đổi option native -> dựng lại session để option có hiệu lực.
		[provider, availability, createAttempt, nativeKey]
	);

	const requestCreate = React.useCallback(function () {
		setCreateAttempt(function (attempt) {
			return attempt + 1;
		});
	}, []);

	const needsUserGesture =
		(availability === 'downloadable' || availability === 'downloading') &&
		detector === null &&
		progress === null &&
		// Chưa thử lần nào, hoặc lần trước lỗi nhưng lỗi đó thử lại được.
		(createAttempt === 0 || (failure !== null && failure.retryable));

	return {
		detector: detector,
		availability: availability,
		progress: progress,
		error: failure ? failure.message : null,
		needsUserGesture: needsUserGesture,
		requestCreate: requestCreate,
	};
}
