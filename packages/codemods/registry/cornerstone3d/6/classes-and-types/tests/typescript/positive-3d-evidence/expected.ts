import type {
  Types,
  VolumeViewport3D,
  PlanarViewport,
} from '@cornerstonejs/core';
import { Enums, RenderingEngine } from '@cornerstonejs/core';

const { ViewportType } = Enums;
const renderingEngine = new RenderingEngine('engine');
const viewportId = 'CT_3D';
const axialId = 'CT_AXIAL';

renderingEngine.setViewports([
  { viewportId, type: ViewportType.VOLUME_3D, element: element1 },
  { viewportId: axialId, type: ViewportType.PLANAR, element: element2 },
]);

const threeD = renderingEngine.getViewport<VolumeViewport3D>(viewportId);
const axial = renderingEngine.getViewport<PlanarViewport>(axialId);

function applyPreset(
  viewport: Types.IViewport,
  viewportType: Enums.ViewportType
) {
  if (viewportType === ViewportType.VOLUME_3D) {
    (viewport as VolumeViewport3D).setProperties({ preset: 'CT-Bone' });
  }
}

function unknownFamily(viewport: PlanarViewport) {
  return viewport;
}

console.log(threeD, axial, applyPreset, unknownFamily);
