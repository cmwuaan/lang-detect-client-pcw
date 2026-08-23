import * as React from 'react';

import { SAMPLES } from '../lib/samples';

export interface SampleChipsProps {
  onPick: (text: string) => void;
}

export function SampleChips(props: SampleChipsProps): JSX.Element {
  const onPick = props.onPick;
  return (
    <div className="u-row">
      {SAMPLES.map(function (sample) {
        return (
          <button
            key={sample.label}
            type="button"
            className="button button--chip"
            onClick={function () { onPick(sample.text); }}
          >
            {sample.label}
          </button>
        );
      })}
    </div>
  );
}
