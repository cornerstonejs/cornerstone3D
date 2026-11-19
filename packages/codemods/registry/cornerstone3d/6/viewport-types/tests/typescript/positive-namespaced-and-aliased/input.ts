import * as cornerstone from '@cornerstonejs/core';
import { Enums as csEnums, RenderingEngine } from '@cornerstonejs/core';

const engine = new RenderingEngine('engine');

engine.enableElement({
  viewportId: 'stack',
  element,
  type: cornerstone.Enums.ViewportType.STACK,
});

engine.enableElement({
  viewportId: 'axial',
  element,
  type: csEnums.ViewportType.ORTHOGRAPHIC,
});

export const video = csEnums.ViewportType.VIDEO_NEXT;
export const slide = cornerstone.Enums.ViewportType.WHOLE_SLIDE_NEXT;
