import React, { useEffect, useState } from 'react';
import { Enums } from '@cornerstonejs/core';

export function SliceCounter({ element, onNewDisplaySet }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const onNewImage = (evt) => setIndex(evt.detail.imageIdIndex);

    element.addEventListener(Enums.Events.STACK_NEW_IMAGE, onNewImage);
    element.addEventListener(
      Enums.Events.VOLUME_VIEWPORT_NEW_VOLUME,
      onNewDisplaySet
    );

    return () => {
      element.removeEventListener(Enums.Events.STACK_NEW_IMAGE, onNewImage);
      element.removeEventListener(
        Enums.Events.VOLUME_VIEWPORT_NEW_VOLUME,
        onNewDisplaySet
      );
    };
  }, [element, onNewDisplaySet]);

  return <div className="slice">{index + 1}</div>;
}
