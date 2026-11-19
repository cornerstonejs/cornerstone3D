import type { PlanarViewport } from '@cornerstonejs/core';
import { getRenderingEngine } from '@cornerstonejs/core';

function describe(viewportId: string, imageId: string, canvasPoint: number[]) {
  const viewport =
    getRenderingEngine('engine').getViewport<PlanarViewport>(viewportId);

  return {
    bounds: viewport.getBounds(),
    inPlane: viewport.isInAcquisitionPlane(),
    planes: viewport.getSlicesClippingPlanes(),
    pixels: viewport.getCurrentSlicePixelData(),
    display: viewport.getVtkDisplayCoords(canvasPoint),
    uids: viewport.getActorUIDs(),
    volumes: viewport.getAllVolumeIds(),
    first: viewport.getActorByIndex(0),
    firstUid: viewport.getActorUIDByIndex(0),
    image: viewport.getCornerstoneImage(),
    modality: viewport.modality,
    destroyed: viewport.isDisabled,
    index: viewport.getSliceIndexForImage(imageId),
    changeable: viewport.isOrientationChangeable(),
  };
}

console.log(describe);
