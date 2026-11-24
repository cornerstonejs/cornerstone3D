import React, { useEffect } from 'react';
import { Enums, eventTarget } from '@cornerstonejs/core';

export function ScrollEndHint({ onEnd }) {
  useEffect(() => {
    const listener = (evt) => onEnd(evt.detail.direction);

    eventTarget.addEventListener(Enums.Events.STACK_SCROLL_OUT_OF_BOUNDS, listener);

    return () =>
      eventTarget.removeEventListener(
        Enums.Events.STACK_SCROLL_OUT_OF_BOUNDS,
        listener
      );
  }, [onEnd]);

  return <div className="scroll-end-hint">{Enums.Events.VOLUME_VIEWPORT_SCROLL}</div>;
}
