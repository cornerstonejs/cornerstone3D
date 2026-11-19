import type { PlanarViewport } from '@cornerstonejs/core';
import {
  getRenderingEngine,
  utilities,
  cache,
  Enums,
} from '@cornerstonejs/core';

function describe(viewportId: string, imageId: string, canvasPoint: number[]) {
  const viewport =
    getRenderingEngine('engine').getViewport<PlanarViewport>(viewportId);

  return {
    bounds: viewport.getImageData().imageData.getBounds(),
    inPlane: utilities.isInAcquisitionPlane(viewport),
    planes: utilities.getSlicesClippingPlanes(viewport),
    pixels: utilities.getCurrentVolumeViewportSlice(viewport).scalarData,
    display: utilities.getVtkDisplayCoords(viewport, canvasPoint),
    uids: viewport.getActors().map((entry) => entry.uid),
    volumes: viewport.getActors().map((entry) => entry.referencedId),
    first: viewport.getActors()[0],
    firstUid: viewport.getActors()[0]?.uid,
    image: cache.getImage(viewport.getCurrentImageId()),
    modality: utilities.getViewportModality(viewport),
    destroyed: viewport.isDestroyed,
    index: viewport.getSliceIndexForImage(imageId),
    changeable: (viewport.type === Enums.ViewportType.VOLUME_3D || utilities.viewportIsInVolumeMode(viewport)),
  };
}

console.log(describe);
