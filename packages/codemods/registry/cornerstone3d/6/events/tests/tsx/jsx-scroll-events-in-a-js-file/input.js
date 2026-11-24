import React, { useEffect } from 'react';
import { Enums, eventTarget } from '@cornerstonejs/core';

export function ScrollEnd({ onEnd }) {
  useEffect(() => {
    const listener = ({ detail }) => onEnd(detail.direction);

    eventTarget.addEventListener(Enums.Events.STACK_SCROLL_OUT_OF_BOUNDS, listener);

    return () =>
      eventTarget.removeEventListener(
        Enums.Events.STACK_SCROLL_OUT_OF_BOUNDS,
        listener
      );
  }, [onEnd]);

  return <span>{Enums.Events.VOLUME_VIEWPORT_SCROLL}</span>;
}
