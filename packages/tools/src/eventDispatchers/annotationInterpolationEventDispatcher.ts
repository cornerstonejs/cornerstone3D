import { eventTarget } from '@cornerstonejs/core';
import Events from '../enums/Events';
import InterpolationManager from '../utilities/segmentation/InterpolationManager/InterpolationManager';

/**
 * The enable and disable add/remove the event listeners that dispatch the
 * required events to the interpolation manager.
 */
const enable = function () {
  eventTarget.addEventListener(
    Events.ANNOTATION_COMPLETED,
    InterpolationManager.handleAnnotationCompleted as EventListener
  );
  eventTarget.addEventListener(
    Events.ANNOTATION_MODIFIED,
    InterpolationManager.handleAnnotationUpdate as EventListener
  );
  eventTarget.addEventListener(
    Events.ANNOTATION_REMOVED,
    InterpolationManager.handleAnnotationDelete as EventListener
  );
};

const disable = function () {
  eventTarget.removeEventListener(
    Events.ANNOTATION_COMPLETED,
    InterpolationManager.handleAnnotationCompleted as EventListener
  );
  eventTarget.removeEventListener(
    Events.ANNOTATION_MODIFIED,
    InterpolationManager.handleAnnotationUpdate as EventListener
  );
  eventTarget.removeEventListener(
    Events.ANNOTATION_REMOVED,
    InterpolationManager.handleAnnotationDelete as EventListener
  );
};

export default {
  enable,
  disable,
};
