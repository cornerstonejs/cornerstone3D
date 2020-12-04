import { Events as RENDERING_EVENTS, getEnabledElement } from './../../index';
import { SynchronizerManager } from './../store/index';

interface ICameraModifiedEvent {
  target: HTMLElement;
  detail: {
    previousCamera: any;
    camera: any;
    element: HTMLElement; // not really?
  };
}

function onCameraModified(cameraModifiedEvent: ICameraModifiedEvent) {
  const eventData = cameraModifiedEvent.detail;
  const canvasElement = cameraModifiedEvent.target;
  const enabledElement = getEnabledElement(canvasElement);
  const { viewportUID, sceneUID, renderingEngineUID } = enabledElement;

  // Get applicable synchronizers for source
  const synchronizers = SynchronizerManager.getSynchronizers(
    renderingEngineUID,
    sceneUID,
    viewportUID
  );

  // Call it's `fireEvent`
  for (let i = 0; i < synchronizers.length; i++) {
    const synchronizer = synchronizers[i];

    if (synchronizer.fireEvent) {
      const sourceViewport = { renderingEngineUID, sceneUID, viewportUID };

      synchronizer.fireEvent(sourceViewport, cameraModifiedEvent);
    }
  }
}

function enable(element: HTMLElement) {
  element.addEventListener(RENDERING_EVENTS.CAMERA_MODIFIED, onCameraModified);
}
function disable(element) {
  element.removeEventListener(
    RENDERING_EVENTS.CAMERA_MODIFIED,
    onCameraModified
  );
}

export default {
  enable,
  disable,
};
