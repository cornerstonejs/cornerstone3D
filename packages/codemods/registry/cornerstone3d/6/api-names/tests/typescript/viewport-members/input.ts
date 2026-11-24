import { getEnabledElement, getRenderingEngine } from '@cornerstonejs/core';
import type { PlanarViewport, VolumeViewport3D } from '@cornerstonejs/core';

export function displaySetOfVolume(element: HTMLDivElement, volumeId: string) {
  const { viewport } = getEnabledElement(element);

  return (viewport as PlanarViewport).findDataIdByVolumeId(volumeId);
}

export function displaySetsOfFusion(engineId: string, volumeIds: string[]) {
  const viewport = getRenderingEngine(engineId).getViewport<PlanarViewport>(
    'fusion'
  );

  return volumeIds.map((volumeId) => viewport.findDataIdByVolumeId(volumeId));
}

export function displaySetIn3D(viewport: VolumeViewport3D, volumeId: string) {
  return viewport.findDataIdByVolumeId?.(volumeId) ?? volumeId;
}
