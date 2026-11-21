import React from 'react';
import { Enums } from '@cornerstonejs/core';

const { ViewportType } = Enums;

function inputFor(
  viewportInput,
  isStack,
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
      type: isStack ? ViewportType.STACK : ViewportType.ORTHOGRAPHIC,
    },
    {
      viewportId: 'perspective',
      element: document.createElement('div'),
      type: ViewportType.PERSPECTIVE,
    },
    {
      viewportId: 'shorthand',
      element: document.createElement('div'),
      type: ViewportType.ORTHOGRAPHIC,
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

export function Viewer({ engine }) {
  return (
    <div data-type={storedLayout} data-engine={engine.id}>
      {String(inputFor)}
    </div>
  );
}

export function getType(kind) {
  if (kind === 'stack') {
    return ViewportType.STACK;
  }

  return ViewportType.ORTHOGRAPHIC;
}

export function is3D(type) {
  return (
    type === ViewportType.VOLUME_3D || type === ViewportType.VOLUME_3D_NEXT
  );
}

export const Label = ({ type }) => (
  <span>
    {type === ViewportType.ECG || type === ViewportType.ECG_NEXT ? 'ECG' : ''}
  </span>
);

const { ViewportType } = Enums;
