import * as React from 'react';

import {
  AvailabilityStatus,
  LanguageDetectorProvider,
} from '../services/detection/LanguageDetector';

const AVAILABILITY_LABEL: { [K in AvailabilityStatus]: string } = {
  available: 'sẵn sàng',
  downloadable: 'cần tải model',
  downloading: 'đang tải model',
  unavailable: 'không khả dụng',
};

export interface MethodPickerProps {
  providers: LanguageDetectorProvider[];
  activeId: string;
  /** Trạng thái của provider đang chọn; null khi đang kiểm tra. */
  availability: AvailabilityStatus | null;
  onPick: (id: string) => void;
}

/**
 * Đổi implementation đang dùng. UI chỉ biết `LanguageDetectorProvider` —
 * danh sách do container cấp qua resolveAll(), nên thêm phương pháp mới không
 * phải sửa component này.
 */
export function MethodPicker(props: MethodPickerProps): JSX.Element {
  const active = props.providers.filter(function (p) {
    return p.id === props.activeId;
  })[0];

  return (
    <div className="field">
      <span className="field__label">Phương pháp nhận diện</span>
      <div className="u-row">
        {props.providers.map(function (provider) {
          const isActive = provider.id === props.activeId;
          return (
            <button
              key={provider.id}
              type="button"
              className={'button button--chip' + (isActive ? ' is-active' : '')}
              aria-pressed={isActive}
              onClick={function () {
                props.onPick(provider.id);
              }}
            >
              {provider.label}
            </button>
          );
        })}
      </div>
      {active ? (
        <span className="field__hint">
          {active.description}
          {props.availability ? ' · ' + AVAILABILITY_LABEL[props.availability] : ' · đang kiểm tra…'}
        </span>
      ) : null}
    </div>
  );
}
