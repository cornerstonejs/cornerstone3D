import * as cs from '@cornerstonejs/core';
import {
  ECGGenericViewport,
  Enums,
  GenericViewport,
  GenericVolumeViewport3D,
  RenderingEngine,
  Types,
  VideoGenericViewport,
  WSIGenericViewport,
  renderingEngineExportsV2,
  utilities,
} from '@cornerstonejs/core';
import type { GenericViewport as BaseClass } from '@cornerstonejs/core';

const { ViewportType } = Enums;
const { isGenericViewport } = utilities;

export class MyViewport extends GenericViewport<object> {}

export function setUp(element: HTMLDivElement) {
  const renderingEngine = new RenderingEngine('engine');

  renderingEngine.enableElement({
    viewportId: 'CT',
    element,
    type: Enums.ViewportType.PLANAR_NEXT,
  });
  renderingEngine.enableElement({
    viewportId: '3D',
    element,
    type: ViewportType.VOLUME_3D_NEXT,
  });

  return [
    Enums.ViewportTypes.VIDEO_NEXT,
    cs.Enums.ViewportType.WHOLE_SLIDE_NEXT,
    ViewportType.ECG_NEXT,
  ];
}

export function classify(viewport: Types.IGenericViewport, base: BaseClass) {
  const typed: cs.Types.IGenericViewport = viewport;

  if (utilities.isGenericViewport(viewport)) {
    return utilities.resolveGenericViewportVolumeId(viewport, 'ct');
  }

  if (isGenericViewport(base)) {
    return cs.utilities.resolveGenericViewportVolumeId(base);
  }

  return [
    viewport instanceof GenericViewport,
    viewport instanceof cs.GenericViewport,
    viewport instanceof GenericVolumeViewport3D,
    viewport instanceof VideoGenericViewport,
    viewport instanceof WSIGenericViewport,
    viewport instanceof ECGGenericViewport,
    renderingEngineExportsV2.PlanarViewport,
    typed,
  ];
}

export { GenericViewport, GenericVolumeViewport3D as Volume3D } from '@cornerstonejs/core';
