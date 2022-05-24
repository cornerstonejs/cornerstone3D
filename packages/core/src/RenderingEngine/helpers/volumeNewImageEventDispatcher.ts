import {
  getImageSliceDataForVolumeViewport,
  triggerEvent,
} from '../../utilities';
import { EventTypes, IImageData } from '../../types';
import { Events } from '../../enums';
import { getRenderingEngine } from '../getRenderingEngine';
import VolumeViewport from '../VolumeViewport';

// Keeping track of previous imageIndex for each viewportId
type VolumeImageState = Record<string, number>;

const state: VolumeImageState = {};

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
  cameraEvent: EventTypes.CameraModifiedEvent,
  viewportImageData: IImageData
): void {
  const { renderingEngineId, viewportId } = cameraEvent.detail;
  const renderingEngine = getRenderingEngine(renderingEngineId);
  const viewport = renderingEngine.getViewport(viewportId);

  if (!(viewport instanceof VolumeViewport)) {
    return;
  }

  if (!state[viewport.id]) {
    state[viewport.id] = 0;
  }

  const { numberOfSlices, imageIndex } =
    getImageSliceDataForVolumeViewport(viewport);

  if (state[viewport.id] === imageIndex) {
    return;
  }

  state[viewport.id] = imageIndex;

  const eventDetail: EventTypes.VolumeNewImageEventDetail = {
    imageIndex,
    viewportId,
    renderingEngineId,
    numberOfSlices,
    imageData: viewportImageData.imageData,
  };

  triggerEvent(viewport.element, Events.VOLUME_NEW_IMAGE, eventDetail);
}

export default volumeNewImageEventDispatcher;
