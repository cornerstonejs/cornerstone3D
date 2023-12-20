import { eventTarget } from '@cornerstonejs/core';
import Events from '../enums/Events';
import InterpolationManager from '../utilities/contourROITool/InterpolationManager';

const enable = function (element: HTMLDivElement) {
  eventTarget.addEventListener(
    Events.ANNOTATION_LABEL_CHANGE,
    InterpolationManager.handleAnnotationLabelChange as EventListener
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

const disable = function (element: HTMLDivElement) {
  eventTarget.removeEventListener(
    Events.ANNOTATION_LABEL_CHANGE,
    InterpolationManager.handleAnnotationLabelChange as EventListener
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
