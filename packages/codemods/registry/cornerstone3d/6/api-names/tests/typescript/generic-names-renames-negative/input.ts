import { GenericViewport } from './viewports/GenericViewport';
import { Enums } from '@ohif/core';
import type { Types } from '@ohif/core';
import { utilities } from '@cornerstonejs/tools';

enum ViewportType {
  PLANAR_NEXT = 'planarNext',
}

const service = {
  isGenericViewport: (value: unknown) => Boolean(value),
  resolveGenericViewportVolumeId: (value: unknown) => String(value),
};

const renderingEngineExportsV2 = { GenericViewport };

export function run(viewport: Types.IGenericViewport) {
  return [
    new GenericViewport(),
    ViewportType.PLANAR_NEXT,
    Enums.ViewportType.PLANAR_NEXT,
    service.isGenericViewport(viewport),
    service.resolveGenericViewportVolumeId(viewport),
    utilities.isGenericViewport,
    renderingEngineExportsV2.GenericViewport,
  ];
}
