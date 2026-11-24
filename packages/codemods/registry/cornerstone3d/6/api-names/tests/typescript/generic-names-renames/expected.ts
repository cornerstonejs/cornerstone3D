import * as cs from '@cornerstonejs/core';
import {
  ECGViewport,
  Enums,
  BaseViewport,
  VolumeViewport3D,
  RenderingEngine,
  Types,
  VideoViewport,
  WSIViewport,
  renderingEngineExportsV2,
  utilities,
} from '@cornerstonejs/core';
import type { BaseViewport as BaseClass } from '@cornerstonejs/core';

const { ViewportType } = Enums;
const { isGenericViewport } = utilities;

export class MyViewport extends BaseViewport<object> {}

export function setUp(element: HTMLDivElement) {
  const renderingEngine = new RenderingEngine('engine');

  renderingEngine.enableElement({
    viewportId: 'CT',
    element,
    type: Enums.ViewportType.PLANAR,
  });
  renderingEngine.enableElement({
    viewportId: '3D',
    element,
    type: ViewportType.VOLUME_3D,
  });

  return [
    Enums.ViewportTypes.VIDEO,
    cs.Enums.ViewportType.WHOLE_SLIDE,
    ViewportType.ECG,
  ];
}

export function classify(viewport: Types.IViewport, base: BaseClass) {
  const typed: cs.Types.IViewport = viewport;

  if (utilities.isGenericViewport(viewport)) {
    return utilities.resolveViewportVolumeId(viewport, 'ct');
  }

  if (isGenericViewport(base)) {
    return cs.utilities.resolveViewportVolumeId(base);
  }

  return [
    viewport instanceof BaseViewport,
    viewport instanceof cs.BaseViewport,
    viewport instanceof VolumeViewport3D,
    viewport instanceof VideoViewport,
    viewport instanceof WSIViewport,
    viewport instanceof ECGViewport,
    renderingEngineExportsV2.PlanarViewport,
    typed,
  ];
}

export { BaseViewport as GenericViewport, VolumeViewport3D as Volume3D } from '@cornerstonejs/core';
