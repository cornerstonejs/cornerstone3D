import React from 'react';
import * as cornerstone from '@cornerstonejs/core';
import { StackViewport, Types, utilities } from '@cornerstonejs/core';

type Props = {
  viewport: cornerstone.Types.IStackViewport;
  threeD: cornerstone.GenericVolumeViewport3D;
  properties: Types.StackViewportProperties;
};

export function Panel({ viewport, threeD, properties }: Props) {
  const fresh = new StackViewport({
    id: 'x',
    element: document.createElement('div'),
  });
  const isVolume = viewport instanceof cornerstone.VolumeViewport;
  const generic = utilities.isGenericViewport(viewport);
  const typed = viewport as StackViewport;

  return (
    <div>
      {String(fresh)} {String(isVolume)} {String(generic)} {String(threeD)}{' '}
      {String(typed)}
      {JSON.stringify(properties)}
    </div>
  );
}
