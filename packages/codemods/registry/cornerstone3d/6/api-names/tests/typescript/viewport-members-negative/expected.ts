import type { PlanarViewport } from '@cornerstonejs/core';

class VolumeIndex {
  findDataIdByVolumeId(volumeId: string): string {
    return `index:${volumeId}`;
  }
}

const volumeIndex = new VolumeIndex();
const store = { findDataIdByVolumeId: (volumeId: string) => volumeId };

export function lookUp(viewport: PlanarViewport, volumeId: string) {
  return [
    volumeIndex.findDataIdByVolumeId(volumeId),
    store.findDataIdByVolumeId(volumeId),
    viewport.getDisplaySetIdForVolumeId(volumeId),
    viewport.getVolumeIds(),
    viewport.getScalarRange(),
    viewport.isInAcquisitionPlane(),
  ];
}
