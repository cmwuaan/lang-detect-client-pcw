import * as React from 'react';

import { MethodPicker } from './components/MethodPicker';
import { SampleChips } from './components/SampleChips';
import { ThemeToggle } from './components/ThemeToggle';
import { languageName } from './lib/languageName';
import { SAMPLES } from './lib/samples';
import { useDebouncedValue } from './lib/useDebouncedValue';
import {
  AvailabilityStatus,
  LanguageDetectionResult,
  LanguageDetector,
  LanguageDetectorProvider,
} from './services/detection/LanguageDetector';
import { IPlatformService, PlatformInfo } from './services/platform/IPlatformService';

/** Đủ ngắn để còn cảm giác tức thời, đủ dài để kết quả không nhấp nháy từng phím. */
const DETECT_DEBOUNCE_MS = 200;

export interface AppProps {
  /** Mọi implementation đăng ký dưới token LanguageDetectorProvider. */
  providers: LanguageDetectorProvider[];
  platform: IPlatformService;
}

export function App(props: AppProps): JSX.Element {
  const providers = props.providers;
  const platform = props.platform;

  const [text, setText] = React.useState<string>(SAMPLES[0].text);
  const [providerId, setProviderId] = React.useState<string>(providers[0].id);
  const [info, setInfo] = React.useState<PlatformInfo | null>(null);

  const [detector, setDetector] = React.useState<LanguageDetector | null>(null);
  const [availability, setAvailability] = React.useState<AvailabilityStatus | null>(null);
  const [results, setResults] = React.useState<LanguageDetectionResult[] | null>(null);

  React.useEffect(function () {
    let alive = true;
    void platform.getInfo().then(function (next) {
      if (alive) setInfo(next);
    });
    return function () {
      alive = false;
    };
  }, [platform]);

  const provider = React.useMemo(function () {
    const found = providers.filter(function (p) {
      return p.id === providerId;
    })[0];
    return found || providers[0];
  }, [providers, providerId]);

  // Mỗi provider tạo ra một session; đổi provider thì session cũ phải destroy().
  React.useEffect(function () {
    let alive = true;
    let session: LanguageDetector | null = null;

    setDetector(null);
    setResults(null);
    setAvailability(null);

    void provider.availability().then(function (status) {
      if (alive) setAvailability(status);
    });

    provider.create().then(
      function (created) {
        if (!alive) {
          created.destroy();
          return;
        }
        session = created;
        setDetector(created);
      },
      function () {
        // create() thất bại (ví dụ trình duyệt không có Web API) -> để null,
        // availability() ở trên đã nói rõ lý do.
        if (alive) setDetector(null);
      }
    );

    return function () {
      alive = false;
      if (session) session.destroy();
    };
  }, [provider]);

  // Chỉ văn bản bị debounce; đổi provider thì chạy lại ngay.
  const detectText = useDebouncedValue(text, DETECT_DEBOUNCE_MS);

  React.useEffect(function () {
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
  }, [detector, detectText]);

  // Đang chờ: còn gõ, chưa có session, hoặc detect() chưa trả về.
  const isPending = detectText !== text || !detector || results === null;
  const top = results && results.length > 0 ? results[0] : null;

  return (
    <main className="shell">
      <header className="shell__header">
        <div>
          <h1>Lang Detect</h1>
          <p className="shell__tagline">
            Nhận diện ngôn ngữ ngoại tuyến — cùng một bundle chạy cả web và desktop
          </p>
        </div>
        <div className="u-row">
          <ThemeToggle />
          <span className={'badge' + (platform.isDesktop ? ' badge--desktop' : '')}>
            <span className="badge__dot" aria-hidden="true" />
            {info ? info.label : '…'}
          </span>
        </div>
      </header>

      <section className="card">
        <div className="field">
          <div className="field__header">
            <label className="field__label" htmlFor="input-text">
              Văn bản cần nhận diện
            </label>
            {/* Kết quả nằm ngay cạnh label. aria-live vì nó tự đổi khi gõ. */}
            <span
              className="field__result"
              aria-live="polite"
              aria-atomic="true"
              aria-busy={isPending}
              title={top ? 'Độ tin cậy ' + Math.round(top.confidence * 100) + '%' : undefined}
            >
              {isPending ? '…' : top ? languageName(top.detectedLanguage) : '—'}
            </span>
          </div>
          <textarea
            id="input-text"
            className="textarea"
            value={text}
            spellCheck={false}
            placeholder="Dán hoặc gõ văn bản vào đây…"
            onChange={function (event) {
              setText(event.target.value);
            }}
          />
          <span className="field__hint">{text.length} ký tự</span>
        </div>
        <SampleChips onPick={setText} />
      </section>

      <section className="card">
        <MethodPicker
          providers={providers}
          activeId={provider.id}
          availability={availability}
          onPick={setProviderId}
        />
      </section>

      <section className="card">
        <h2 className="card__title">Môi trường thực thi</h2>
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
          <p className="field__hint">Đang đọc thông tin platform…</p>
        )}
      </section>

      <footer className="shell__footer">
        {providers.length} provider đăng ký trong container · đang dùng{' '}
        <code>{provider.id}</code>
      </footer>
    </main>
  );
}
