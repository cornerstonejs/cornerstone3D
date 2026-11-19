import React from 'react';
import { Enums, RenderingEngine } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

const { ViewportType } = Enums;

function inputFor(
  viewportInput: Types.PublicViewportInput,
  isStack: boolean,
  options
) {
  if (viewportInput.type === ViewportType.STACK) {
    return viewportInput;
  }

  switch (viewportInput.type) {
    case ViewportType.ORTHOGRAPHIC:
      return viewportInput;
    default:
      break;
  }

  return [
    {
      viewportId: 'conditional',
      element: document.createElement('div'),
      type: isStack ? ViewportType.PLANAR : ViewportType.PLANAR,
    },
    {
      viewportId: 'perspective',
      element: document.createElement('div'),
      type: ViewportType.PERSPECTIVE,
    },
    {
      viewportId: 'shorthand',
      element: document.createElement('div'),
      type: ViewportType.PLANAR,
      defaultOptions,
    },
    {
      viewportId: 'stretched',
      element: document.createElement('div'),
      type: 'perspective',
      defaultOptions: { displayArea: options.displayArea },
    },
  ];
}

const storedLayout = 'planarNext';

export function Viewer({ engine }: { engine: RenderingEngine }) {
  return (
    <div data-type={storedLayout} data-engine={engine.id}>
      {String(inputFor)}
    </div>
  );
}
