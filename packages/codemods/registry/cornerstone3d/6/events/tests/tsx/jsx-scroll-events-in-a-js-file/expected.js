import React, { useEffect } from 'react';
import { Enums, eventTarget } from '@cornerstonejs/core';

export function ScrollEnd({ onEnd }) {
  useEffect(() => {
    const listener = ({ detail }) => onEnd(detail.delta);

    eventTarget.addEventListener(Enums.Events.SCROLL_OUT_OF_BOUNDS, listener);

    return () =>
      eventTarget.removeEventListener(
        Enums.Events.SCROLL_OUT_OF_BOUNDS,
        listener
      );
  }, [onEnd]);

  return <span>{Enums.Events.VOLUME_VIEWPORT_SCROLL}</span>;
}
