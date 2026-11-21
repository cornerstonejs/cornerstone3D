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

export function Viewer({ engine }) {
  return (
    <div data-type={storedLayout} data-engine={engine.id}>
      {String(inputFor)}
    </div>
  );
}

export function getType(kind) {
  if (kind === 'stack') {
    return ViewportType.PLANAR;
  }

  return ViewportType.PLANAR;
}

export function is3D(type) {
  return (
    type === ViewportType.VOLUME_3D || type === ViewportType.VOLUME_3D
  );
}

export const Label = ({ type }) => (
  <span>
    {type === ViewportType.ECG || type === ViewportType.ECG ? 'ECG' : ''}
  </span>
);
