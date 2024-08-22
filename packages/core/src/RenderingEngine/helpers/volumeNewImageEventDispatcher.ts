import getImageSliceDataForVolumeViewport from '../../utilities/getImageSliceDataForVolumeViewport';
import triggerEvent from '../../utilities/triggerEvent';
import type { EventTypes, IVolumeViewport } from '../../types';
import { Events } from '../../enums';
import { getRenderingEngine } from '../getRenderingEngine';

// Keeping track of previous imageIndex for each viewportId
type VolumeImageState = Record<string, number>;

const state: VolumeImageState = {};

export function resetVolumeNewImageState(viewportId: string): void {
  if (state[viewportId] !== undefined) {
    delete state[viewportId];
  }
}

/**
 * It captures the camera modified event and with the camera focal point and viewPlaneNomad
 * it calculates the image index in the view direction. Finally it triggers
 * a VOLUME_NEW_IMAGE event with the image index.
 *
 * @internal
 *
 * @param cameraEvent - The camera modified event
 * @param viewportImageData - The image data of the viewport
 */
function volumeNewImageEventDispatcher(
  cameraEvent: EventTypes.CameraModifiedEvent
): void {
  const { renderingEngineId, viewportId } = cameraEvent.detail;
  const renderingEngine = getRenderingEngine(renderingEngineId);
  const viewport = renderingEngine.getViewport(viewportId);

  if (!('setVolumes' in viewport)) {
    throw new Error(
      `volumeNewImageEventDispatcher: viewport does not have setVolumes method`
    );
  }

  if (state[viewport.id] === undefined) {
    state[viewport.id] = 0;
  }

  const sliceData = getImageSliceDataForVolumeViewport(
    viewport as IVolumeViewport
  );

  if (!sliceData) {
    console.warn(
      `volumeNewImageEventDispatcher: sliceData is undefined for viewport ${viewport.id}`
    );
    return;
  }

  const { numberOfSlices, imageIndex } = sliceData;

  if (state[viewport.id] === imageIndex) {
    return;
  }

  state[viewport.id] = imageIndex;

  const eventDetail: EventTypes.VolumeNewImageEventDetail = {
    imageIndex,
    viewportId,
    renderingEngineId,
    numberOfSlices,
  };

  triggerEvent(viewport.element, Events.VOLUME_NEW_IMAGE, eventDetail);
}

export default volumeNewImageEventDispatcher;
