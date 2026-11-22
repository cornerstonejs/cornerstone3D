import React from 'react';
import * as cornerstone from '@cornerstonejs/core';
import { getUseGenericViewport, setUseCPURendering } from '@cornerstonejs/core';

cornerstone.setUseCPURendering(true);
cornerstone.init({
  rendering: { useCPURendering: true, planar: { sliceFirst: false } },
});

export function Toggle() {
  const handlers = [setUseCPURendering];

  return (
    <button onClick={() => setUseCPURendering(true, false)}>
      {String(getUseGenericViewport())} {handlers.length}
    </button>
  );
}
