import type { Types } from '@cornerstonejs/core';
import { RenderingEngine, Enums } from '@cornerstonejs/core';

const { ViewportType } = Enums;

const renderingEngine = new RenderingEngine('engine');

const viewportInputArray = [
  {
    viewportId: 'CT_STACK',
    type: ViewportType.PLANAR,
    element: element1,
    defaultOptions: {
      background: [0.2, 0, 0.2] as Types.Point3,
    },
  },
  {
    viewportId: 'CT_SAGITTAL',
    type: ViewportType.PLANAR,
    element: element2,
    defaultOptions: {
      orientation: Enums.OrientationAxis.SAGITTAL,
    },
  },
  {
    viewportId: 'CT_AXIAL',
    type: ViewportType.PLANAR,
    defaultOptions: { orientation: Enums.OrientationAxis.AXIAL },
    element: element3,
  },
  {
    viewportId: 'CT_DEFAULT',
    type: ViewportType.PLANAR,
    element: element4,
    defaultOptions: {
      orientation: Enums.OrientationAxis.AXIAL,
      background: [0, 0, 0] as Types.Point3,
    },
  },
  {
    viewportId: 'NEXT',
    type: ViewportType.PLANAR,
    element: element5,
  },
  {
    viewportId: 'CT_COMMENTED',
    type: ViewportType.PLANAR,
    element: element6,
    defaultOptions: {
      orientation: Enums.OrientationAxis.AXIAL,
      // orientation: Enums.OrientationAxis.SAGITTAL,
    },
  },
];

renderingEngine.setViewports(viewportInputArray);

const viewport = renderingEngine.getViewport('CT_STACK');

if (viewport.type === ViewportType.STACK) {
  console.log('stack');
}

if (viewport.type !== ViewportType.ORTHOGRAPHIC) {
  console.log('not a volume');
}

export const threeD = ViewportType.VOLUME_3D;
