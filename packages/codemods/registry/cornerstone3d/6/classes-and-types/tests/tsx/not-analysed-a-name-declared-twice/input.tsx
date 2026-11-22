import React from 'react';
import * as cornerstone from '@cornerstonejs/core';
import { StackViewport, utilities } from '@cornerstonejs/core';


export function Panel({ viewport, threeD, properties }) {
  const fresh = new StackViewport({
    id: 'x',
    element: document.createElement('div'),
  });
  const isVolume = viewport instanceof cornerstone.VolumeViewport;
  const generic = utilities.isGenericViewport(viewport);
  const typed = viewport;

  return (
    <div>
      {String(fresh)} {String(isVolume)} {String(generic)} {String(threeD)}{' '}
      {String(typed)}
      {JSON.stringify(properties)}
    </div>
  );
}

export function is3DClass(viewport) {
  return (
    viewport instanceof cornerstone.VolumeViewport3D ||
    viewport instanceof cornerstone.GenericVolumeViewport3D
  );
}

export class Mine extends StackViewport {}

const twice = 1;
const twice = 2;
