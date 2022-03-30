import { eventTarget, getRenderingEngine } from '@cornerstonejs/core';
import Events from '../enums/Events';
import triggerAnnotationRenderForViewportIds from '../utilities/triggerAnnotationRenderForViewportIds';
import { AnnotationModifiedEventType } from '../types/EventTypes';

/**
 * This is a callback function that is called when an annotation is modified.
 * Since we are throttling the cachedStats calculation for annotation tools,
 * we need to trigger a final render for the annotation. so that the annotation
 * textBox is updated.
 * Todo: This will trigger all the annotation tools to re-render, although DOM
 * will update those that have changed, but more efficient would be to only
 * update the changed annotation.
 * Todo: A better way is to extract the textBox render logic from the renderAnnotation
 * of all tools and just trigger a render for that (instead of the entire annotation., even if
 * no svg update happens since the attributes for handles are the same)
 */
const onAnnotationModified = function (evt: AnnotationModifiedEventType) {
  const { viewportId, renderingEngineId } = evt.detail;
  const renderingEngine = getRenderingEngine(renderingEngineId);
  triggerAnnotationRenderForViewportIds(renderingEngine, [viewportId]);
};

const enable = function () {
  eventTarget.addEventListener(
    Events.ANNOTATION_MODIFIED,
    onAnnotationModified
  );
};

const disable = function () {
  eventTarget.removeEventListener(
    Events.ANNOTATION_MODIFIED,
    onAnnotationModified
  );
};

export default {
  enable,
  disable,
};
