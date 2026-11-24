import type { PlanarViewport, Types } from '@cornerstonejs/core';

type FusionViewport = Types.IViewport & {
  findDataIdByVolumeId?(volumeId: string): string | undefined;
};

export class FusionPanel {
  viewport;

  displaySetOf(volumeId: string) {
    return this.viewport.findDataIdByVolumeId(volumeId);
  }
}

export function lookUp(
  planar: PlanarViewport,
  fusion: FusionViewport,
  volumeId: string
) {
  const byKey = planar['getDisplaySetIdForVolumeId'](volumeId);
  const hasLookup = 'getDisplaySetIdForVolumeId' in planar;
  const { getDisplaySetIdForVolumeId: findDataIdByVolumeId } = planar;

  return [byKey, hasLookup, findDataIdByVolumeId, fusion];
}
