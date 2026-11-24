import React, { useEffect, useState } from 'react';
import { Enums } from '@cornerstonejs/core';

export function SliceCounter({ element, onNewDisplaySet }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const onNewImage = (evt) => setIndex(evt.detail.sliceIndex);

    element.addEventListener(Enums.Events.NEW_IMAGE, onNewImage);
    element.addEventListener(
      Enums.Events.DISPLAY_SETS_CHANGED,
      onNewDisplaySet
    );

    return () => {
      element.removeEventListener(Enums.Events.NEW_IMAGE, onNewImage);
      element.removeEventListener(
        Enums.Events.DISPLAY_SETS_CHANGED,
        onNewDisplaySet
      );
    };
  }, [element, onNewDisplaySet]);

  return <div className="slice">{index + 1}</div>;
}
