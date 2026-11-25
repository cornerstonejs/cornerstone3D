import * as cornerstone3D from '@cornerstonejs/core';

const { Enums, utilities } = cornerstone3D;
const { ViewportType } = Enums;

export function Viewer({ element, renderingEngine }) {
  renderingEngine.enableElement({
    viewportId: 'CT',
    type: ViewportType.PLANAR,
    defaultOptions: { orientation: cornerstone3D.Enums.OrientationAxis.AXIAL },
    element,
  });

  return <div className="viewport" data-uid={utilities.uuidv4()} />;
}
