import React, { useEffect } from 'react';
import { Enums, eventTarget } from '@cornerstonejs/core';

export function ScrollEndHint({ onEnd }) {
  useEffect(() => {
    const listener = (evt) => onEnd(evt.detail.delta);

    eventTarget.addEventListener(Enums.Events.SCROLL_OUT_OF_BOUNDS, listener);

    return () =>
      eventTarget.removeEventListener(
        Enums.Events.SCROLL_OUT_OF_BOUNDS,
        listener
      );
  }, [onEnd]);

  return <div className="scroll-end-hint">{Enums.Events.VOLUME_VIEWPORT_SCROLL}</div>;
}
