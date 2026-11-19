import * as cornerstone from '@cornerstonejs/core';
import { Enums as csEnums, RenderingEngine } from '@cornerstonejs/core';

const engine = new RenderingEngine('engine');

engine.enableElement({
  viewportId: 'stack',
  element,
  type: cornerstone.Enums.ViewportType.PLANAR,
});

engine.enableElement({
  viewportId: 'axial',
  element,
  type: csEnums.ViewportType.PLANAR,
  defaultOptions: { orientation: csEnums.OrientationAxis.AXIAL },
});

export const video = csEnums.ViewportType.VIDEO;
export const slide = cornerstone.Enums.ViewportType.WHOLE_SLIDE;
